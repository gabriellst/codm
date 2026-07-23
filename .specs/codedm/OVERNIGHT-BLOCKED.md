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
