#!/bin/bash
#
# wifi-watchdog.sh
#
# Prüft regelmäßig die Internet-/WLAN-Verbindung und versucht stufenweise eine
# automatische Wiederherstellung. Gedacht für Raspberry Pi Kiosks, die im
# WLAN gelegentlich die Verbindung verlieren und sich nicht von alleine
# wieder verbinden.
#
# Stufen:
#   1) Ping mehrere Ziele (Gateway + öffentliche DNS-Server). Erfolg => fertig.
#   2) WLAN-Interface kurz down/up.
#   3) NetworkManager neu starten und letzte Verbindung wieder aktivieren.
#   4) Optional: Nach N aufeinanderfolgenden Fehlversuchen das System neu
#      starten (per ENV WIFI_WATCHDOG_REBOOT_AFTER, default 0 = aus).
#
# Konfiguration via /etc/default/wifi-watchdog (wird falls vorhanden geladen).

set -u

# ---- Defaults (überschreibbar via /etc/default/wifi-watchdog) ----
WIFI_IFACE="${WIFI_IFACE:-wlan0}"
PING_TARGETS="${PING_TARGETS:-1.1.1.1 8.8.8.8 9.9.9.9}"
PING_COUNT="${PING_COUNT:-2}"
PING_TIMEOUT="${PING_TIMEOUT:-3}"
STATE_DIR="${STATE_DIR:-/var/lib/wifi-watchdog}"
WIFI_WATCHDOG_REBOOT_AFTER="${WIFI_WATCHDOG_REBOOT_AFTER:-0}"

if [ -f /etc/default/wifi-watchdog ]; then
    # shellcheck disable=SC1091
    . /etc/default/wifi-watchdog
fi

mkdir -p "$STATE_DIR"
FAIL_COUNTER="$STATE_DIR/fail_count"
[ -f "$FAIL_COUNTER" ] || echo 0 > "$FAIL_COUNTER"

log() {
    # An journald durchreichen (Service stdout/stderr) und mit Tag versehen.
    echo "[wifi-watchdog] $*"
}

check_connectivity() {
    # Versuche das Standard-Gateway zu pingen — bestes Indiz für L2-WLAN-Health.
    local gateway
    gateway="$(ip route | awk '/^default/ {print $3; exit}')"
    if [ -n "$gateway" ]; then
        if ping -c "$PING_COUNT" -W "$PING_TIMEOUT" -q "$gateway" >/dev/null 2>&1; then
            # Gateway erreichbar — zusätzlich Internet prüfen.
            for t in $PING_TARGETS; do
                if ping -c 1 -W "$PING_TIMEOUT" -q "$t" >/dev/null 2>&1; then
                    return 0
                fi
            done
            log "Gateway $gateway erreichbar, aber kein Internet."
            return 1
        fi
    fi
    # Kein Gateway oder Gateway nicht erreichbar → direkt öffentliche Ziele testen.
    for t in $PING_TARGETS; do
        if ping -c 1 -W "$PING_TIMEOUT" -q "$t" >/dev/null 2>&1; then
            return 0
        fi
    done
    return 1
}

bounce_interface() {
    log "Stufe 1: Interface $WIFI_IFACE neu starten."
    if command -v nmcli >/dev/null 2>&1; then
        nmcli device disconnect "$WIFI_IFACE" >/dev/null 2>&1 || true
        sleep 2
        nmcli device connect "$WIFI_IFACE" >/dev/null 2>&1 || true
    else
        ip link set "$WIFI_IFACE" down 2>/dev/null || true
        sleep 2
        ip link set "$WIFI_IFACE" up 2>/dev/null || true
    fi
    sleep 10
}

restart_network_stack() {
    log "Stufe 2: NetworkManager neu starten."
    if systemctl list-unit-files | grep -q '^NetworkManager\.service'; then
        systemctl restart NetworkManager 2>/dev/null || true
    elif systemctl list-unit-files | grep -q '^networking\.service'; then
        systemctl restart networking 2>/dev/null || true
    elif systemctl list-unit-files | grep -q '^systemd-networkd\.service'; then
        systemctl restart systemd-networkd 2>/dev/null || true
    fi
    sleep 15
    # Letzte aktive WLAN-Connection erneut hochziehen, falls nmcli vorhanden.
    if command -v nmcli >/dev/null 2>&1; then
        local last
        last="$(nmcli -t -f NAME,TYPE connection show | awk -F: '$2=="802-11-wireless"{print $1; exit}')"
        if [ -n "$last" ]; then
            log "Aktiviere Verbindung: $last"
            nmcli connection up "$last" >/dev/null 2>&1 || true
        fi
    fi
    sleep 5
}

main() {
    if check_connectivity; then
        echo 0 > "$FAIL_COUNTER"
        exit 0
    fi

    local fails
    fails=$(cat "$FAIL_COUNTER" 2>/dev/null || echo 0)
    fails=$((fails + 1))
    echo "$fails" > "$FAIL_COUNTER"
    log "Verbindungsprüfung fehlgeschlagen (Fehlversuche: $fails)."

    bounce_interface
    if check_connectivity; then
        log "Verbindung nach Interface-Restart wiederhergestellt."
        echo 0 > "$FAIL_COUNTER"
        exit 0
    fi

    restart_network_stack
    if check_connectivity; then
        log "Verbindung nach NetworkManager-Restart wiederhergestellt."
        echo 0 > "$FAIL_COUNTER"
        exit 0
    fi

    log "Verbindung weiterhin nicht verfügbar."

    if [ "$WIFI_WATCHDOG_REBOOT_AFTER" -gt 0 ] && [ "$fails" -ge "$WIFI_WATCHDOG_REBOOT_AFTER" ]; then
        log "Reboot-Schwelle ($WIFI_WATCHDOG_REBOOT_AFTER) erreicht — starte System neu."
        echo 0 > "$FAIL_COUNTER"
        /sbin/shutdown -r now
    fi

    exit 1
}

main "$@"
