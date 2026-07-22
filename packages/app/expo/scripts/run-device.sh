#!/usr/bin/env bash
# Runs `expo run:<platform> --device` with EXPO_PUBLIC_API_URL pointed at the
# Mac's current LAN IP, so device builds never bake a stale address.
# Usage: ./scripts/run-device.sh ios
#        ./scripts/run-device.sh android
set -euo pipefail

PLATFORM="${1:-ios}"
PORT="${API_PORT:-3030}"

# Try the usual interfaces in order — Wi-Fi first, then ethernet/USB.
for iface in en0 en1 en2 en3; do
	IP="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
	[ -n "$IP" ] && break
done

if [ -z "${IP:-}" ]; then
	echo "✗ Could not detect a Mac LAN IP. Are you on Wi-Fi?" >&2
	exit 1
fi

URL="http://$IP:$PORT"
echo "→ EXPO_PUBLIC_API_URL=$URL"
EXPO_PUBLIC_API_URL="$URL" expo "run:$PLATFORM" --device
