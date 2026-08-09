# Validação — Onboarding como wizard de passos tipados

**Date:** 2026-08-09
**Spec:** `.specs/2026-08-09-onboarding-wizard-e-system-preconditions-design.md`
**Branch:** `feat/onboarding-wizard`

Este arquivo é a prestação de contas da spec: cada AC apontando para o teste verde que a
sustenta, e cada falseador com o número medido dos dois lados (implementação desligada / ligada).

## Mapa AC → teste verde

| AC | Onde é provada |
|---|---|
| **AC-1** | `packages/api/typescript/src/ui/middlewares/OnboardingMiddleware.test.ts` :: `"AC-1: recusa quando o operador nunca começou"` e `"AC-1: recusa quando começou e não concluiu"` · `packages/app/react/src/components/console/OnboardingGate.test.tsx` :: `"AC-1: sem completedAt, leva SEMPRE ao /onboarding — fato do servidor, sem flag"` · `packages/e2e/tests/06-onboarding-attach.spec.ts` :: `"AC-1: a fresh operator has not completed onboarding, and the guarded read refuses"` |
| **AC-2** | `.../ui/usecases/CompleteOnboarding.test.ts` :: `"AC-2: concluir grava completedAt para aquele ownerId"` · `.../ui/middlewares/OnboardingMiddleware.test.ts` :: `"AC-2: deixa passar depois de concluído"` · `packages/e2e/tests/06-onboarding-attach.spec.ts` :: `"AC-2: completing onboarding grants completedAt and unlocks the guarded read"` |
| **AC-3** | `.../ui/repositories/OnboardingRepository/DrizzleOnboardingRepository.test.ts` :: `"AC-3: um segundo operador tem onboarding independente"`. **Não é cobrível por e2e** — ver "Divergência assumida" abaixo. |
| **AC-4** | `packages/app/react/src/routes/onboarding/-components/steps.test.ts` :: `"sem pendência: intro → setup → final"` e `"com uma SystemPrecondition pendente: intro → setup → SystemPrecondition → final (Decision 5 — adjacente ao Concluir)"` |
| **AC-5** | `.../steps.test.ts` :: `"tem exatamente uma entrada por StepId conhecido"` (guarda o sentido inverso). A garantia dura é de tipo — falseador nº 4 abaixo. |
| **AC-6** | `.../steps.test.ts` :: `"STEP_KINDS carrega os três valores, incluindo REQUIRED (sem uso hoje)"`, `"STEP_IMPACTS carrega os dois valores, incluindo ADVISORY"` e `"todo StepId tem uma entrada em STEP_TAXONOMY"` |
| **AC-7** | `.../steps.test.ts` :: `"AC-7: um passo REQUIRED de mentira, insatisfeito, bloqueia"` e `"REQUIRED satisfeito não bloqueia"` |
| **AC-8** | `.../steps.test.ts` :: `"AC-8: com todos os passos reais (todos DEFERRABLE/INFORMATIVE hoje) insatisfeitos, conclui"` · `.../ui/usecases/CompleteOnboarding.test.ts` :: `"AC-8: concluir funciona com todo o setup por fazer"` |
| **AC-9** | `packages/api/typescript/src/thread/usecases/DeletedThreadReads.test.ts` :: `"GetOnboarding — deleting the only thread un-ticks threadDone"` · `.../ui/usecases/GetOnboarding.test.ts` :: `"reporta os três derivados quando o setup está feito"` |
| **AC-10** | `.../steps.test.ts` :: `"Story 3 / AC-10: com completedAt e uma SystemPrecondition pendente, os passos de conteúdo já venceram e abre na pendência"` · `.../OnboardingFlow/index.test.tsx` :: `"AC-10: com completedAt e FULL_DISK_ACCESS pendente, abre naquele passo — não no slide 0"` |
| **AC-11** | `packages/app/react/src/components/console/OnboardingGate.test.tsx` :: `"AC-11: com completedAt e algo pendente, leva ao /onboarding UMA VEZ por execução"` |
| **AC-12** | `packages/app/react/src/routes/onboarding/-components/FullDiskAccessCard/index.test.tsx` :: `"AC-12: sem identidade atribuível, não há botão de reparo — só a orientação sobre o terminal"`. O lado servidor (nenhum dado de SystemPrecondition persistido) é estrutural: `OnboardingSchema` tem três campos e nenhum comporta pendência. |
| **AC-13** | `packages/app/react/src/routes/(app)/dashboard/-components/SetupChecklist/index.test.tsx` :: `"um feito, dois não: só os dois não-feitos aparecem"`, `"nada feito: os três aparecem"`, `"tudo feito: o painel não renderiza nada"`. A morte do endpoint é provada por `grep -rn "GetSetupChecklist" packages/api/typescript` retornando vazio. |
| **AC-14** | `.../OnboardingFlow/index.test.tsx` — cinco casos, um por passo de setup, asseverando que a peça real renderiza dentro do `/onboarding` sem navegação. |
| **AC-15** | `packages/app/react/src/hooks/useSystemPreconditionProbe.test.tsx` :: `"Story 3: ao reganhar foco a sonda roda de novo e a pendência resolvida desaparece — sem navegar"` |
| **AC-16** | `ls packages/app/react/src/routes/onboarding/-components/` — `SystemPreconditionList`, `SystemPreconditionsSlide` e `system-preconditions.ts` não existem; console verde em 218 pass. |
| **AC-17** | `grep -rn "Precondition\|PRECONDITION\|precondition" --include='*.ts' --include='*.tsx' --include='*.rs' packages/app/ \| grep -v "SystemPrecondition\|SYSTEM_PRECONDITION\|system_precondition\|system-precondition\|systemPreconditions"` → **vazio**. |
| **AC-18** | `.../useSystemPreconditionProbe.test.tsx` :: `"AC-18: sonda no mount e publica as pendências no store"` e `"AC-18: com tudo satisfeito, publica pendência vazia e continua sem navegar"` |
| **AC-19** | `docs/FRONTEND.md`, seção `## Onboarding Step Taxonomy`. Sem gate automático — é entrega de documentação, verificada por leitura. |
| **AC-20** | Os dois arquivos de locale foram mantidos em lock-step a cada frente. **Sem gate automático neste repo**: a augmentação `typeof pt` está desligada em `packages/app/react/src/@types/i18next.d.ts` (estourava a profundidade de instanciação do TS), então `tsc` não pega chave faltando. Verificado por leitura. |
| **AC-21** | `packages/api/typescript/tests/architecture/__snapshots__/mcp-exposure.test.ts.snap` não lista `mcp__codm__GetSetupChecklist` e lista `mcp__codm__GetOnboarding` / `CompleteOnboarding` / `SaveOnboardingStep`; o rail passa em 18 pass. |
| **AC-22** | `packages/app/react/src/routes/(app)/dashboard/-components/HomeSection/index.tsx` segue chamando `setPersonProperties` com `channelDone` / `workspaceDone` / `threadDone`; console verde. |

## Falseadores — medidos, não afirmados

Cada linha: implementação desligada → contagem vermelha; religada → contagem verde.

| # | Invariante | Como foi desligada | RED | GREEN |
|---|---|---|---|---|
| 1 | **O portão lê `completedAt`** (AC-1/AC-2) | `if (!onboarding?.isCompleted()) throw` → `if (false) throw` em `OnboardingMiddleware.ts` | **1 pass / 2 fail** | **3 pass / 0 fail** |
| 2 | **Só `REQUIRED` bloqueia a conclusão** (AC-7) | `canComplete` passa a `return true` em `steps.ts` | **12 pass / 1 fail** | **13 pass / 0 fail** |
| 3 | **Reanúncio uma vez por execução** (AC-11) | `&& !announced` removido de `OnboardingGate.tsx` | **2 pass / 1 fail** | **3 pass / 0 fail** |
| 4 | **`STEP_COMPONENTS` exaustivo** (AC-5) | entrada `FULL_DISK_ACCESS` removida do `Record` | **2 erros de `tsc`**, sendo o load-bearing `TS2741: Property 'FULL_DISK_ACCESS' is missing` | **0 erros** |
| 5 | **Satisfação derivada, nunca persistida** (AC-9) | `isNull(threads.deletedAt)` removido de `GetOnboarding.ts` | **11 pass / 1 fail** | **12 pass / 0 fail** |

O falseador nº 5 é o que mais importa conceitualmente: sem ele, um passo "vencido" continuaria
vencido depois de a linha que o satisfazia sumir — que é exatamente a diferença entre satisfação
derivada do mundo e progresso persistido da jornada.

## Gates (medidos ao fechar a última frente)

| gate | resultado |
|---|---|
| `bun tsc` | 0 errors (7 projetos) |
| `bun lint` | 0 findings |
| `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` | 0 errors |
| `cd packages/api/typescript && bun test` | 1363 pass / 0 fail |
| `cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check` | ✔ bate com as migrações |
| `bun run --cwd packages/contracts db:check-go` | ✔ byte-idêntico |
| `cd packages/app/react && bun test` | 218 pass / 0 fail |
| `cd packages/app/tauri/src-tauri && cargo test` · `cargo build` | 58 + 2 passed · 0 warnings |
| `cd packages/api/go && go build ./... && go test ./...` | verde |
| `bun run test:tooling` | 471 pass / 0 fail |
| `bun check:generated` | ✔ em sincronia |
| `cd packages/e2e && bun run test` | 8 passed, 2 skipped, **2 failed** — ver abaixo |

## Divergência assumida — AC-3 fora do e2e

A spec pede isolamento por `ownerId`, e a condição de cobertura do goal pede isso no e2e. **Não é
cobrível ali**, e a razão é estrutural, não preguiça: `OperatorMiddleware`
(`packages/api/typescript/src/auth/middlewares/OperatorMiddleware.ts`) carimba um `OPERATOR_ID`
constante em toda requisição — este é um produto de operador único. Duas chamadas a
`given.freshUser()` resolvem para o mesmo dono, e `createOwner`/`setActiveOwner` não mudam o
`ownerId` resolvido. Provar a independência exigiria acesso direto ao banco (fora do canon
SDK-only desta suíte) ou uma segunda identidade real (que não existe).

A garantia está provada na camada onde ela mora — o repositório —, e o caso e2e está **comentado
com essa explicação**, não `skip`-ado em silêncio.

## Os 2 e2e vermelhos — defeito pré-existente, não desta remodelagem

`10-terminal-tool-frame.spec.ts` e `11-artifact-preview.spec.ts` caem em `/login`. Causa: o
`CloudSessionGate` passou a envolver as rotas `(app)` **depois** que esses specs foram escritos, e
nenhum helper de e2e semeia o token de device do lado cliente. Confirmado revertendo apenas as
mudanças desta branch e reproduzindo a falha idêntica.

O helper que o caso novo de navegador usa — `packages/e2e/utils/given/cloud.ts` — é exatamente o
que falta wirar nesses dois. Fica como follow-up: está fora do escopo das cinco frentes e
consertá-lo aqui teria sido mexer em teste alheio sem pedir.
