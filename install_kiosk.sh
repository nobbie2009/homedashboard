#!/bin/bash

# RPi Kiosk Setup Script
# Features:
# - Install Chromium & Unclutter (if needed)
# - Prompt for System Update
# - Configure Autostart via XDG .desktop (Compatible with X11/Wayland/Bookworm/Trixie)
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

echo "=== RPi Kiosk Setup (Trixie/Bookworm Ready) ==="

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

# 4. Configure Autostart (XDG Method)
echo "--> Configuring Autostart..."

STARTSCRIPT="$USER_HOME/start_kiosk.sh"
AUTOSTART_DIR="$USER_HOME/.config/autostart"
DESKTOP_FILE="$AUTOSTART_DIR/kiosk.desktop"

# Create the startup script
echo "--> Creating startup script: $STARTSCRIPT"
cat > "$STARTSCRIPT" << EOF
#!/bin/bash

# Disable screen blanking and power management
xset s off
xset -dpms
xset s noblank

# Hide mouse cursor
unclutter -idle 0.1 -root &

# Start Chromium in Kiosk mode
# --no-first-run: Skip first run wizards
# --kiosk: Fullscreen kiosk mode
# --noerrdialogs: Suppress error dialogs
# --disable-infobars: Remove "Chrome is being controlled by..."
# --check-for-update-interval: massive interval to stop update checks
chromium --no-first-run --noerrdialogs --disable-infobars --kiosk --password-store=basic "$DASHBOARD_URL" --check-for-update-interval=31536000
EOF

# Make startup script executable and owned by user
chmod +x "$STARTSCRIPT"
chown $USER_NAME:$USER_NAME "$STARTSCRIPT"

# Create Autostart Directory
if [ ! -d "$AUTOSTART_DIR" ]; then
    mkdir -p "$AUTOSTART_DIR"
    chown $USER_NAME:$USER_NAME "$USER_HOME/.config"
    chown $USER_NAME:$USER_NAME "$AUTOSTART_DIR"
fi

# Create .desktop file for Autostart
echo "--> Creating autostart entry: $DESKTOP_FILE"
cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Type=Application
Name=Kiosk
Exec=$STARTSCRIPT
X-GNOME-Autostart-enabled=true
Hidden=false
EOF

chown $USER_NAME:$USER_NAME "$DESKTOP_FILE"

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
echo "    Startup Script: $STARTSCRIPT"
echo "    Please reboot strictly manually now to apply changes."
