#!/bin/sh
# whatsapp-triage entrypoint guard.
#
# The WhatsApp device identity lives INSIDE codm.db. Starting the bridge
# without the migrated codm.db would make it pair a brand-new device (QR),
# and starting it from a stale copy can get the session logged out. So:
#
#   * the bridge starts ONLY when $CODM_DATA_DIR/codm.db AND
#     $CODM_DATA_DIR/.bridge-ready both exist;
#   * while codm.db does NOT exist and BOOTSTRAP_UPLOAD_TOKEN is set, the
#     guard runs `whatsapp-triage bootstrap-receive` on $PORT: an
#     authenticated HTTPS upload receiver (PUT /bootstrap/media,
#     PUT /bootstrap/db with X-Sha256, GET /bootstrap/status). When it
#     accepts a verified codm.db it writes .bridge-ready and exits, and the
#     guard starts the bridge. With codm.db present it never runs;
#   * an existing codm.db is NEVER overwritten (protects against key rollback);
#   * codm.db present but .bridge-ready missing (e.g. after
#     POST /admin/stop-bridge during a rollback) = disarmed: wait for an operator;
#   * optional SCOPES_JSON (Railway variable) seeds $DATA/scopes.json when absent.
set -eu
DATA="${CODM_DATA_DIR:-/data}"
BIN="${BRIDGE_BIN:-/usr/local/bin/whatsapp-triage}"
mkdir -p "$DATA"
chmod 700 "$DATA" 2>/dev/null || true
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') guard: $*"; }

child=""
trap '[ -n "$child" ] && kill -TERM "$child" 2>/dev/null; wait "$child" 2>/dev/null; exit 0' TERM INT

if [ -n "${SCOPES_JSON:-}" ] && [ ! -s "$DATA/scopes.json" ]; then
  (umask 077; printf '%s' "$SCOPES_JSON" > "$DATA/scopes.json"); log "scopes.json seeded from SCOPES_JSON"
fi
unset SCOPES_JSON

n=0
while :; do
  if [ -f "$DATA/codm.db" ] && [ -f "$DATA/.bridge-ready" ]; then break; fi
  if [ -f "$DATA/codm.db" ]; then
    [ $((n % 20)) -eq 0 ] && log "codm.db present but .bridge-ready missing — disarmed, waiting for an operator"
  elif [ -n "${BOOTSTRAP_UPLOAD_TOKEN:-}" ]; then
    log "no codm.db — starting bootstrap receiver on port ${PORT:-${CHANNEL_PORT:-3032}}"
    rc=0
    "$BIN" bootstrap-receive & child=$!
    wait "$child" || rc=$?
    child=""
    log "bootstrap receiver exited (rc=$rc)"
    [ "$rc" -eq 0 ] && continue
  else
    [ $((n % 20)) -eq 0 ] && log "no codm.db in $DATA and no BOOTSTRAP_UPLOAD_TOKEN — NOT starting the bridge (waiting for migration upload)"
  fi
  n=$((n + 1))
  sleep 15
done
unset BOOTSTRAP_UPLOAD_TOKEN
log "starting whatsapp-triage (data dir $DATA)"
cd "$DATA"
exec "$BIN"
