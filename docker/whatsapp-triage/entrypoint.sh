#!/bin/sh
# whatsapp-triage entrypoint guard.
#
# The WhatsApp device identity lives INSIDE codm.db. Starting the bridge
# without the migrated codm.db would make it pair a brand-new device (QR),
# and starting it from a stale copy can get the session logged out. So:
#
#   * the bridge starts ONLY when $CODM_DATA_DIR/codm.db AND
#     $CODM_DATA_DIR/.bridge-ready both exist;
#   * until then it waits (no crash loop, no pairing), checking every 15 s for
#       a) an uploaded  $DATA/incoming/codm.db + $DATA/incoming/codm.db.sha256
#          (railway volume files upload …), or
#       b) BOOTSTRAP_DB_URL + BOOTSTRAP_DB_SHA256 (e.g. a short-lived presigned URL);
#     the file is sha256-verified, moved into place, and .bridge-ready is written;
#   * an existing codm.db is NEVER overwritten (protects against key rollback).
#   * optional SCOPES_JSON (Railway variable) seeds $DATA/scopes.json when absent.
set -eu
DATA="${CODM_DATA_DIR:-/data}"
IN="$DATA/incoming"
mkdir -p "$DATA" "$IN"
chmod 700 "$DATA" "$IN" 2>/dev/null || true
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') guard: $*"; }

verify_and_install() { # $1 = candidate file, $2 = expected sha256
  want=$(echo "$2" | tr 'A-F' 'a-f' | tr -d ' \n')
  got=$(sha256sum "$1" | cut -d' ' -f1)
  if [ -z "$want" ] || [ "$got" != "$want" ]; then
    log "sha256 MISMATCH for $(basename "$1") — not installing"
    mv -f "$1" "$1.bad.$(date +%s)"
    return 1
  fi
  if [ -e "$DATA/codm.db" ]; then
    log "codm.db already exists — refusing to overwrite; leaving candidate in incoming/"
    return 1
  fi
  rm -f "$DATA/codm.db-wal" "$DATA/codm.db-shm"
  mv "$1" "$DATA/codm.db"
  chmod 600 "$DATA/codm.db"
  date -Is > "$DATA/.bridge-ready"
  log "codm.db installed and verified (sha256 ok)"
}

if [ -n "${SCOPES_JSON:-}" ] && [ ! -s "$DATA/scopes.json" ]; then
  umask 077; printf '%s' "$SCOPES_JSON" > "$DATA/scopes.json"; log "scopes.json seeded from SCOPES_JSON"
fi
unset SCOPES_JSON

n=0
while :; do
  if [ -f "$DATA/codm.db" ] && [ -f "$DATA/.bridge-ready" ]; then break; fi
  if [ -f "$DATA/codm.db" ] && [ ! -f "$DATA/.bridge-ready" ]; then
    [ $((n % 20)) -eq 0 ] && log "codm.db present but .bridge-ready missing — waiting for an operator (touch .bridge-ready only after verifying)"
  elif [ -f "$IN/codm.db" ] && [ -f "$IN/codm.db.sha256" ]; then
    verify_and_install "$IN/codm.db" "$(cut -d' ' -f1 "$IN/codm.db.sha256")" && rm -f "$IN/codm.db.sha256" || true
  elif [ -n "${BOOTSTRAP_DB_URL:-}" ] && [ -n "${BOOTSTRAP_DB_SHA256:-}" ]; then
    log "downloading bootstrap codm.db"
    if curl -fsS --max-time 900 -o "$IN/codm.db.dl" "$BOOTSTRAP_DB_URL"; then
      verify_and_install "$IN/codm.db.dl" "$BOOTSTRAP_DB_SHA256" || true
    else
      log "bootstrap download failed"; rm -f "$IN/codm.db.dl"
    fi
  else
    [ $((n % 20)) -eq 0 ] && log "no codm.db in $DATA — NOT starting the bridge (waiting for migration upload)"
  fi
  n=$((n + 1))
  sleep 15
done
unset BOOTSTRAP_DB_URL BOOTSTRAP_DB_SHA256
log "starting whatsapp-triage (data dir $DATA)"
cd "$DATA"
exec /usr/local/bin/whatsapp-triage
