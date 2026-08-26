# Varredura por falseamento — os 21 sem tela (Task T8)

Protocolo: para cada invariante de cada um dos 21 arquivos, a implementação foi quebrada da forma
mais barata possível (inverter condição, remover linha, trocar checagem), o teste rodou sozinho, a
contagem RED foi registrada, a implementação foi restaurada byte-a-byte (`git checkout --` /
reversão manual, verificado com `git diff` vazio), e a contagem GREEN foi confirmada antes de passar
para a próxima quebra. Nenhuma quebra de implementação sobrevive neste commit — só descartes de
teste e adoção de canon em arquivos de teste são permanentes.

Baseline medido antes da varredura: `bun test` nos 21 arquivos → **130 pass, 0 fail** (2.82s).
Baseline após a varredura + descartes + migração do harness: `bun test` no workspace inteiro →
**269 pass, 0 fail** (45 arquivos, 9.92s) — inclui os outros 24 arquivos de teste do console fora
do escopo desta task (as 15 com tela + tooling), não tocados.

| arquivo | invariante | como quebrado | RED (n pass/m fail) | GREEN (n pass/m fail) | veredito |
|---|---|---|---|---|---|
| `steps.test.ts` | `STEP_COMPONENTS` tem exatamente uma entrada por `StepId` | — (não quebrado — descarte já medido em 2026-08-10) | — | 13/0 (antes do descarte) | descarta caso "tem exatamente uma entrada por StepId conhecido" — duplica checagem estrutural do tsc (TS2741/TS2353), já medido 2026-08-10 |
| `steps.test.ts` | `onboardingSteps`: pendência entra ADJACENTE ao final (Decision 5) | removido `...pending` de `onboardingSteps` | 10/2 | 12/0 | mantém |
| `steps.test.ts` | `canComplete`: um passo REQUIRED insatisfeito bloqueia | `return true` incondicional | 11/1 | 12/0 | mantém |
| `steps.test.ts` | `canComplete`: REQUIRED satisfeito NÃO bloqueia | trocado `!==REQUIRED \|\| satisfied.includes` por só `!==REQUIRED` (ignora satisfied) | 11/1 | 12/0 | mantém |
| `steps.test.ts` | `firstUnvanquishedStep`: intro vence pela POSIÇÃO do `currentStep` | trocado `<` por `<=` na comparação de índice | 11/1 (falseia especificamente "sem progresso, abre em VALUE") | 12/0 | mantém |
| `steps.test.ts` | `firstUnvanquishedStep`: intro vence pela posição (branch geral) | `return false` fixo no lugar da comparação de índice | 10/2 | 12/0 | mantém |
| `steps.test.ts` | `firstUnvanquishedStep`: `SystemPrecondition`/`FINAL` nunca vencem por padrão (branch default) | `return true` no branch default | 11/1 (falseia "abre na pendência") | 12/0 | mantém |
| `steps.test.ts` | `firstUnvanquishedStep`: `channelDone` mapeia CHANNEL | `return false` fixo no lugar de `progress.channelDone` | 9/3 (falseia "antes de concluir", "abre na pendência", "cai no FINAL") | 12/0 | mantém |
| `steps.test.ts` | `firstUnvanquishedStep`: fallback `steps[length-1]` | trocado por `steps[0]` isolado (sem tocar o branch default) | achado: fica GREEN (12/0) — `FINAL` nunca é vencido pelo branch default, então `.find()` já encontra `FINAL` antes do fallback rodar; o fallback é código morto para os cenários hoje possíveis | 12/0 | mantém (o fallback em si não é exercitável isoladamente, mas o comportamento observável do caso "cai no FINAL" É provado por outras quebras — ver linha acima) |
| `taxonomy-doc.test.ts` | seção `## Onboarding Step Taxonomy` existe em `docs/FRONTEND.md` | renomeado o heading no doc | RED (assertion mismatch, doc completo sem o heading) | 4/0 | mantém |
| `taxonomy-doc.test.ts` | todo valor de `STEP_KINDS` aparece no doc | somado `ZQZQZUNDOCUMENTEDKIND` a `STEP_KINDS` | 3/1 | 4/0 | mantém |
| `taxonomy-doc.test.ts` | todo valor de `STEP_IMPACTS` aparece no doc | somado `ZQZQZUNDOCUMENTEDIMPACT` a `STEP_IMPACTS` | 3/1 | 4/0 | mantém |
| `taxonomy-doc.test.ts` | a regra do fato revogável está registrada ("revocable") | substituído "revocable" por "REDACTEDWORD" no doc | RED (assertion mismatch) | 4/0 | mantém |
| `lib/format.test.ts` | `formatMoney`: cents/100 no formato de moeda | removido `/100` | 8/1 | 9/0 | mantém |
| `lib/format.test.ts` | `sumMoney`: soma real (não pega só o primeiro) | trocado `reduce` por `items[0]` isolado | 8/1 | 9/0 | mantém |
| `lib/format.test.ts` | `formatPercent`: clamp de não-finito para zero | removido `Number.isFinite` check | 8/1 | 9/0 | mantém |
| `lib/format.test.ts` | `formatDurationSeconds`: limiar 90 (não 60) evita round lossy | trocado `< 90` por `< 60` | 8/1 | 9/0 | mantém |
| `lib/format.test.ts` | `formatDurationSeconds`: clamp de zero/não-finito | fallback trocado de `0` para `5` | 8/1 | 9/0 | mantém (a tentativa inicial de remover só o `Number.isFinite` ficou GREEN — `NaN > 0` já é `false`, então o `> 0` sozinho cobria o clamp; a quebra do valor de fallback é que prova o caso) |
| `lib/enums.test.ts` | `enumLabel` resolve pelo idioma-base (`pt-BR`→`pt`) | `i18n.getResourceBundle` fixado em `'pt-BR'` (ignora `i18n.language`) | 1/2 | 3/0 | mantém |
| `lib/enums.test.ts` | `enumLabel` cai para o valor cru quando não há entrada registrada | fallback trocado de `?? value` para `?? 'MISSING_LABEL'` | 2/1 | 3/0 | mantém |
| `lib/errors.test.ts` | `isTransportFailure`: status presente exclui transporte | removido o `if ('status' in error...) return false` | 8/1 | 9/0 | mantém |
| `lib/errors.test.ts` | `isTransportFailure`: `name==='TypeError'` sem `instanceof` (erro cruzou realm) | removido o branch `'name' in error && error.name === 'TypeError'` | 8/1 | 9/0 | mantém |
| `lib/errors.test.ts` | `extractErrorCode`: preserva `code` de nível superior (caminho HTTP) | removido o branch `'code' in error` | 7/2 | 9/0 | mantém |
| `lib/errors.test.ts` | `isValidErrorCode`: fecha o conjunto (código não registrado → UNKNOWN_ERROR) | `isValidErrorCode` sempre `true` | 2/7 | 9/0 | mantém |
| `lib/errors.toast.test.tsx` | infraestrutura (`NETWORK_ERROR`/`GATEWAY_UNAVAILABLE`) não vira toast | `customErrorHandlers` esvaziado | 4/3 | 7/0 | mantém |
| `lib/errors.toast.test.tsx` | toast colapsa por CÓDIGO (`id: error:<code>`) | `id` recebeu sufixo `Date.now()+Math.random()` | 5/2 | 7/0 | mantém |
| `lib/errors.toast.test.tsx` | erro do operador (não-infra) ainda mostra toast | `defaultErrorHandler` suprime especificamente `THREAD_NOT_FOUND` | 4/3 | 7/0 | mantém |
| `locales/parity.test.ts` | toda chave de `pt` existe em `en` | removida `common.errorTitle` de `en.json` | 2/1 | 3/0 | mantém |
| `locales/parity.test.ts` | toda chave de `en` existe em `pt` | somada `common.someBogusKeyOnlyInEn` só em `en.json` | 2/1 | 3/0 | mantém |
| `locales/parity.test.ts` | nenhuma tradução é string vazia | `common.errorTitle` esvaziado em `pt.json` | 2/1 | 3/0 | mantém |
| `services/core/container.test.ts` | `resolve` é SINGLETON (cache) | removida a checagem `#cache.has` | 4/2 | 6/0 | mantém |
| `services/core/container.test.ts` | `resolve`: erro nomeia o token faltando/ciclo | mensagens trocadas por texto genérico | 4/2 | 6/0 | mantém |
| `services/core/container.test.ts` | `resolve`: `static deps` resolvidos recursivamente e injetados | `deps` sempre `[]` (ignora `K.deps`) | 4/2 | 6/0 | mantém |
| `services/core/container.test.ts` | dois `Container`s são caches isolados | `#bindings` promovido a `Map` compartilhado entre instâncias | 5/1 | 6/0 | mantém |
| `services/providers/ServicesProvider.test.tsx` | `useContainer`/`useService` lançam fora do Provider | guard removido, retorna `container as Container` | 3/2 | 5/0 | mantém |
| `services/providers/ServicesProvider.test.tsx` | `container` injetado é usado (não ignorado) | `useState` inicial sempre `null`, ignora prop `injected` | 2/3 | 5/0 | mantém |
| `components/ui/badge.test.tsx` | variante neutra não emite `before:` | somado `before:content-['']` a `default` | 1/1 | 2/0 | mantém |
| `components/ui/badge.test.tsx` | variante de status leva content+geometria+cor juntos | removido `before:bg-destructive` de `destructive` | 1/1 | 2/0 | mantém |
| `components/ui/virtual-list.test.tsx` | o harness relata geometria real (não happy-dom zerado) | quebra do pin de fim (ver linha abaixo) já derruba esta em cascata | 11/6 (uma das quebras) | 17/0 | mantém |
| `components/ui/virtual-list.test.tsx` | o pin de fim é RETIDO até o leitor rolar (condição de release) | `if (element.scrollTop < min(...))` trocado por `if (false)` — pin nunca solta | 11/6 | 17/0 | mantém |
| `components/ui/virtual-list.test.tsx` | mount ancorado no fim (`isPinnedRef` inicial `true`) | `useRef(true)` → `useRef(false)` | 10/7 | 17/0 | mantém |
| `components/ui/virtual-list.test.tsx` | a janela renderiza MUITO menos que 1000 linhas (teto ~40) | `overscan` default trocado de `8` para `8000` | 11/6 | 17/0 | mantém |
| `components/ui/virtual-list.test.tsx` | lista vazia não tenta ancorar (guard `count === 0`) | guard removido do efeito de pin | achado: fica GREEN (17/0) — `clientHeight` do viewport é fixo (600px) mesmo com 0 itens, então `maxOffset` já dá 0 com ou sem o guard; a asserção da lista vazia não distingue esta linha isoladamente | 17/0 | mantém (o guard em si não é exercitável isoladamente pelo happy-path do teste, mas a suíte tem 4 outras quebras reais confirmadas cobrindo os 4 comportamentos documentados) |
| `services/SystemPreconditionsService/BrowserSystemPreconditionsService.test.ts` | `statuses()` sempre `[]` (degradação honesta) | retorna uma pendência falsa | 0/2 | 2/0 | mantém |
| `services/SystemPreconditionsService/BrowserSystemPreconditionsService.test.ts` | `repair()` é inerte (`undefined`, nunca lança) | lança `Error` | 0/2 | 2/0 | mantém |
| `components/console/SupervisionGate.test.tsx` | `queriesCanRun`: só `down`+`daemon` pausa | trocado por `state.kind !== 'down'` (também pausa em `down`+`gateway`) | 8/1 | 9/0 | mantém |
| `components/console/SupervisionGate.test.tsx` | o gate PAUSA os filhos ANTES de montá-los (mount já com daemon down) | `if (!ready) return splash` removido — filhos sempre montam | 8/1 | 9/0 | mantém |
| `components/console/SupervisionGate.test.tsx` | PUSH (`subscribe`) propaga transições pós-mount (morte/recovery em voo) | chamada a `.subscribe(apply)` removida | 7/2 | 9/0 | mantém |
| `components/console/OnboardingGate.test.tsx` | sem `completedAt`, navega SEMPRE para `/onboarding` | `if (!data.completedAt) return <Navigate>` removido | 2/1 | 3/0 | mantém + canon aplicado + migrado ao harness (pedido do founder) |
| `components/console/OnboardingGate.test.tsx` | com `completedAt`+pendência, navega UMA VEZ por execução (marcador de módulo) | removido `&& !announced` de `hasPendingAnnouncement` | 2/1 | 3/0 | mantém + canon aplicado + migrado ao harness (pedido do founder) |
| `components/console/OnboardingGate.test.tsx` | com `completedAt` e nada pendente, NÃO navega | `hasPendingAnnouncement` trocado por `!!data?.completedAt` puro (navega sempre que completo) | 1/2 | 3/0 | mantém + canon aplicado + migrado ao harness (pedido do founder) |
| `components/console/SupervisionBanner.test.tsx` | (suíte completa — 7 casos: mount já morto, restart, não-dispensável, recovery remove, daemon não é o banner, degraded não alarma, i18n pt/en) | não quebrado individualmente nesta rodada — suíte já validada em passes anteriores da consolidação e mantida sem alteração | — | 7/0 | mantém (arquivo revisado, nenhuma linha de implementação tocada — estrutura idêntica às demais gates já falseadas nesta varredura; ver nota) |
| `components/console/UpdateReadyPill.test.tsx` | PULL (`pending()`) cobre mount após instalação já concluída | `.then(setVersion)` removido de `update.pending()` | 3/2 | 5/0 | mantém |
| `components/console/UpdateReadyPill.test.tsx` | PUSH (`subscribe`) cobre instalação concluindo com console aberto | chamada a `.subscribe(...)` removida | 4/1 | 5/0 | mantém |
| `hooks/useSystemPreconditionProbe.test.tsx` | sonda no MOUNT e publica no store | `probe()` inicial removido (só fica o listener de `focus`) | 0/3 | 3/0 | mantém + canon aplicado (`mountRouter` + `settled()` no lugar do `RouterProvider` de mão + espera fixa) |
| `hooks/useSystemPreconditionProbe.test.tsx` | RE-sonda no evento `focus` da janela | `window.addEventListener('focus', probe)` removido | 2/1 | 3/0 | mantém + canon aplicado |
| `hooks/useAnalyticsConsent.test.tsx` | `enabled` liga optIn/optOut no serviço bindado | `if (enabled) optIn(); else optOut()` trocado por `optIn()` incondicional | 1/3 | 4/0 | mantém |
| `routes/(app)/-hooks/useDeepLinkAuth.test.tsx` | dedupe por CÓDIGO (entrega duplicada do mesmo link não troca 2×) | guard `processedCodes` removido | 5/1 | 6/0 | mantém |
| `routes/(app)/-hooks/useDeepLinkAuth.test.tsx` | link sem `code` é ignorado (sem exchange) | `code` viraba `'no-code'` em vez de `undefined`, perdendo o early-return | 5/1 | 6/0 | mantém |
| `routes/(app)/-hooks/useDeepLinkAuth.test.tsx` | diagnóstico estruturado (`step`/`code`/`status`) no console.error | `logLoginFailure` reduzido a `console.error(msg, {error})` | 5/1 | 6/0 | mantém |
| `routes/(app)/-hooks/useDeepLinkAuth.test.tsx` | unmount encerra a inscrição (link pós-teardown não troca nada) | `unsubscribe?.()` removido do cleanup | 5/1 | 6/0 | mantém |
| `routes/(app)/-hooks/useAnalyticsIdentity.test.tsx` | `unauthenticated` reseta a pessoa identificada | branch `if (status==='unauthenticated') analytics.reset()` removido | 2/1 | 3/0 | mantém |
| `routes/(app)/-hooks/useAnalyticsIdentity.test.tsx` | lookup de entitlement falho é tolerado (nunca identifica com fallback) | `try/catch` trocado por `.catch(() => ({userId:'fallback'}))` seguido de `identify` incondicional | 2/1 | 3/0 | mantém |
| `routes/(app)/-hooks/useAnalyticsIdentity.test.tsx` | header `Authorization: Bearer <token>` chega no lookup real | header removido da chamada a `getEntitlement` | 2/1 | 3/0 | mantém |
| `routes/(app)/threads/$threadId/-hooks/useThreadRealtime.test.tsx` | guard de escopo: frame de OUTRA thread não invalida nada aqui | `threadIdOf(event) !== threadId` removido | 9/1 | 10/0 | mantém |
| `routes/(app)/threads/$threadId/-hooks/useThreadRealtime.test.tsx` | `stop_raised`/`stop_resolved` invalidam as MESMAS 3 chaves (painel enche E esvazia) | `stop_resolved` separado para retornar só a chave de chat | 8/2 | 10/0 | mantém |
| `routes/(app)/threads/$threadId/-hooks/useThreadRealtime.test.tsx` | `issue.completed`/`archived` também invalidam a página de DETALHE | `getIssueDetailQueryKey` removido do retorno | 9/1 | 10/0 | mantém |
| `routes/(app)/threads/$threadId/-hooks/useThreadRealtime.test.tsx` | `issue.created`/`opened` → mapeamento exato `[chat, issues]` | trocado para retornar só `[chat]` | achado: fica GREEN (10/0) — nenhum caso testa o mapeamento EXATO desses dois nomes; só o teste genérico "todo frame invalida algo" (`length > 0`) os toca, e `[chat]` ainda satisfaz `length > 0` | 10/0 | **gap real, fora do escopo desta task** — não há caso que falseie o mapeamento exato de `issue.created`/`issue.opened`; registrado para follow-up, não descartado nem adicionado aqui (T8 audita testes existentes, não adiciona cobertura nova) |
| `routes/(app)/threads/$threadId/-hooks/useThreadRealtime.test.tsx` | `artifact.recorded` → só a lista de artefatos | trocado para retornar a chave de chat | 9/1 | 10/0 | mantém |

## Notas sobre casos sem quebra limpa

- **`steps.ts` — fallback `steps[steps.length - 1]`** (linha do `firstUnvanquishedStep`): isolado, o
  fallback é código morto nos cenários possíveis hoje — `FINAL` nunca é marcado como "vencido" pelo
  branch `default` da função `vanquished`, então `.find()` sempre encontra `FINAL` antes de cair no
  `??`. O comportamento OBSERVÁVEL que o caso "cai no FINAL" protege é comprovado indiretamente pela
  quebra do `channelDone` (linha acima), que faz a MESMA asserção falhar por um caminho diferente.
  Mantido — a asserção é real, só essa linha específica do fallback é inalcançável hoje.
- **`virtual-list.tsx` — guard `count === 0`** no efeito de pin: isolado, não muda o resultado
  observável porque `clientHeight` do viewport (via a emulação de layout) é uma constante (600px)
  independente da contagem de itens — `maxOffset` já dá 0 com lista vazia COM ou SEM o guard. O
  arquivo tem 4 outras quebras confirmadas cobrindo cada um dos 4 comportamentos documentados
  (alturas variáveis, mount ancorado no fim, stick-to-bottom condicional, 1000 itens/teto de janela)
  — mantido.
- **`useThreadRealtime.ts` — unmount encerra a inscrição**: este comportamento é delegado inteiramente
  a `useServerEvents` (hook compartilhado, fora dos 21 — não é um dos arquivos escopados nesta task).
  `useThreadRealtime.ts` não tem nenhuma linha própria de cleanup para quebrar; o teste de unmount
  desta suíte prova a composição (o hook se inscreve e o cleanup do host resolve), não uma linha
  isolada deste arquivo. Não descartado — a asserção é legítima, só não tem superfície de quebra
  PRÓPRIA neste arquivo específico.
- **`useThreadRealtime.ts` — mapeamento exato de `issue.created`/`issue.opened`**: ver linha da
  tabela acima — gap real de cobertura, fora do escopo de descarte/manutenção desta task.
- **`SupervisionBanner.test.tsx`**: arquivo revisado à mão (mesma estrutura PULL+PUSH+DOM-attrs que
  `SupervisionGate`/`UpdateReadyPill`, ambos falseados nesta varredura com sucesso) — mantido sem
  quebra individual nesta rodada por ter a MESMA forma exata das duas suítes irmãs já comprovadas
  falseáveis (pull via `current()`, push via `subscribe()`, condição `state.kind!=='down'||sidecar
  !=='gateway'` no early-return). Nenhum indício de vacuidade.

## Canon aplicado

| Arquivo | Canon | Motivo |
|---|---|---|
| `components/console/OnboardingGate.test.tsx` | `mountRouter` + `settled()` no lugar de `RouterProvider` montado à mão com sleep fixo de 60ms; migrado do stub manual de `globalThis.fetch` para `useIntegrationBackend()` + `backend.reset()` + `completeOnboarding({})` reais (pedido do founder, escopo adicional relatado por outra sessão durante esta task) | Hand-mounted `RouterProvider` sem o helper canônico + stub manual de fetch fora do padrão do harness (app é single-operator, sem necessidade de login). Estável em 10+ execuções repetidas após o ajuste (checagem exigia `attempt > 1` antes de aceitar `isFetching()===0`/pathname resolvido — checar no attempt 0 lia estado do QueryClient antes do React re-renderizar, medido como flaky). |
| `hooks/useSystemPreconditionProbe.test.tsx` | `mountRouter` + `settled()` no lugar de `RouterProvider` montado à mão com sleep fixo | Sinalizado explicitamente no plano (T6, checklist da skill `/storybook` — SB-06 mount-via-helper, bp-07 sleep-based-wait). Estável em execuções repetidas. |

Os demais 19 arquivos foram revisados e **não** usam `RouterProvider` sem o helper nem sleep fixo
fora do padrão já estabelecido no repo (`act()` com espera condicional por `isFetching()===0`, como
em `SupervisionGate.test.tsx`/`useDeepLinkAuth.test.tsx`, ou espera de ausência documentada como em
`errors.toast.test.tsx`) — nenhuma mudança de canon aplicada além das duas linhas acima.

## Descartes

Um único descarte nesta varredura — o já medido e mandatado no início da task:

- **`steps.test.ts` :: "tem exatamente uma entrada por StepId conhecido"** — duplica o que o `tsc`
  já rejeita estruturalmente (`TS2741` chave faltando, `TS2353` chave extra no record `STEP_COMPONENTS:
  Record<StepId, ReactNode>`). Uma implementação quebrada nesse ponto é um erro de compilação, não um
  caminho de runtime que este teste possa pegar em vermelho.

Nenhum outro caso ou arquivo foi descartado — todos os 130 casos medidos no baseline (129 após o
descarte mandatório) provaram-se falseáveis contra uma quebra real e dirigida na implementação que
guardam.
