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
