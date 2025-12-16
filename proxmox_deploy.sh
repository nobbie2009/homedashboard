#!/bin/bash

# Configuration
APP_REPO="https://github.com/nobbie2009/homedashboard.git"
APP_DIR="/opt/homedashboard"
HOSTNAME="homedashboard-pi"
MEMORY=2048
CORES=2
DISK="8G"
STORAGE="local-lvm" # Default for many Proxmox installs, typically supported
BRIDGE="vmbr0"
NET_IP="dhcp"

# Function to get next free ID
function get_next_id() {
    pvesh get /cluster/nextid --output-format text
}

CT_ID=$(get_next_id)
echo "Detected next available Container ID: $CT_ID"
read -p "Press Enter to use $CT_ID or type a new ID: " user_id
if [ -n "$user_id" ]; then
    CT_ID=$user_id
fi

read -p "Enter a password for the container root user: " -s CT_PASSWORD
echo ""

echo "=== Step 1: Template Selection ==="
# Find latest Debian 12 template
echo "Updating template list..."
pveam update > /dev/null
TEMPLATE=$(pveam available --section system | grep "debian-12-standard" | sort | tail -n 1 | awk '{print $2}')

if [ -z "$TEMPLATE" ]; then
    echo "Error: Could not find a Debian 12 standard template."
    exit 1
fi

echo "Selected template: $TEMPLATE"

# Download if not exists
if ! pveam list local | grep -q "$TEMPLATE"; then
    echo "Downloading template to local storage..."
    pveam download local "$TEMPLATE"
fi

echo "=== Step 2: Creating LXC Container $CT_ID ==="
pct create $CT_ID local:vztmpl/$TEMPLATE \
    --hostname $HOSTNAME \
    --memory $MEMORY \
    --cores $CORES \
    --net0 name=eth0,bridge=$BRIDGE,ip=$NET_IP \
    --storage $STORAGE \
    --password "$CT_PASSWORD" \
    --features nesting=1,keyctl=1 \
    --unprivileged 1 \
    --start 1

echo "Container started. Waiting 10 seconds for network..."
sleep 10

echo "=== Step 3: Setting up Environment inside Container ==="
# Update and install dependencies
pct exec $CT_ID -- bash -c "apt-get update && apt-get install -y curl git"

# Install Docker
echo "Installing Docker..."
pct exec $CT_ID -- bash -c "curl -fsSL https://get.docker.com | sh"

echo "=== Step 4: Deploying Application ==="
# Clone Repo
pct exec $CT_ID -- bash -c "git clone $APP_REPO $APP_DIR"

# Run Compose
echo "Starting Docker Compose..."
pct exec $CT_ID -- bash -c "cd $APP_DIR && docker compose up -d"

echo "=== Deployment Complete! ==="
echo "Container ID: $CT_ID"
echo "Hostname: $HOSTNAME"
echo "You can find the IP address using: pct exec $CT_ID -- ip a"
