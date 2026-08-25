# F1 — fechamento (Mira: as 15 ACs citadas, zero vermelhas)

> RECONSTRUÇÃO 2026-08-06, **resumida**: o original (escrito por agente verificador em
> 2026-08-04, commit `d061e6e5` do clone `codedm`, nunca pushado) perdeu-se quando o clone foi
> substituído por `codm`. Este resumo restaura o veredito e os números do registro da sessão;
> a tabela integral com cada citação de arquivo:linha existia só no original. As provas
> continuam verificáveis no próprio repo do produto (`~/Desktop/Projetos/pessoal/mira`).

Goal: `.plans/2026-08-03-goal-produtos-broker-e-validacao.md` §FASE 1. Mira `main` @ `f01b873`
na verificação (evoluiu depois com o fix do chart até `a59cbdd`).

## O placar das 15

| # | AC | estado | # | AC | estado |
|---|---|---|---|---|---|
| 1 | backend Go | ✅ | 9 | desktop tauri | ✅ ressalva grave (needs-window K3) |
| 2 | backend TS | ✅ ressalva | 10 | onboarding wizard | ✅ ressalva |
| 3 | agentes base codedm | ✅ 2 ressalvas | 11 | realtime | ✅ 2 ressalvas |
| 4 | MCP | ✅ ressalva | 12 | assinaturas | ✅ ressalva |
| 5 | Go→TS getSession | ✅ limpa | 13 | design Mobbin | ✅ ressalva |
| 6 | TS→Go client | ✅ ressalva grave | 14 | e2e completo | ✅ limpa |
| 7 | app react | ✅ limpa | 15 | storybook | ✅ ressalva |

**Zero vermelhas.** As duas ressalvas graves:
- **#6** — a AC #5 tem teste de integração real (`httptest.Server` + client gerado + cookie
  asserido, `session_validator.go:63`); a direção TS→Go usa fakes no seam em todos os testes TS
  (`FakeQuoteClient`/`FakeWindowClient`) e a travessia HTTP real só é provada no e2e 08.
- **#9** — o shell sobe e a sonda é tipada (42+4 rust pass), mas janela visível em primeiro
  plano seguia NÃO MEDIDA (K3.md §4); o veredito rAF=0 = política de oclusão do WebKit está
  provado com 2 controles.

## Exits das provas executadas (na verificação)

`bun e2e` **0** → 15 passed (30,8s) · gate canônico `nx run-many -t test --exclude=e2e
--skip-nx-cache` **0** → 1636 pass/0 fail (6 projetos) · `go test ./...` **0** (95 PASS) +
`go -C core test` **0** (25) · `app-tauri:test:rust` **0** (42+4) · `test:tooling` **0** (720) ·
`tsc` **0** (9 projetos) · `storybook:build` **0** (62 arquivos/276 exports) · `astro:build`
**0** (`/pt/` e `/en/` por rota).

Reprova honesta medida: `bun test` cru do api-ts saía exit 1 (2–3 fail por hook-timeout de
contenção — fricção #26); isolados verdes. O gate publicado é o canônico, verde.

## Correções que a verificação impôs ao processo

1. A lista de fricções `template` abertas para a F2 estava incompleta: eram 27, não 20 — a
   **#48** (PGliteUnitOfWork sem transação) entrou como a mais grave da lista inteira.
2. A #6 (rAF do Tauri) saiu das abertas — requalificada e fechada por medição pela #51.
3. Divergência índice×corpo no bootstrap-log (#16) apontada e reconciliada em seguida.
