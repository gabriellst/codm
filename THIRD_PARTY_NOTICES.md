# Third-party notices

codm is licensed under MIT, except the WhatsApp gateway (`packages/api/go`), which is
GPL-3.0-or-later — see `LICENSE`, `packages/api/go/LICENSE` and `packages/api/go/NOTICE`.

This file summarises the licenses of the third-party dependencies as scanned on
2026-08-25 from the installed trees (`node_modules`, the Go module cache and `cargo metadata`).
Re-run the scan after adding dependencies; the scan commands live in the git history of this
file's first commit and are reproducible with `bun`, `go list -m all` and `cargo metadata`.

## Summary

| Ecosystem | Packages | Licenses | Copyleft found |
|---|---|---|---|
| npm (all workspaces) | 1737 | MIT (1453), Apache-2.0 (89), ISC (77), BSD-3/2 (66), BlueOak-1.0.0 (15), CC0/Unlicense (6), OFL-1.1 fonts (2) | `lightningcss` MPL-2.0 (build tool), `dompurify` MPL-2.0 OR Apache-2.0, `@img/sharp-libvips` LGPL-3.0 (image service used at landing build time only) |
| Rust (Tauri shell + SDK crates) | 579 | MIT / Apache-2.0 dual (348), MIT (134), Unicode-3.0 (18), Zlib/Apache/MIT (18), MPL-2.0 (6) | MPL-2.0 crates only (file-level copyleft, unmodified) |
| Go (`packages/api/go`) | ~70 | MIT, Apache-2.0, BSD, ISC | **`go.mau.fi/libsignal` GPL-3.0** (via `go.mau.fi/whatsmeow` MPL-2.0 and `go.mau.fi/util` MPL-2.0) |
| Go (`core`, contracts, SDK) | — | MIT, Apache-2.0, BSD | none |

## Notable dependencies

- **whatsmeow** (`go.mau.fi/whatsmeow`, MPL-2.0) — WhatsApp Web multi-device client. Used unmodified; MPL-2.0 is file-level copyleft and imposes no obligation on this repository beyond keeping modified whatsmeow files (none) under MPL-2.0.
- **libsignal** (`go.mau.fi/libsignal`, GPL-3.0) — Signal protocol implementation required by whatsmeow. Statically linked into `codm-gateway`; this is what makes the gateway module GPL-3.0-or-later.
- **shadcn/ui, Base UI, Radix UI, Tailwind CSS, TanStack, Kubb, TypeSpec, Astro, Drizzle, Tauri, Playwright** — MIT or Apache-2.0.
- **Fonts** (`@fontsource/*`, OFL-1.1) — SIL Open Font License; distributed unmodified.
- **Claude Code CLI** is not a dependency of this repository: it is a separately installed tool the operator runs on their own machine under Anthropic's terms.

## Obligations checklist

- Ship `LICENSE` (MIT) and `packages/api/go/LICENSE` (GPL-3.0) with every distribution, including the desktop bundle and GitHub Releases.
- Keep the source of the gateway module available under GPL-3.0-compatible terms for every released gateway binary (this public repository satisfies that).
- Preserve upstream copyright notices of MIT/BSD/Apache dependencies bundled into distributed artifacts (the build tools embed them; do not strip license comments from bundles).
- Do not modify MPL-2.0 files (whatsmeow, lightningcss) without keeping those files under MPL-2.0.
