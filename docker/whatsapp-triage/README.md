# whatsapp-triage on Railway

Image: `docker/whatsapp-triage/Dockerfile` (build context = repo root). Config-as-code: `docker/whatsapp-triage/railway.json`.

## Runtime contract
- One replica, one volume. Mount the volume at the path in `CODM_DATA_DIR`. We use `/workspace/codm-data` so the
  absolute `mediaPath` values already stored in `codm.db` stay valid after the migration.
- The entrypoint guard **never starts the bridge without the migrated `codm.db`**: it waits for
  `incoming/codm.db` + `incoming/codm.db.sha256` (via `railway volume files upload`) or
  `BOOTSTRAP_DB_URL` + `BOOTSTRAP_DB_SHA256`, verifies the sha256, installs it, writes `.bridge-ready`, then starts.
  An existing `codm.db` is never overwritten.
- `PORT` (set by Railway) wins over `CHANNEL_PORT`; `BIND_HOST=0.0.0.0`.

## Auth
Every route needs `Authorization: Bearer <key>`: any scope key in `scopes.json`, or `GLOBAL_API_KEY`.
Per-key token bucket (`RATE_LIMIT_PER_MINUTE`=240, `RATE_LIMIT_BURST`=60) and per-IP failed-auth throttle
(`AUTH_FAIL_PER_MINUTE`=20). Send routes still enforce each scope's chat list.
`SCOPES_JSON` (Railway variable) seeds `scopes.json` on first boot only.

## Read API (GET, any valid key)
| Route | Purpose |
|---|---|
| `/read/messages?remote_id=a,b&since=<ms>&after=<ms>&until=<ms>&direction=&type=&contains=&id=&limit=&cursor=` | gateway_messages, ordered by occurred_at, observed_at, id; `next_cursor` when the page is full |
| `/read/bridge-sent[?since=<unix s>]` | ids in triage_bridge_sends |
| `/read/remotes[?remote_id=][&updated_since=]` | gateway_remotes |
| `/read/contacts[?jid=]` | whatsmeow_contacts |
| `/read/lid-map[?lid=][&pn=]` | whatsmeow_lid_map |
| `/media/file/{messageId}` | bytes of a message's media (platform_message_id or gateway id) |
| `/media/file?path=<mediaPath>` | bytes of a file under `<data dir>/media` only |

## Remote media sends
`POST /send/media` also accepts `multipart/form-data`: part `meta` = the usual JSON (without `path`/`url`),
part `file` = the bytes (≤ 64 MB).

## Migration upload over HTTPS (bootstrap receiver)

While `$CODM_DATA_DIR/codm.db` does not exist and `BOOTSTRAP_UPLOAD_TOKEN` is
set, the entrypoint guard runs `whatsapp-triage bootstrap-receive` on `$PORT`
instead of the bridge. All routes need `Authorization: Bearer $BOOTSTRAP_UPLOAD_TOKEN`:

| Route | What it does |
|---|---|
| `PUT /bootstrap/media` | tar / tar.gz / tar.zst extracted under the data dir (no traversal, no links, never `codm.db*`, `.bridge-ready`, `incoming/`, `keys*`). Repeatable (incremental presync). `scopes.json` may ride along. |
| `PUT /bootstrap/db` | body = codm.db, header `X-Sha256`. Written to `incoming/`, sha256 + `quick_check` + whatsmeow device row verified, atomic rename to `codm.db`, `.bridge-ready` written; the receiver exits and the guard starts the bridge. |
| `GET /bootstrap/status` | counts of what arrived. |

`BOOTSTRAP_MAX_BYTES` (default 4 GiB) caps each body; `BOOTSTRAP_AUTH_FAIL_PER_MINUTE`
(default 10) throttles failed auth and rejected DBs per IP. With codm.db present
the receiver never starts. Remove `BOOTSTRAP_UPLOAD_TOKEN` after the cutover.

Admin routes on the running bridge (GLOBAL_API_KEY only), used by rollback:
`POST /admin/stop-bridge` (disconnect without logout, remove `.bridge-ready` so
restarts stay down) and `GET /admin/db-snapshot` (VACUUM INTO, `X-Sha256` header).
