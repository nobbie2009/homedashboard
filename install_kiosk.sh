#!/bin/bash

# RPi Kiosk Setup Script
# Features:
# - Install Chromium & Unclutter (if needed)
# - Prompt for System Update
# - Configure Autostart (Kiosk mode, no mouse)
# - No Rotation (Standard)
# - Remove Keyrings
# - Schedule Daily Reboot

set -e

# Core Configuration
USER_HOME=$(getent passwd $SUDO_USER | cut -d: -f6)
USER_NAME=$SUDO_USER

if [ -z "$USER_NAME" ]; then
    echo "This script must be run with sudo."
    exit 1
fi

echo "=== RPi Kiosk Setup ==="

# 1. System Update Prompt
echo ""
read -p "Run system update & upgrade (recommended for fresh install)? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "--> Updating system..."
    apt-get update
    apt-get upgrade -y
else
    echo "--> Skipping system update."
fi

# 2. Check & Install Dependencies
echo "--> Checking dependencies..."

# Check for Chromium
if ! command -v chromium &> /dev/null; then
    echo "Chromium not found. Installing 'chromium'..."
    apt-get install -y chromium
else
    echo "Chromium is already installed."
fi

# Always ensure helpers are installed
echo "--> Installing/Verifying 'unclutter' and 'sed'..."
apt-get install -y unclutter sed

# 3. Configuration Prompts
echo ""
read -p "Enter the Dashboard URL/IP (e.g. http://192.168.1.10:8080): " DASHBOARD_URL
read -p "Enter daily reboot time (HH:MM, e.g. 04:00): " REBOOT_TIME

# 4. Configure Autostart
echo "--> Configuring Autostart..."
AUTOSTART_DIR="$USER_HOME/.config/lxsession/LXDE-pi"
AUTOSTART_FILE="$AUTOSTART_DIR/autostart"

if [ ! -d "$AUTOSTART_DIR" ]; then
    mkdir -p "$AUTOSTART_DIR"
fi

# Create autostart file content
# chromium command used without -browser as requested and verified by package name
cat > "$AUTOSTART_FILE" << EOF
@lxpanel --profile LXDE-pi
@pcmanfm --desktop --profile LXDE-pi
@xscreensaver -no-splash
@xset s off
@xset -dpms
@xset s noblank
@unclutter -idle 0.1 -root
@chromium --noerrdialogs --disable-infobars --kiosk $DASHBOARD_URL --check-for-update-interval=31536000
EOF

chown -R $USER_NAME:$USER_NAME "$USER_HOME/.config"

# 5. Handle Keyrings
echo "--> Removing Keyrings..."
rm -rf "$USER_HOME/.local/share/keyrings"

# 6. Configure Auto Reboot
echo "--> Configuring Auto Reboot at $REBOOT_TIME..."
# Split HH and MM
RebootH=$(echo $REBOOT_TIME | cut -d: -f1)
RebootM=$(echo $REBOOT_TIME | cut -d: -f2)

# Remove existing reboot jobs from root crontab to avoid duplicates
crontab -l | grep -v "sbin/shutdown -r" | crontab -

# Add new job
(crontab -l 2>/dev/null; echo "$RebootM $RebootH * * * /sbin/shutdown -r now") | crontab -

# 7. Final cleanup
echo "--> Setup Complete!"
echo "    Target URL: $DASHBOARD_URL"
echo "    Reboot Time: $REBOOT_TIME"
echo "    Please reboot strictly manually now to apply changes."
