# OVERNIGHT-BLOCKED — decisões/aceites parkeados (noite 2026-07-23)

> Regra 5 do goal doc: fatia bloqueada é registrada aqui + BUILD-LOG, pulada, e a noite segue.

## Fase C (Tauri shell) — aceite `tauri dev` PARKED: sem toolchain Rust

**O que está parkeado:** o critério de aceite "`tauri dev` (ou target equivalente) abre o
console react renderizando; sidecars sobem com health-check verde" e o "build de produção
do shell compila".

**Dependência exata que falta:** `cargo`/`rustc` não existem nesta máquina
(`which cargo` / `which rustc` → not found; `cargo --version` → command not found).
O lado Apple está OK (Xcode 26.6 / CLT presentes) — **só** o toolchain Rust falta.

**Fix:** `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh` (rustup, canal
stable) e então:

```bash
bun desktop:dev      # deve abrir a janela CodeDM com o console + sidecars health-checked
bun desktop:bundle   # build de produção (antes: bun x tauri icon <1024.png> uma vez)
```

**O que FOI entregue e verificado sem o Rust** (branch `tauri-shell`):
- Shell completo em `packages/app/tauri` (tauri.conf.json v2, Cargo.toml, lib.rs com
  bootstrap health-checked dos sidecars, capabilities, build-sidecars).
- Sidecars **compilados de verdade** nesta máquina: `nx run app-tauri:sidecars` →
  `codedm-daemon-aarch64-apple-darwin` (bun --compile) + `codedm-gateway-aarch64-apple-darwin`
  (go build), exit 0.
- SPA desktop do console: `nx run app-react:build-spa` verde (base `/`, spa shell,
  `dist/client/index.html`).
- Seam `lib/native` + lint `@tauri-apps/*` + skill `desktop-shell` + expo removido —
  gates da branch todos verdes (BUILD-LOG Fase C).

**Risco residual conhecido:** os fontes Rust (`src-tauri/src/*.rs`, Cargo.toml) estão
marcados `UNVERIFIED-COMPILE` — escritos sem compilador presente; o primeiro
`cargo build` pode pedir ajustes menores de API/versão (ex.: assinatura dos plugins
dialog/notification/autostart, feature flags do keyring). Nada estrutural: a topologia
(externalBin + readiness URLs + seam) está fechada e testada nas partes executáveis.

**Pendência menor associada:** ícones do bundle (`src-tauri/icons/`) não commitados —
rodar `bun x tauri icon <png-1024>` antes do primeiro `desktop:bundle`.
