# GOAL — produtos broker e validação (F0–F4)

> RECONSTRUÇÃO 2026-08-06: o contrato original (2026-08-03, aprovado pelo founder ao colar o
> /goal; clone `codedm`, nunca pushado) perdeu-se na troca do clone por `codm`. Este documento
> restaura o contrato do registro da sessão do orquestrador que o executou. As QUATRO fases já
> estão fechadas ou em fechamento quando esta reconstrução foi escrita — ele permanece como
> registro do contrato, não como plano vivo.

## As 4 fases

- **F0 — fechar o template** (sem reimplementação): stamp emite `sync.yaml` no nascimento +
  `--contexts`; adapter Rust do grafo; astro → `[locale]/` Opção B; catraca TEST_EDGE portada;
  falseador da fase = stamp descartável nascendo VERDE + matriculado + subset.
  → fechada: `artifacts/2026-08-03-f0-fechamento.md`
- **F1 — produto #1: Mira** (broker chart de cripto com IA) pelo fluxo completo do BOOTSTRAP.md:
  B PRD → B½ POC do motor (feed simulado offline → chart vivo → agente comentando; o simulador
  vira fixture de e2e) → C design em projeto próprio do Claude Design + Mobbin com números,
  G3 = gosto do founder → D DDD sobre PRD+telas, CONTRACT LOCK, D2 fontes pinadas por SHA;
  BASE DE AGENTES = o contexto de agentes do codedm INTEIRO (cópia-exemplar CONTEXT-ORIGIN,
  não herança) → E stamp → tracks W∥R∥UI via brainstorm→plan→build por slice → F e2e completo
  INCLUINDO realtime. O checklist de 15 features do founder = a tabela de ACs, cada linha
  fechada com prova citada.
  → fechada: `artifacts/2026-08-04-f1-fechamento.md`
- **F2 — reprodutibilidade**: `research/bootstrap-log.md` desde o primeiro comando
  (fricção→causa→onde mora o conserto→status); fricção de template consertada PARENT-FIRST
  imediatamente, antes do produto #2.
  → fechada: `artifacts/2026-08-04-f2-fechamento.md`
- **F3 — produto #2** (monitoramento de infra + agente de incidentes com IA; virou **Ronda**) —
  o mesmo checklist de 15; falseador: ZERO fricções repetidas do log do produto #1.
  → fechada: `artifacts/2026-08-06-f3-fechamento.md`
- **F4 — fechamento**: as duas baterias+e2e citadas, runbook no BOOTSTRAP.md, relatório
  produto #1 vs produto #2.

## O checklist das 15 features (a tabela de ACs de cada produto)

1. backend Go · 2. backend TypeScript · 3. agentes de IA com os ports do codedm (contexto de
agentes, pasta agents/, prompt builders, abstração de runner) · 4. MCP disponível · 5. backend
Go autentica via getSession do TS usando client.typescript · 6. backend TS chama o Go usando
client.go · 7. app react · 8. landing astro · 9. app tauri como desktop do app react, com
services browser/native como o codedm · 10. onboarding bonito com a estratégia de wizard ·
11. realtime com eventos · 12. assinaturas · 13. design belo e criativo inspirado no Mobbin ·
14. testes e2e completos incluindo realtime · 15. storybook com testes nos componentes.

## As condições (0)–(8)

(0) workflow de coerência antes do /plan · (1) inventários antes de tocar · (2) GO-SHARING
(regras language-agnósticas nas variantes TS e Go) · (3) ACs citadas, nunca asseridas ·
(4) falseadores com números (realtime: cortar a entrega ⇒ e2e vermelho NOMEANDO) · (5) —
· (6) comandos reais do package.json, sem "vermelhos aceitos" no fechamento de fase ·
(7) Fable orquestra, Opus high-reasoning, Sonnet mecânica, WORKFLOWS autorizados · (8) higiene:
um escritor por árvore, sem commit com escritor ativo, staging explícito (nunca add -A), hooks
normais, founder nunca staged sem perguntar, sem stash sobre regen, push do template OK,
PRODUTOS LOCAIS até ordem, projetos do Claude Design permanentes (um definitivo por produto,
finalize_plan só com aprovação do founder), guards tri-estado, MEDIR antes de afirmar, NUNCA
projetar o estado de um repo noutro, app do founder só com janela emprestada.

Decisões fechadas não se relitigam; medir antes de teorizar; o founder decide gosto
(G1/G3/G4.5).
