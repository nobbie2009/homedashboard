#!/bin/bash
#
# Installiert den WiFi-Watchdog (Skript + Systemd-Timer) auf einem
# Raspberry Pi (oder einem anderen Debian/Ubuntu-System mit systemd).
#
# Aufruf:  sudo ./install.sh
#

set -e

if [ "$EUID" -ne 0 ]; then
    echo "Bitte mit sudo ausführen."
    exit 1
fi

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "--> Installiere wifi-watchdog.sh nach /usr/local/bin/"
install -m 0755 "$SRC_DIR/wifi-watchdog.sh" /usr/local/bin/wifi-watchdog.sh

echo "--> Installiere systemd Service + Timer"
install -m 0644 "$SRC_DIR/wifi-watchdog.service" /etc/systemd/system/wifi-watchdog.service
install -m 0644 "$SRC_DIR/wifi-watchdog.timer"   /etc/systemd/system/wifi-watchdog.timer

if [ ! -f /etc/default/wifi-watchdog ]; then
    echo "--> Lege /etc/default/wifi-watchdog an"
    install -m 0644 "$SRC_DIR/wifi-watchdog.default" /etc/default/wifi-watchdog
else
    echo "--> /etc/default/wifi-watchdog existiert bereits — bleibt unverändert."
fi

echo "--> Lade systemd-Konfiguration neu"
systemctl daemon-reload

echo "--> Aktiviere und starte Timer"
systemctl enable --now wifi-watchdog.timer

echo ""
echo "=== WiFi-Watchdog installiert ==="
echo "Status prüfen:   systemctl status wifi-watchdog.timer"
echo "Logs ansehen:    journalctl -u wifi-watchdog.service -f"
echo "Konfiguration:   /etc/default/wifi-watchdog"
