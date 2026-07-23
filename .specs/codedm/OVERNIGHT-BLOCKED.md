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
