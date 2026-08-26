# Candidatura — SignPath Foundation (free code signing for OSS)

Formulário: https://signpath.org/apply · Termos: https://signpath.org/terms.html

---

## Campos do formulário

**Project name:** codm

**Project URL / repository:** https://github.com/gabriellst/codm

**Homepage:** https://codm-landing.pages.dev

**License:** MIT (`LICENSE`), com uma exceção declarada: o gateway do WhatsApp
(`packages/api/go`) é GPL-3.0-or-later porque liga `whatsmeow` → `libsignal`. Ambas são
licenças aprovadas pela OSI e não há dual-licensing comercial — não existe versão fechada
do codm. Detalhes: https://github.com/gabriellst/codm/blob/main/LICENSING.md

**What the project does (short):**
codm lets a developer operate AI coding agents through the messaging apps they already use —
WhatsApp today. You pair your own WhatsApp device, attach a conversation to a folder on your
machine, and drive real work from your phone: the agent opens issues, edits code and sends back
artifacts. It is desktop-first and local: a Tauri v2 shell supervises a TypeScript daemon and a Go
gateway that share one SQLite file on the user's own computer. The only thing that is not local is
identity — a small cloud profile holds sign-in and tenancy.

**What we want signed:**
The Windows installer produced by our release pipeline: `CoDM_<version>_x64-setup.exe` (NSIS,
x86_64). It bundles two sidecar executables built from this repository (`codm-daemon`, a Bun
single-file binary; `codm-gateway`, a Go binary) plus a native prebuild of `@libsql/win32-x64-msvc`
(upstream OSS, unsigned). macOS artifacts are already signed with an Apple Developer ID and
notarized; Linux (AppImage/deb) and every update payload carry a minisign signature the app
verifies on update.

**Build pipeline (how the artifact is produced):**
GitHub Actions, workflow `.github/workflows/release-stable.yml`, triggered only by pushing a
`vX.Y.Z` tag. The job refuses to publish unless the tag matches the version in the committed
desktop config, so an artifact can never claim a version its source does not declare. The Windows
installer is cross-compiled from the Linux job via `cargo-xwin`. Nothing is signed by a workflow a
pull request can trigger, and pull requests from forks require maintainer approval before any
workflow runs (`all_external_contributors`).

**Code signing policy page:**
https://github.com/gabriellst/codm#code-signing-policy — lists committers, reviewers and approvers,
the release approval process, and what is signed on each platform.

**Privacy:**
The README section "What the app sends over the network" states exactly what leaves the user's
machine: WhatsApp traffic through the user's own paired device, sign-in against the cloud profile,
the update manifest, and anonymous product analytics. Files, repositories and conversations stay on
the machine.

**Maintainer:** Gabriel Araújo — https://github.com/gabriellst

---

## Antes de enviar — checar

- [ ] O repositório já está público, com licença MIT detectada pelo GitHub. ✔ (feito em 26/08/2026)
- [ ] Existe release publicada com o artefato que se quer assinar (`v0.5.5` em diante traz o
      `setup.exe` nos assets). O SignPath exige que o projeto já tenha sido lançado na forma que
      será assinada.
- [ ] A seção "Code signing policy" está no README. ✔
- [ ] Nenhum componente proprietário no repositório. ✔ (auditoria de 26/08)

## Depois da aprovação — o que eu implemento

1. `bundle > windows > signCommand` no `tauri.conf.json` (via `config/generate.ts`, que é quem
   renderiza a conf) chamando o cliente do SignPath no runner Linux.
2. Credenciais como secrets do repositório, consumidas só pelo job de release (nunca por PR).
3. Trocar, no README, a linha "Windows — the NSIS installer is not signed yet" pela atribuição que
   os termos exigem: "Free code signing provided by SignPath.io, certificate by SignPath Foundation".
4. Verificar a assinatura no artefato publicado (diretório de segurança do PE preenchido) e conferir
   que o SmartScreen deixou de bloquear o download.
