# Licensing

The repository is **MIT** (`LICENSE`) with **one exception**: the WhatsApp gateway in
`packages/api/go` is **GPL-3.0-or-later** (`packages/api/go/LICENSE`).

## Why the gateway is GPL

The gateway links `whatsmeow`, which links `libsignal` — GPL-3.0. Linking it makes the resulting
binary GPL, so the gateway carries that license honestly instead of claiming a permissiveness it
cannot have. The reasoning, and what it means for anyone redistributing the app, is written out in
`packages/api/go/NOTICE`.

## Why that does not make everything else GPL

The gateway is a **separate program**: its own binary, talking to the rest over HTTP and a shared
SQLite file — never linked into them. The daemon (`packages/api/typescript`), the desktop shell
(`packages/app/tauri`), the console (`packages/app/react`), the landing (`packages/app/astro`) and
every package under `packages/contracts` and `packages/client` stay MIT.

## Third parties

Every third-party dependency and its license: `THIRD_PARTY_NOTICES.md`.
