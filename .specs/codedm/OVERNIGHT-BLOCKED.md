# OVERNIGHT-BLOCKED — decisões de founder emergidas durante a noite (23-jul-2026)

## Fase B / Fase 10 — reply extraction no claude ≥2.1.218 (JSONL por-sessão ausente)

**Contexto:** o smoke real da Fase B (`.specs/codedm/phase10-smoke/`) provou o engine extraído
dirigindo o claude 2.1.218 (cmux) ponta-a-ponta: spawn via Bun.Terminal, trust-prompt auto-aceito,
priming turn SUBMETE (pós-fix ESC — ver `b477b85c`), resposta visível no TUI (`⏺SMOKE-OK`),
turn-end via TUI_MARKER em 5,4s, teardown zero zumbis.

**O que está bloqueado:** o critério "transcript tail written" (e com ele o reply text do
`agent.reply_drafted`). O claude 2.1.218-cmux NÃO escreve o JSONL por-sessão sob
`~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` neste ambiente — provado por 3 experimentos
(`jsonl-experiment.ts`): com `--session-id`, sem `--session-id`, e sessão COM tool use (Write
executou, `pong.txt` criado), com esperas de 12s pós-resposta e saída graciosa via EOT; apenas
`memory/` aparece (no dir realpath-encoded `-private-var-...`). Sessões do Claude Code "normal"
da máquina TÊM .jsonl — o comportamento é da build/versão cmux, não do nosso código.

**Impacto:** o side-channel JSONL do engine whatscode (extração de reply + detector
`turn_duration`) rende vazio nesta versão. O turn-end NÃO regride (os 2 detectores TUI
independentes carregam — desenho whatscode exatamente para isso), mas `TerminalReplyDraftedEvent`
sai vazio (é skip condicional — degradação graciosa, sem crash).

**Tentado:** matriz de submissão (type+CR / paste+CR / ICRNL-clear / LF), espera de main-UI,
realpath do cwd (fix real, commitado), varredura grep de ~/.claude inteiro pelo sentinel.

**Decisão de founder necessária — opções:**
1. TUI-scrape do reply (linhas `⏺` do stream): lossy (wrap/repaint/truncagem de largura).
2. Sidecar `--print --output-format stream-json` por turn (perde a sessão interativa única).
3. Integração com o daemon do claude 2.x (`~/.claude/daemon`) se expuser transcript API.
4. Pinar uma versão de claude que escreva JSONL (CLAUDE_BIN para binário não-cmux).

## Residual do JSONL (fase 10) — contexto adicional e limite ético (23-jul, orquestrador)
Durante o fix loop da fase 10, um agente tentou contornar o residual do transcript-JSONL
strippando os markers de sessão aninhada do Claude Code (`CLAUDE_CODE_CHILD_SESSION`/
`CLAUDE_CODE_SESSION_ID`, engenharia reversa por A/B) e foi **bloqueado pelo classificador de
segurança** — corretamente: é mecanismo intencional do Claude Code, e esse caminho NÃO será
perseguido. Nada desse bypass foi commitado (auditado: o spawner stripa apenas
CLAUDECODE/CLAUDE_CODE_ENTRYPOINT/CLAUDE_CODE_SSE_PORT, a limpeza padrão do spike D2).
**Implicação importante**: a causa provável do JSONL ausente é o smoke ter rodado DENTRO de uma
sessão Claude Code (sessões-filhas intencionalmente não materializam transcript). Em produção —
daemon spawnado pelo Tauri/shell do usuário, fora de qualquer sessão Claude Code — os markers
não existem e o side-channel JSONL provavelmente funciona. **Validação de 5 minutos para o
founder**: rodar `.specs/codedm/phase10-smoke/real-smoke.ts` num terminal comum (fora do Claude
Code) e verificar se o JSONL materializa — se sim, o residual é artefato de ambiente de teste,
não defeito do produto, e a "estratégia de extração de reply" pode nem ser necessária.
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

### Lote 3 (astro-tauri-org) — contrato nativo + DI: mesmo park honesto

O rename DialogService→FilePickerService, o wiring do NativeProvider (DI + code-split
dynamic-import provado no build), a lint-rule do seam (probe mordeu nas duas direções) e o
fluxo AddWorkspace via file picker foram entregues e verificados **sem Rust**. A capability
`dialog:allow-open` do plugin-dialog **deriva declarativamente** de `REPO.desktop.services.filePicker`
(o gerador do Lote 2 já flatteneia `services` → `capabilities/default.json`; renomear a chave
`dialog`→`filePicker` é idempotente no output — `bun desktop:generate --check` verde). O
`capabilities/default.json` e `tauri.conf.json` gerados são verificáveis por **schema/diff** —
`cargo build`/`tauri dev` seguem PARKED pela mesma ausência de toolchain Rust acima
(`src-tauri/*.rs` continuam `UNVERIFIED-COMPILE`; o primeiro `cargo build` valida a assinatura do
plugin-dialog `open`). Nada novo destrava o park — a superfície nativa nova é só TS + conf gerada.

## Fase F (go-domain) — ADIADA POR DECISÃO DO FOUNDER (23-jul, manhã)
Primeira tentativa morreu em usage-limit (branch vazia — juízes flagaram a não-entrega, worst=6);
retry lançado e então o founder redirecionou: "Deixe para fazer o dominio go depois, vamos
organizar o typescript atualmente". Workflow parado; branch `go-domain` + worktree ficam como
ponteiro em main para quando a fase disparar. Nada foi entregue nem parkeado como feito — a fase
inteira move para a fila pós-organização-TS.
