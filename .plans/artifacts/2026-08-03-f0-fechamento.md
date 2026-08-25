# F0 — fechamento (o template fechou, provado por stamp)

> RECONSTRUÇÃO 2026-08-06: o original foi commitado no clone `codedm` (nunca pushado) e
> perdeu-se quando o clone foi substituído por `codm`. Conteúdo restaurado verbatim do
> registro da sessão do orquestrador (lido do disco em 2026-08-03).

Goal: `.plans/2026-08-03-goal-produtos-broker-e-validacao.md`. Template `v1.9` local em
`cb03a1032` (upstream-c). Worktrees de onda removidos, branches deletadas (merges em v1.9).

## Os itens

| item | desfecho |
|---|---|
| 0.1 baseline verde | ✅ lint 44→0 · detect 10→0 · client:check 0 · +52 fantasmas de skill reescritos · catraca `component-props` em `error` |
| 0.2 stamp | ✅ `sync.yaml` no nascimento (curado por tiers, `adapted` MEDIDO) + `--contexts` (7 contextos medidos: 4 obrigatórios, notifications removível, billing+quota par declarado) + 3 adendos (`"//"` em optionalDependencies · guard do contracts/dist · matriz do grafo declarativa) |
| 0.3 grafo × shell | ✅ 16 nodes/40 edges, kinds do shell (não-DDD), tabela de símbolos, piso tri-estado (ausente=skip declarado · sem-cargo=falha nomeada · quebrado=vermelho com número) |
| 0.4 astro Option B | ✅ 40 arquivos, 4 falseadores (post pt-only medido nas duas direções), 3 touchpoints silenciosos achados além do inventário |
| 0.5 catraca TEST_EDGE | ✅ premissa INVERTIDA pela medição: 1 aresta ilícita (não ~metade) — a camada `given` já absorvia; dívida PAGA, inventário nasce vazio com machinery floor |
| 0.6 stamp de prova | ✅ ver abaixo |

## O stamp de prova oficial (o falseador da fase) — e ele MORDEU

Produto descartável, sem expo + sem notifications, no HEAD final:

1ª rodada: **REPROVOU** — `SYNC_EXIT=1`, `SyncContractError: not a git repo`. O recém-nascido
não era repo git; toda prova anterior tinha `git init`ado no harness por fora. "Nasce
matriculado" era mentira por um passo ausente. **Conserto parent-first** (`cb03a1032`):
`applyStamp` fecha com git init + commit inicial pinando o ref do pai; o teste do `.git` virou
duas-faces (o VCS do pai não embarca — história = exatamente 1 commit — e o próprio existe).

2ª rodada, tudo citado:
- nascido: 1 commit, `born from template-fullstack @ cb03a10320d3`
- expo ausente ✓ · notifications ausente ✓
- `sync:check` **clean: 1666 paths, exit 0** no dia um
- `graph build` exit 0 — 3293 nodes, shell 13 arquivos (delta = exatamente o removido)
- `tsc` exit 0 · `bun run test` (canônico) exit 0, **919 pass**
- falseador de drift: mutação → `DRIFT-MODIFIED scripts/sync/gitio.ts` exit 1 → restaurado → 0
- destruído ✓

## Fricções para o bootstrap-log da F1 (nascem registradas)

1. `goal-prompt` é command só do codedm — portar ao template.
2. **git-birth ausente no stamp** — achado pelo falseador da F0, consertado parent-first no ato
   (o mecanismo da F2 executado antes da F2 existir).
3. `run-many -t test --all` varre o e2e; o gate canônico é `bun run test` (`--exclude=e2e` por
   desenho). Harness de prova deve usar os scripts reais — condição (6) do goal.
4. Cano engolindo exit code me pegou DUAS vezes na própria F0 (bateria e stamp) — a patologia
   P3 vale para harness de orquestrador também.

## Pendências herdadas pela F1+ (declaradas)

- `parent.repo` do sync.yaml emitido é placeholder (`github.com/template/...`) — produto real
  usa `SYNC_PARENT_PATH` ou edita 1 linha; a linha de marca é decisão do founder.
- e2e do produto não roda sem `bunx playwright install` (browsers) — passo de setup do F1.
- push do template (agora ~mais commits à frente do origin) — fluxo já aprovado, fazer no
  próximo checkpoint.
