# A tarefa por dentro, o kanban e o painel da nuvem com os componentes do app

Status: Draft
Data: 2026-11-24
Branch: `feat/tarefa-e-painel` (a partir de `design/painel-e-tarefa` ab662b90, PR #79; PRs empilhados)
Referência visual: `design/codm.pen`, frame **PROPOSTA — Tarefa por dentro & Painel na nuvem**; PNGs em `design/proposals/2026-11-24-tarefa-e-painel/`.

## Problema

- **Desktop, dentro da tarefa** (`IssueDetailSection`): a mesma tarefa aparece em quatro blocos empilhados — terminal, "mensagens roteadas aqui" (`routedMessages`), a linha do tempo (`IssueTimeline`, que relista as mesmas mensagens) e o campo de orientar. Os artefatos da tarefa não aparecem em lugar nenhum da tela (só na aba Artefatos da conversa, misturados com os das outras tarefas).
- **Desktop, aba Tarefas da conversa** (`SessionIssuesSection`): lista por `IssueStatus` (3 grupos), sem o estado vivo (`IssueLifeState`) que o painel e a tela global já mostram.
- **Nuvem** (`panel/controllers/PanelPage.ts`): um documento HTML de 355 linhas com CSS e JS próprios. Não usa `@codm/app-ui`, então nada do estilo do app chega lá; cada mudança de tela é feita duas vezes (React no desktop, string no painel).

## Decisões do dono (24/11)

1. Implementar o design do frame PROPOSTA, do spec ao build, sem pedir aprovação a cada passo.
2. **Descongelar** `screen-01-detalhe-da-tarefa` e `screen-tarefas-da-conversa` (`ITEM_PASS` em `fidelity-allowlists.ts`): o pedido de redesenhar essas duas telas é a ordem do founder que a regra exige. **Só essas duas.** Todas as outras entradas do `ITEM_PASS` seguem congeladas — em particular `tarefas-wrapper` (que usa `IssueRow`/`IssueCard`/`IssuesOverviewSection`), `screen-chat-resposta-direta` e `screen-chat-pausada-sussurro` (que usam `TranscriptBubble`, `Composer`, `StopAskCard`, `NeedsYouPanel`).
3. Mantidas da spec de 13/11: painel no **mesmo domínio da nuvem**, no mesmo caminho `/panel/g/:token` (sem DNS, sem host novo).

## Restrições encontradas no código (24/11, `design/painel-e-tarefa` ab662b90)

- **Link e cookie prendem o painel na origem da nuvem.** O daemon monta `${CODM_CLOUD_URL}/panel/g/<token>` (+ `#KEY`/`#L-n`) e esse link já está nos grupos (`issue/services/PanelPublisher/PanelPublisher.ts:74`, `thread/utils/issueSignal.ts:69`). O cookie do aparelho é `Path=/panel/g/<token>; HttpOnly; Secure; SameSite=Strict` (`panel/utils/panelIdentity.ts:66`). Qualquer host em outro site quebra identificação e ações. ⇒ a página React é servida **pela API da nuvem**, no mesmo caminho.
- **A nuvem não serve estáticos hoje.** Toda rota é `Controller`; HTML e bytes saem por `rawResponse` (prior art: `GetArtifactContent.ts` streama bytes com Content-Type). O runtime da imagem é **Node 22 distroless** (`docker/cloud.Dockerfile:73`) — ler arquivo com `node:fs`, nunca `Bun.file`. O builder da imagem copia só contracts, api e o SDK; os apps entram como stub de `package.json`.
- **O SDK já cobre o painel.** Todas as rotas `/panel/g/:token/*` têm hooks em `@codm/client-typescript/typescript-cloud` (`useGetPanelBoard`, `useGetPanelIssue`, `useListPanelMembers`, `useGetPanelIdentity`, `useRequestPanelCode`, `useVerifyPanelCode`, `useForgetPanelDevice`, `useRequestPanelAction`, `useGetPanelAction`). Sem base configurada o caminho fica relativo — mesma origem funciona sem config; `credentials: 'include'`.
- **O app-react não tem build web servível** (o modo web é TanStack Start + Nitro, nunca implantado) e o `__root` é do desktop (supervisão, loopback, title bar, PostHog). Os utilitários de cor do Tailwind (`bg-success-bright`, `text-caption-foreground`…) e `.label-eyebrow` só existem no `@theme` de `packages/app/react/src/index.css`. ⇒ o painel é uma **segunda entrada Vite dentro do app-react**, com raiz própria, importando o mesmo CSS.
- **Fontes são do sistema** (`index.css:31`, "no external fetch") ⇒ a CSP pode ser `default-src 'self'`.
- **Desktop — dados.** `GetIssueDetail` (contexto `issue`, exposto em MCP) não traz artefatos, autor, criação, pedinte, lote. A linha do tempo (`GetIssueTimeline`, ui) é a fonte mais completa por tarefa, mas não traz nome de quem falou; `GetSessionChat` traz `sender` por `entryId` e `artifact` por entrada. Não existe lista de artefatos por tarefa; `ListArtifacts(threadId)` traz `issueId?` por item.
- **Desktop — kanban.** `GetSessionIssues` não tem `lifeState`/pausa/esperas/escalada. `GetIssuesOverview` tem tudo isso e `threadId` em cada item (sem filtro de entrada).
- **Tempo real.** `useThreadRealtime.threadInvalidations` não invalida `getIssueTimelineQueryKey` nem `getIssuesOverviewQueryKey`.
- **Terminal: um observador por tarefa.** Montar `useTerminalStream` duas vezes dá 409; os e2e `10-terminal-tool-frame` e `92-demo-attach-artefato` exigem `terminal-stream-connected`, `terminal-action`, `terminal-action-tool` visíveis logo depois do `goto` da tarefa.
- **Rótulo de enum só pelo catálogo** (`packages/app/react/CLAUDE.md`): nada de `Record<Enum, string>` de rótulo em código — o HTML atual do painel tem seis desses mapas; somem.
- **`@codm/app-ui` não é varrido pelo rail de i18n** (`i18n-coherence.test.ts` olha só `packages/app/react/src`) ⇒ componente novo do ui não chama `t()`; todo texto entra por prop.

## Desenho

### 1. Componentes novos em `@codm/app-ui` (arquivos novos; nada existente muda de aparência)

Apresentacionais, sem SDK, sem `t()`, sem rota (link entra por `render`). Cada um: `packages/app/ui/src/components/<kebab>.tsx`, story em `components/stories/<kebab>.stories.tsx` (`UI/<Nome>`, `args`), props estendendo o root (`primitive-props` rail), `className` por `cn`.

| Arquivo | Exporta | Props principais | Pen |
|---|---|---|---|
| `status-pill.tsx` | `StatusPill` | `tone: 'working'｜'needsYou'｜'queued'｜'waiting'｜'stalled'｜'done'`, `children` | Pill / Status |
| `chat-bubble.tsx` | `ChatBubble`, `ChatEvent` | `ChatBubble`: `side: 'in'｜'out'`, `look: 'person'｜'agent'｜'steer'`, `author?`, `avatar?`, `time?`, `footer?` (recibo); `ChatEvent`: `tone?`, children | Chat / Pessoa · Agente · Orientação · Evento |
| `ask-card.tsx` | `AskCard`, `AskCardOption` | `code`, `kind` (rótulo), `age?`, `question`, `note?`, `locked?`, children = ações | Cartão / Decisão |
| `artifact-tile.tsx` | `ArtifactTile`, `ArtifactChip` | `glyph`, `name`, `kind`, `when?`, `thumb?` (nó), `render?` (link/botão) | Artefato / Tile · Chat / Artefato |
| `task-card.tsx` | `TaskCard` | `taskKey`, `title`, `meta?`, `metaTone?: 'default'｜'strong'｜'warn'`, `metaIcon?`, `status?` (nó, some no kanban), `selected?`, `render?` | Cartão / Tarefa |
| `kanban.tsx` | `KanbanColumn`, `KanbanColumnHeader` | `tone` (mesmo de `StatusPill`), `title`, `count`, `emphasis?` (cabeçalho escuro) — compõe com `Board`/`BoardColumnBody` existentes, sem alterá-los | Coluna / Kanban |
| `steer-composer.tsx` | `SteerComposer` | `value`, `onValueChange`, `onSubmit`, `pending?`, `placeholder`, `hint`, `sendLabel` | Compositor / Orientar |

Os tons mapeiam para tokens existentes (`--primary`, `--success-bright`, `--status-paused`, `--status-attention`, `--attention-surface`, `--caption-foreground`); nenhum token novo. Raios pela escada assimétrica existente (`rounded-asymmetric-*`).

### 2. Lógica compartilhada (app-react, `src/lib/task/`)

- `issueBoard.ts` — `BOARD_COLUMN_OF: Record<IssueLifeState, BoardColumn>` com seis colunas, as mesmas do painel de hoje: `QUEUED`→`queued`; `RUNNING`→`working`; `WAITING_PERSON`→`needsYou`; `WAITING_PROVIDER`/`WAITING_RETRY`/`WAITING_BUDGET`→`waiting`; `REMINDED`/`STALLED`/`PAUSED`→`stalled`; `DONE`→`done`. Ordem das colunas fixa. Usado pelo kanban do desktop e pelo do painel. (O `IssuesOverviewSection` tem um mapa privado próprio e fica como está — tela congelada; unificar é trabalho de quando o founder descongelar `tarefas-wrapper`.)
- `taskConversation.ts` — função pura `buildConversation(items: IssueTimelineItem[], join?: { senderOf?(entryId), artifactOf?(artifactId), chatEntryHasArtifact?(entryId) }): ConversationItem[]`. Um despacho `Record<IssueTimelineItemKind, …>` exaustivo (tipo novo ⇒ `tsc` exige o caso). Regras:
  - `MESSAGE` `CONTACT` → bolha de pessoa (nome e avatar pelo `senderOf`; sem `senderOf` — nuvem — sem nome, rótulo genérico); `SYSTEM`/`DIRECT` → bolha do agente (+ selo de roteamento quando há `routing`); `WHISPER` → bolha de orientação; `ACTION` → linha de evento. Mensagem cuja entrada de chat entregou um artefato some (o item `ARTIFACT` correspondente já o mostra) — fim da duplicata de hoje.
  - `STEER` → bolha de orientação com recibo (`deliveredAt`/`readAt`); lembrete automático (`reminder`) → linha de evento.
  - `ARTIFACT` → chip de artefato (com `artifactOf` vira clicável).
  - `STOP_RAISED` com `ask` ainda aberto → cartão de decisão/pergunta (o aberto vem de fora: `openStopIds`); fechado → linha de evento. `STOP_RESOLVED` → linha "respondida: <rótulo>".
  - `CREATED`, `TURN_STARTED`, `COMPLETED`, `ARCHIVED`, `PAUSED`, `RESUMED`, `REGRET_WINDOW`, `BATCH_LINKED`, `PUBLISH_RAN`, `NUDGED`, `RETRY_SCHEDULED`, `SUPERVISOR_REVIEWED` → linha de evento com o mesmo texto que a `IssueTimeline` usa hoje (mesmas chaves `session.timeline*`). `PUBLISH_RAN` mantém o botão de saída (carregamento preguiçoso, só no desktop); `BATCH_LINKED` mantém o link do lote.
- `components/task/` — componentes conectados finos que renderizam `ConversationItem` com os primitivos do §1: `TaskConversation`, `TaskAskCard` (decisão/pergunta: opção ou texto; trava "só quem pode liberar"), `TaskStopCard` (parada sem `ask`: botões de resolução), `TaskCardMeta` (a linha de baixo do cartão). Recebem as **ações por prop** (`onAnswer`, `onResolve`) para servir aos dois lados: desktop liga nos hooks do daemon, painel liga em `POST /actions`.

### 3. Desktop — P1, a tarefa por dentro (`IssueDetailSection`, reescrito)

| Campo no pen | Fonte |
|---|---|
| Chave, título, selo de estado | `useGetIssueDetail` → `issue.key/title/lifeState/paused` |
| "pedida por X · HH:MM" | primeira `MESSAGE` `CONTACT` da timeline → `sender.displayName` do `useGetSessionChat(threadId)` pelo `entryId`; hora = item `CREATED` |
| "· Claude Code" | `detail.provider` |
| "· N decisões abertas" | `useGetNeedsYouPanel(threadId).stops` com `issueId` |
| Selos de espera/tentativa/escalada | `ProviderWaitBadge`/`RetryWaitBadge`/`EscalatedBadge` existentes (`components/console/IssueRow.tsx`), sem mudança |
| Pausar/Retomar, Arquivar | `usePauseIssue`/`useResumeIssue`/`useArchiveIssue` (como hoje) |
| Conversa da tarefa | `useGetIssueTimeline(issueId)` + junção §2 (chat da conversa, `useListArtifacts`) |
| Cartão de decisão/pergunta | stops abertos do `useGetNeedsYouPanel` com `ask`; resposta pelo `useAnswerStop` (lógica extraída de `StopAskCard` para um hook `useAnswerAsk`, sem mudar a aparência do `StopAskCard`) |
| Parada sem pergunta (botões) | stops abertos sem `ask`, `availableResolutions` → `useResolveStop` |
| Orientação falhada | `detail.steers[].failed` casado com o `STEER` da timeline por `sentAt` = `at` |
| Campo Orientar | `SteerComposer` + `useSteerIssue` |
| Artefatos · N (lateral) | `useListArtifacts(threadId)` filtrado por `issueId`; imagem mostra miniatura (`artifactContentUrl`), clique abre a prévia existente (`ArtifactPreview`, mesmo diálogo) |
| Sessão (lateral) | o `TerminalPanel` de hoje, **montado uma vez** na lateral, aberto por padrão (linhas visíveis no carregamento, mesmos `data-testid`), altura compacta; "Expandir" aumenta a altura no lugar (disclosure local) — nunca um segundo `useTerminalStream` |
| Detalhes: Pedida por / Agente / Tentativas / Lote | derivados: pedinte (acima), `detail.provider`, contagem de `RETRY_SCHEDULED`, último `BATCH_LINKED` |

Tempo real: `threadInvalidations` passa a invalidar o **prefixo** das timelines de tarefa (todas as montadas da conversa) em `message_ingested`, `orchestrator.replied`, `stop_raised`, `stop_resolved`, `issue.completed/archived`, `artifact.recorded`.

### 4. Desktop — P2, a aba Tarefas da conversa em kanban (`SessionIssuesSection`, reescrito)

| Campo no pen | Fonte |
|---|---|
| Colunas e contagens | `useGetIssuesOverview({ includeArchived: false })` filtrado no cliente por `threadId` → `BOARD_COLUMN_OF[lifeState]` |
| Linha de resumo | contagens por coluna |
| "Concluídas · N ›" | coluna `done` escondida por padrão; o link alterna o parâmetro de busca `done` da rota (case 2 de estado — compartilhável) |
| Meta do cartão — Precisa de você | pergunta aberta (`needsYou` por `issueId`) → "D1 · <pergunta>" |
| Meta — Esperando | `retryingAt` → "nova tentativa às HH:MM"; `waitingForProviderUntil` → "volta às HH:MM"; `WAITING_BUDGET` → rótulo do enum |
| Meta — Parada | `escalatedAt` → "escalada pelo supervisor"; `paused` → "pausada"; senão rótulo do enum |
| Meta — Fazendo | "N artefatos" (`useListArtifacts` por `issueId`) |
| Clique no cartão | navega para `/threads/$threadId/issues/$issueId` |

Tempo real: `getIssuesOverviewQueryKey` entra nos mesmos casos que hoje invalidam `getSessionIssuesQueryKey`.

**Cortes declarados (sem fonte de lista):** "(2 de 5)", "pausada por <nome>", "começou HH:MM", "lote L-31 · item 4" nos cartões. Ficam na conversa da tarefa, onde a timeline tem a informação.

### 5. Painel da nuvem em React (`packages/app/react/src/panel/`)

**Entrada própria.** `vite.panel.config.ts` (raiz `src/panel/web/index.html`, `base: '/panel/'`, saída `packages/app/react/dist-panel/` com `assets/` nomeados por hash e `manifest.json`), script `build:panel` + alvo nx `build-panel`. `main.tsx` monta `PanelApp` com React Query, i18n (mesmo catálogo `locales/pt.json`/`en.json`; idioma do navegador, padrão pt-BR) e o mesmo `index.css`. **Não importa** `routes/`, `__root`, `services/registry`, analytics/PostHog, `useServerEvent*`, `ServicesProvider` (rail §6). O SDK é o `typescript-cloud` com base relativa.

**Telas** (uma árvore responsiva; o corte é o breakpoint `md`):

| Tela (pen) | Composição | Fonte |
|---|---|---|
| N6 kanban largo / N7 kanban celular | cabeçalho (grupo, contagens, saúde, lote, "Você · Ana"/Identificar-me) + 6 `KanbanColumn` (§2 `issueBoard`); no celular, abas das colunas + colunas com snap horizontal | `useGetPanelBoard` (recarrega a cada 15 s — o painel não tem SSE; é o mecanismo da spec de 13/11) |
| Meta dos cartões | como §4, com dois campos **novos e aditivos** no `/board` (ver abaixo) | |
| N2/N3 tarefa no celular, N5 tarefa larga | tarefa abre pelo hash `#KEY` (e o hash muda ao abrir, como hoje); celular: abas Conversa / Artefatos; largo: lista de tarefas à esquerda, conversa no centro, artefatos + detalhes à direita | `useGetPanelIssue` |
| Conversa | `TaskConversation` (§2) sem `senderOf` | timeline do `/issues/:id` |
| Decisão/pergunta/parada | `TaskAskCard`/`TaskStopCard` com `onAnswer`/`onResolve` → `POST /actions` (`ANSWER_ASK`, `ANSWER_STOP`) | `openStops` do `/issues/:id`; trava `releaseRequired && !me.canRelease` |
| Pausar/Retomar, Orientar | `POST /actions` (`PAUSE`/`RESUME`/`STEER`) | |
| Situação da ação | `GET /actions/:id` a cada 3 s até 4 min: enviado → feito / recusado (motivo pelo código de erro no catálogo `errors.*`) / sem resposta | `useGetPanelAction` |
| N4 Identificar-me | folha (sheet): quem é você (membros) → código no WhatsApp (6 dígitos) → confirmar; "Escolher outro nome"; "Sair" | `/members`, `/identify`, `/verify`, `/me`, `/forget` |
| Lote `#L-n` | diálogo com itens, destino e link para a tarefa | `board.batches` |
| Link inválido / sem contato há N min / saúde da cota | estados do cabeçalho e página vazia | `/board` 404; `daemonLastSeenAt`; `health` |

**Campos novos no `/board` (nuvem, aditivos, sem migração):** cada issue ganha `openAsk?: { code, question }` (do `openStops` já guardado no grupo) e `artifactCount: number` (itens `ARTIFACT` da timeline já guardada). Calculados em `GetPanelBoard`; daemons antigos não mudam nada. `bun emit-openapi && bun sdk` commitados.

**Cortes declarados no painel:**
- **Nome de quem falou** — a timeline sincronizada não carrega identidade (decisão das fases 1–3: o painel nunca diz *quem* respondeu). Mostrar nomes é decisão de privacidade do dono; fica para depois. As bolhas usam rótulos de papel.
- **Prévia e abertura de artefato** — na nuvem o artefato é só nome + tipo (galeria R2 pendente). Tile com o glifo do tipo, sem link.
- **N1 (quadro em lista)** — era alternativa ao N7; não entra.

### 6. Servir o painel pela nuvem

- **Build.** `cloud.Dockerfile` ganha um estágio `panel-web` (oven/bun): copia os manifests do workspace + `packages/app/react` + `packages/app/ui` + o SDK, `bun install --frozen-lockfile`, `bun run --cwd packages/app/react build:panel`. O estágio do builder copia só `dist-panel/` para `packages/api/typescript/dist/panel-web/`. `scripts/build.ts` do api copia `dist-panel` para `dist/panel-web` quando `CODM_BUILD_PANEL_WEB=1` (setado só no Dockerfile da nuvem) e **falha** se a pasta não existir; o rail `build-output.test.ts` cobre os dois casos (sem a flag não toca; com a flag e sem bundle, erro).
- **Runtime.** Porta `PanelWebBundle` (Service abstrato por ambiente, contexto `panel`): `real` lê `dist/panel-web/index.html` e `manifest.json` com `node:fs` uma vez no boot e guarda o conjunto de arquivos servíveis (nome → tipo); `mock`/`integration` devolvem uma casca fixa. Sem bundle no perfil cloud de produção ⇒ o boot falha (alto); em `dev:cloud` a casca responde 503 com a instrução `bun run --cwd packages/app/react build:panel`.
- **`GET /panel/g/:token`** (`PanelPage`) devolve a casca. Cabeçalhos mantidos: `Content-Type: text/html; charset=utf-8`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `Cache-Control: no-store`; novos: `X-Robots-Tag: noindex, nofollow`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`. O token nunca é gravado na casca.
- **`GET /panel/assets/:file`** (controller novo, público): serve **só** nomes presentes no conjunto do manifesto (comparação exata; qualquer outro valor, inclusive `..`, `/`, `%2e`, responde 404 sem tocar o disco), `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, tipo pelo manifesto.
- **Rails.** (a) `packages/app/react/tests/architecture/panel-web-fence.test.ts`: nenhum arquivo de `src/panel/**` importa `@/routes`, `__root`, `@/services/registry`, PostHog/analytics, `useServerEvent*`, `ServicesProvider`; nenhum `dangerouslySetInnerHTML` em `src/panel/**`. (b) `PanelPage.test.ts` reescrito: cabeçalhos + CSP da casca; controller de assets recusa nomes fora do manifesto (tentativas de travessia) e serve um nome do manifesto com o tipo certo. Os mapas de rótulo que o teste antigo cobria viram chaves do catálogo (`enums.*`), cobertas pela paridade pt/en.

### 7. Fidelidade

- Sai do `ITEM_PASS`: `screen-01-detalhe-da-tarefa` e `screen-tarefas-da-conversa` (decisão 2). Nenhuma outra entrada muda.
- No `.pen`, os frames P1 e P2 substituem as telas antigas dentro de **Mesclado / Tarefa & Config da conversa** e **Mesclado / Conversa**, com o **mesmo nome de frame** (o slug continua o mesmo); a PROPOSTA continua como referência do painel.
- `design:export` ganha `--only=<slug,…>` (filtro puro, testado) para reexportar spec + alvo **só** dessas duas telas — os outros ~40 alvos não são reescritos.
- As stories `issue-detail.stories.tsx` (`Full`) e `issues.stories.tsx` (`TarefasDaConversa`) passam a montar as telas novas (mocks: timeline, artefatos, overview, needsYou). `bun fidelity` roda para as duas e o placar entra no PR.

## Paridade (nada que existe some)

**Desktop:** selos de espera/tentativa/escalada · Pausar/Retomar · Arquivar · paradas sem pergunta com botões de resolução · pergunta/decisão com opção e texto e nota do padrão · saída da publicação (mostrar/ocultar) · link do lote · orientação com entregue/lida/falhou · lembrete automático · empurrões, nova tentativa, supervisor, janela de arrependimento · terminal ao vivo com ações de ferramenta · prévia de artefato (diálogo existente).

**Painel:** seis colunas por `lifeState` · saúde da cota (OK/perto/segurando/recusando, vagas, fila) · "sem contato com o codm há N min" · link inválido · lote `#L-n` com destinos · abrir tarefa por `#KEY` e o endereço refletir a tarefa aberta · recarga a cada 15 s · identificar-me em dois passos e sair · pergunta com opção e texto, nota do padrão, trava "só quem pode liberar" · parada com resoluções · pausar/retomar · orientar · situação da ação (enviado/feito/recusado/sem resposta) · nova tentativa às HH:MM · escalada pelo supervisor · textos só como texto (sem HTML vindo de dado).

## Testes

- **ui:** um teste por componente com lógica de variante (classes por tom, `emphasis`, `locked` desabilita ações) + stories; `primitive-props` cobre as props.
- **lib/task:** `issueBoard` (todo `IssueLifeState` cai numa coluna — exaustivo por tipo e por teste); `buildConversation` com uma timeline de cada `kind`, a junção de remetente, a deduplicação mensagem+artefato, a orientação falhada.
- **Desktop:** `IssueDetailSection` e `SessionIssuesSection` pelo harness (`useIntegrationBackend`), asserções por chave de catálogo (rail `i18n-assertions`); `useThreadRealtime.test` com os casos novos de invalidação; stories atualizadas; e2e `10` e `92` rodados (ou declarados não rodados no PR).
- **Painel:** `PanelApp` em happy-dom com respostas do SDK mockadas: quadro, abrir por hash, responder pergunta (corpo do `POST /actions` exato), trava de liberação, estados de erro; rail da cerca.
- **Nuvem:** `GetPanelBoard` com `openAsk`/`artifactCount`; `PanelPage`/assets como no §6; `build-output` com a flag.
- **Imagem:** `docker build -f docker/cloud.Dockerfile` local + subir o container com um Postgres descartável e pedir a casca e um asset (ou registrar no PR que não rodou e por quê).

## Entregas e ordem

Dois PRs empilhados (rascunho até o dono pedir o merge — o merge na `main` implanta a nuvem):

- **PR A — ui + desktop + fidelidade** (base `design/painel-e-tarefa`): §1, §2, §3, §4, §7.
- **PR B — painel web + nuvem** (base PR A): §5, §6.

## Rollout

- Nuvem: sem migração pg. A imagem nova serve o painel novo no mesmo link; os campos aditivos do `/board` são calculados na nuvem. (As migrações pg 0007–0009 da 0.10.0 seguem como pré-requisito independente.)
- Desktop: chega na próxima versão; nenhuma mudança de contrato do daemon além de nenhuma (só telas e invalidação).

## Fora de escopo

Nome do autor no painel; prévia/abertura de artefato na nuvem (R2); quadro em lista (N1); arrastar cartões; SSE no painel; migrar `IssuesOverviewSection`/`IssueCard`/`IssueRow`/`TranscriptBubble`/`Composer`/`StopAskCard`/`NeedsYouPanel` para os componentes novos (telas congeladas); unificar o mapa de colunas do overview.

## Riscos

- **CSP e bibliotecas:** algo que injete `<style>` ou `eval` quebraria o painel — `style-src 'unsafe-inline'` cobre estilos; `script-src 'self'` sem exceção. Verificado no teste da imagem.
- **Tamanho da imagem da nuvem:** o estágio `panel-web` instala o workspace inteiro, mas é descartado; só `dist-panel` (dezenas de KB gzip) entra no runtime.
- **Terminal na lateral:** altura compacta pode esconder linhas que os e2e esperam visíveis — por isso o painel abre aberto, com a mesma lista virtual.
- **Duas fontes de verdade para colunas** (overview congelado × `issueBoard`) até o descongelamento de `tarefas-wrapper`.

## Revisão (skill spec-review, 2026-11-24)

Base: `feat/tarefa-e-painel` @ ab662b90. Fontes:
- lidas: `CLAUDE.md`, `packages/app/react/CLAUDE.md`, os arquivos tocados e o SDK em `packages/client/dist/typescript/src/{typescript,typescript-cloud}`;
- consultadas por busca: `docs/FRONTEND.md`, `component/react/registry.yaml`, `controller/typescript/registry.yaml`;
- PNGs 02, 03, 04, 05, 07, 10 e 11 conferidos.

### Confirmado (sem ação)

- Hooks existem com os nomes citados (`typescript/hooks/use{GetIssueDetail,GetIssueTimeline,GetSessionChat,ListArtifacts,GetNeedsYouPanel,AnswerStop,ResolveStop,SteerIssue,PauseIssue,ResumeIssue,ArchiveIssue,GetIssuesOverview}.ts`; `typescript-cloud/hooks/use{GetPanelBoard,GetPanelIssue,ListPanelMembers,GetPanelIdentity,RequestPanelCode,VerifyPanelCode,ForgetPanelDevice,RequestPanelAction,GetPanelAction}.ts`).
- `GetSessionChat.transcript[]` traz `artifact?` (`types/GetSessionChat.ts:176`) e `sender?` (`:205`), indexados por `entryId`. O transcript vem inteiro, sem LIMIT (`thread/usecases/GetSessionChat.ts:204-208`).
- MESSAGE `entryId` é o `transcriptEntries.id` (`issue/utils/issueTimeline.ts:129-131`), o mesmo id do `entryId` do chat. ARTIFACT `artifactId` é o `artifacts.id` (`issueTimeline.ts:157`), o mesmo de `ListArtifacts.artifactId` (`artifact/usecases/ListArtifacts.ts:48`). `ListArtifacts` traz `issueId?` (`types/ListArtifacts.ts:30`).
- O `at` do STEER e o `sentAt` de `detail.steers` vêm da mesma coluna, `agentMailbox.createdAt` (`issueTimeline.ts:144`, `GetIssueDetail.ts:169`).
- As stops de NeedsYou têm `issueId?`, `availableResolutions` e `ask` com `releaseRequired`/`defaultLabel` (`types/GetNeedsYouPanel.ts:56,80,112`). Os itens do Overview têm `threadId`, `paused`, `lifeState`, `retryingAt`, `waitingForProviderUntil` e `escalatedAt` (`types/GetIssuesOverview.ts:92-112`); o único parâmetro é `includeArchived` (`:13`).
- O corpo de `RequestPanelAction` é uma união de 5 membros (`shared/schemas/PanelActionSchema.ts:25-33`; SDK `typescript-cloud/types/RequestPanelAction.ts:70-129`).
- Sem base configurada, o SDK devolve o caminho relativo (`http/config.ts:52-54`) e usa `credentials: 'include'` (`http/client.ts:151`). As rotas não têm prefixo de versão (`core/src/types/MainRouter.ts:71`).
- O link (`PanelPublisher.ts:74`) e o cookie `Path=/panel/g/<token>` (`panelIdentity.ts:66-68`) batem com a spec. O runner é Node 22 distroless (`docker/cloud.Dockerfile:73`). Ler arquivo com `node:fs` tem precedente em `GetArtifactContent.ts:2,126`.
- `openAsk`/`artifactCount` saem sem migração: `panelGroupByToken` lê a linha inteira com `openStops` (`panel/usecases/panelGroupByToken.ts:6`; `contracts/src/db/pg/schema/panel.ts:69`), e o board já faz `select()` de `panel_issues` com o `timeline` jsonb (`GetPanelBoard.ts:54-57`, `panel.ts:92`).
- Um segundo `useTerminalStream` responde 409 (`agent/controllers/StreamTerminalSession.ts:55`). Os e2e exigem `terminal-stream-connected` e `terminal-action(-tool)` (`packages/e2e/tests/10-terminal-tool-frame.spec.ts:58,74-82`).
- O rail de i18n só varre `packages/app/react/src` (`api/typescript/tests/architecture/i18n-coherence.test.ts:43`). Vite 7 tem `baseline-widely-available` como alvo padrão, então o top-level await de `lib/i18n.ts:15` passa num config novo.

### Críticos

**C1 — A cerca do painel não é transitiva, e o código que vai ser compartilhado já importa barrels do desktop.**
- `@/hooks` reexporta `useServerEvents`, `useAnalyticsConsent`/`useAnalyticsPageview` e `useCloudLogout` (`src/hooks/index.ts:8-12`).
- `@/lib` reexporta `auth` (cliente better-auth), `config` (`VITE_API_URL`) e `errors` (`@/stores`, `sonner`) (`src/lib/index.ts:1-5`, `lib/errors.ts:1-3`).
- `IssueTimeline.tsx:13-16` usa `useLocale` de `@/hooks` e `enumLabel` de `@/lib`. `components/task` e `lib/task` vão herdar isso, e o rail §6(a), que só olha `src/panel/**`, passa verde com o bundle público carregando código do desktop.
- **Mudança:**
  - O rail calcula o fecho de imports a partir de `src/panel/web/main.tsx` e falha em qualquer módulo proibido, ou checa a lista de módulos do bundle gerado.
  - O código compartilhado importa módulos-folha (`@/lib/enums`, `@/lib/format`, `@/hooks/useLocale`), nunca os barrels `@/lib` e `@/hooks`.
  - A fixture negativa do rail inclui um import indireto.

**C2 — Com o Tailwind na raiz `src/panel/web/`, as classes do painel não são geradas.**
- O `@tailwindcss/vite` usa a `root` do Vite como base da detecção automática (`node_modules/@tailwindcss/vite/dist/index.mjs`, `e.root`). O próprio `index.css:6-9` explica que "o Tailwind v4 só escaneia a raiz do projeto".
- Com root em `src/panel/web/`, ficam de fora `src/panel/*.tsx`, `src/components/task/**`, `src/lib/task/**` e todo o resto do `src/`. Só `@source "../../ui/src"` é explícito. As classes usadas só nesses arquivos não seriam emitidas. Isso foi lido no fonte do plugin; não rodei um build para medir.
- **Mudança:** um CSS de entrada do painel (`src/panel/web/panel.css`) com `@import "../../index.css";` e `@source "../..";` (o `src/` do app-react). Ou root = `packages/app/react`, com `build.rollupOptions.input` apontando para o html e `outDir` ajustado. Incluir um teste do build que procure uma classe usada só em `components/task`.

**C3 — `buildConversation` não recebe o que o cartão de decisão precisa.**
- O STOP_RAISED da timeline só tem `ask.{code,question,options,dueAt}` (`types/GetIssueTimeline.ts:288-305`).
- Ficam de fora `reply.kind` (OPTION × TEXT), `releaseRequired`, `defaultLabel` e as resoluções. Eles só existem nas stops de NeedsYou (desktop, `GetNeedsYouPanel.ts:80-112`) e em `openStops` (painel, `PanelActionSchema.ts:65-71` + `AskViewSchema`).
- A assinatura do §2 só traz `senderOf/artifactOf/chatEntryHasArtifact`, e `openStopIds` aparece só no texto. Como está escrito, não dá para renderizar resposta por texto, trava, nota do padrão nem botões de parada.
- **Mudança:** `join.openStopOf(stopId) → { ask?: AskView; resolutions: StopResolution[] }`. O desktop mapeia NeedsYou (`availableResolutions`), o painel mapeia `openStops` (`resolutions`). As duas formas de `ask` são o mesmo `AskView`. Um item aberto vira o cartão a partir do *open stop*, e não do item da timeline.

### Moderados

**M1 — Ações por prop entre componentes compartilhados (§2).**
- Passar `onAnswer`/`onResolve` de `TaskConversation` até `TaskAskCard` é prop drilling de callback, proibido em `docs/FRONTEND.md:45` e CMP-P10 (`component/react/registry.yaml:253-256`). "Conectados finos" que recebem dado e ação por prop são, na prática, apresentacionais.
- Há ainda renderizadores que só existem no desktop:
  - PUBLISH_RAN chama `useGetPublishRunOutput`, que é do daemon (`IssueTimeline.tsx:282`).
  - BATCH_LINKED usa `getRouteApi('/(app)/threads/$threadId')` e um `Link` para rota do desktop (`IssueTimeline.tsx:18,221-233`).
- **Mudança:** uma porta `TaskActions` em contexto React, com um provider por host:
  - desktop: `useAnswerStop`/`useResolveStop`/`useSteerIssue`/pausa;
  - painel: `useRequestPanelAction` + situação da ação.
  - O mesmo contexto oferece slots opcionais por tipo (`renderPublishOutput`, `batchHref`).
  - Item por prop só para folhas (`docs/FRONTEND.md:36`).

**M2 — P2 com `GetIssuesOverview` do dono inteiro perde paridade.**
- O filtro é só `ownerId` (`issue/usecases/GetIssuesOverview.ts:87`), filtrado depois no cliente. A tela de hoje mostra as arquivadas da conversa, a nota de autoarquivamento e o estado vazio (`SessionIssuesSection/index.tsx:41-69`), e `includeArchived: false` derruba os três. Nenhum deles está na lista de Paridade.
- **Mudança (aditiva):** estender os itens de `GetSessionIssues` com `lifeState`/`paused`/`waitingForProviderUntil`/`retryingAt`/`escalatedAt`, usando os utilitários que `GetIssueDetail.ts:118-124` já usa. Assim a query continua por conversa, e `useThreadRealtime` já invalida `getSessionIssuesQueryKey` (`useThreadRealtime.ts:64,71,75`). Pôr arquivadas, nota e vazio na Paridade.

**M3 — Invalidação da timeline.**
- `getIssueTimelineQueryKey(undefined)` não serve de prefixo. A chave é `[{url, params:{issueId}}]` (`hooks/useGetIssueTimeline.ts:12`), e o `partialMatchKey` compara `undefined` com a string e falha (`@tanstack/query-core/build/modern/utils.js:94-114`).
- Já `[{ url }]` funciona como prefixo, porque só as chaves do lado parcial são comparadas. Para não redigitar a forma da chave, derivar a `url` da fábrica do SDK, como `artifactContentUrl` faz: `[{ url: getIssueTimelineQueryKey('').at(0)!.url }]`. Isso cabe no retorno `QueryKey[]` de `threadInvalidations` (`useThreadRealtime.ts:47`). Um `predicate` não cabe nesse retorno.
- Quase todos os payloads trazem `issueId` (`types/ListenEvents.ts:2498-2837`). Usar a chave exata quando houver `issueId` e o prefixo `[{url}]` quando faltar.
- Gatilhos que faltam:
  - `onSuccess` do steer invalida só o detalhe (`IssueDetailSection/index.tsx:427`), então a orientação nova não aparece na conversa;
  - pausar/retomar (`:176-177`) e arquivar (`:82-83`) precisam invalidar timeline e overview (ou session issues).
- Não há frame SSE de pausa/retomada/turno/nova tentativa/empurrão (`useThreadRealtime.ts:24-34`), então a coluna do kanban não anda ao vivo. Declarar essa limitação.

**M4 — Orientação falhada casada por timestamp.**
- Os valores batem (ver Confirmado), mas um join por instante ISO em ms é frágil.
- `detail.steers` inclui as linhas REMINDER (`GetIssueDetail.ts:125-135`) que a timeline filtra (`issueTimeline.ts:79`).
- O painel nunca vai saber que a orientação falhou.
- **Mudança:** campo aditivo `failed: boolean` no item STEER, vindo de `agentMailbox.deadAt`. Vale para os dois lados e acaba com o join. Ajustar o Rollout, que hoje diz "nenhuma mudança de contrato do daemon".

**M5 — Campos do `/board`.**
- O board não tem `paused` (`GetPanelBoard.ts:19-33`; não há coluna em `panel.ts:75-92`). O "como §4" do painel precisa usar `lifeState === 'PAUSED'`, como `PanelPage.ts:263` faz.
- Uma tarefa pode ter várias asks abertas (`GetPanelIssue.ts:27-31`). Trocar `openAsk?` por uma lista, ou definir "a mais antiga por `raisedAt`".
- `{code, question}` não basta para a meta dos PNGs 04 e 05: "P1 · segue com "não" às 11:15" precisa de `kind`, `defaultLabel` e `dueAt`. Enviar o `AskView` inteiro (`AskViewSchema`), que já está em `openStops`.

**M6 — Build e serviço do bundle.**
- `scripts/build.ts:97` apaga `dist/`, então copiar no Dockerfile para `api/.../dist/panel-web` antes do `bun run build` se perde. Os dois mecanismos de cópia descritos conflitam. Escolher um: o builder copia `dist-panel` para `packages/app/react/dist-panel` e o `build.ts` estagia.
- `build-output.test.ts` é um rail **estático** sobre a fonte (`:35-50`, `DERIVED_DIR_MODULES`), não um teste de comportamento com flag. O módulo `real` deve derivar `panel-web` de `import.meta.url` e entrar em `DERIVED_DIR_MODULES`. No runtime o `dist/` vira `/app` (`cloud.Dockerfile:89`), então nunca usar um caminho relativo ao cwd.
- `CODM_BUILD_PANEL_WEB` é um booleano solto (NN5). Declarar a chave, com seus consumidores, no ENV REGISTRY (`template.config.ts:319`), ou derivar do placement cloud do contexto (`panel/context.ts:9`).

**M7 — DI do `PanelWebBundle`.**
- `expandBindings` usa `real` como padrão de `integration` e `integration` como padrão de `e2e` (`core/src/types/Registry.ts:87-88`). "mock/integration devolvem casca" exige `integration` explícito.
- "Falha no boot" precisa de `onStart` (`core/src/types/BoundedContext.ts:135,146`), porque o DI resolve preguiçosamente.
- Produção e `dev:cloud` rodam ambos em `real`: o ambiente padrão é `real` (`BoundedContext.ts:106`), e o `dev:cloud` é só `bun run --watch ./src` com `CODM_PROFILE=cloud` (`api/typescript/project.json:94-105`). Distinguir "falha" de "503" é um `if` de ambiente: declarar como config nomeada (ex.: `panelWeb: 'required' | 'optional'`).

**M8 — Fidelidade: substituir frames quebra o `exportNodeId`.**
- O `exportNodeId` curado é preservado **por id do nó** (`scripts/pencil-export.ts:163-180`). Frames novos perdem `N9dUcw`/`g0oyA` (`design/system/pen/screens.manifest.json:150-156,276-282`), e o alvo passa a exportar o frame inteiro (`pencil-export.ts:497`).
- O estágio de specs reconstrói o manifesto a partir da descoberta (`:466-469`), e a execução padrão inclui tokens (`:534-537`).
- **Mudança:**
  - Editar o **conteúdo** dos frames existentes (mantém os ids), ou recurar o `exportNodeId` no mesmo PR.
  - `--only` filtra só os laços de escrita/exportação, depois de `assignSlugs`. A descoberta e o manifesto continuam completos, e `--only` implica `--specs --targets`, sem tokens.
  - Conferir se P1/P2 cabem em 1440×900.

**M9 — Paridade do painel incompleta (diff com `PanelPage.ts`).** Pôr na lista:
- ações só para quem se identificou e fora de DONE (`:261`);
- botões de resolução de parada só com `canRelease` (`:267`);
- recarregar a tarefa aberta depois de identificar/sair (`:223`);
- lote com situação, motivo/nota e botão que fecha o lote e abre a tarefa (`:186-200`);
- fechar apaga o hash (`:203,206`);
- `document.title` (`:135`);
- saúde com janela%/semana% (`:131`);
- nota da pergunta com o padrão "15 min depois de chegar ao grupo" quando não há `dueAt` (`:280`);
- limite de 2000 caracteres (`:76,294`);
- **modo escuro:** hoje `color-scheme: light dark` + `prefers-color-scheme` (`:47-48`), e o app usa a variante de classe `.dark` (`index.css:11`). O painel precisa aplicar `.dark` pela media query, senão perde o modo escuro.
- Os 14 códigos do `ACT_ERR` (`:258`) existem todos em `errors.*` no `pt.json`, conferidos um a um.

**M10 — Diálogos no painel.**
- O host do `useDialogStore` está montado em `routes/(app)/route.tsx:19,64`, e o `PanelApp` não tem host.
- **Mudança:** host próprio no `PanelApp`. O hash (`#KEY`/`#L-n`) é a fonte de verdade de tarefa e lote abertos (caso 2). A folha "Identificar-me" vai por `useDialogStore`. Registrar a decisão.

**M11 — A deduplicação mensagem+artefato não acontece na nuvem.**
- O painel não tem o join do chat. A entrada SYSTEM que entregou o artefato vira bolha (talvez vazia) e chip ao mesmo tempo. O "enviado ao grupo" dos PNGs 07/10 não tem fonte.
- **Mudança:** `artifactId?` aditivo no item MESSAGE (a coluna `transcriptEntries.artifactId` já existe, `GetSessionChat.ts:217`). Resolve os dois lados e dispensa `chatEntryHasArtifact`.

**M12 — Escopo acima do teto de ~7 entregas (CLAUDE.md, "stop and propose a split").**
- PR A tem cerca de 14: 7 componentes de UI, `issueBoard`, `buildConversation`, 4 componentes de tarefa, P1, P2, `useAnswerAsk`, tempo real, `--only`, `.pen` e stories.
- PR B tem cerca de 10.
- **Divisão proposta (contrato primeiro):**
  - **A0 — contrato:** `failed` no STEER, `artifactId` no MESSAGE, campos de vida no `GetSessionIssues`, `openAsks`/`artifactCount` no `/board`, e `bun sdk`.
  - **A1:** `@codm/app-ui`, `lib/task` e stories.
  - **A2:** P1 + tempo real + `useAnswerAsk`.
  - **A3:** P2 + fidelidade.
  - **B1:** serviço na nuvem (Dockerfile, `build.ts`, porta, assets, CSP), ainda servindo o HTML antigo.
  - **B2:** `PanelApp`, troca da casca e rails.

### Leves

- **L1 — Cortes não declarados no desktop:** "Orientação · Bruno" (PNGs 03/07/10), porque o STEER não tem autor (`GetIssueTimeline.ts:210-234`; `GetIssueDetail.ts:71-79`), e "Agente: … · sessão 2", que não tem fonte.
- **L2 — `reminder` do STEER é sempre `false`** (`issueTimeline.ts:148-149`); os lembretes viraram NUDGED. A regra "lembrete automático → linha de evento" é morta: remover.
- **L3 — Colisão e duplicação de nomes.** O tipo `BoardColumn` de `issueBoard` colide com o componente `BoardColumn` de `@codm/app-ui/board` (`board.tsx:50`). `KanbanColumnHeader` duplica `BoardColumnHeader`. Preferir variantes `tone`/`emphasis` no `board.tsx` com padrão inalterado (o único consumidor, `IssuesOverviewSection`, mantém a aparência). A nota do PNG 11 diz "Pill de status (variantes do Badge)": avaliar uma variante de `Badge` no lugar de `StatusPill`.
- **L4 — Não existe `IssueTimelineItem` nomeado no SDK.** O tipo está inline em `typescript/types/GetIssueTimeline.ts:139` e em `typescript-cloud/types/GetPanelIssue.ts:210`. Definir `GetIssueTimelineQueryResponse['items'][number]` e uma checagem de atribuição do tipo da nuvem (ou nomear o schema na OpenAPI), sem cast (NN1).
- **L5 — Search param `done`:** `z.boolean().default(false)` no `validateSearch` de `/threads/$threadId/issues`, porque todo campo leva `.default()` (`packages/app/react/CLAUDE.md`, caso 2).
- **L6 — Manifesto do Vite.** Com `build.manifest: true`, o Vite 7 grava em `dist-panel/.vite/manifest.json`; `manifest.json` só sai se o config passar esse nome. O manifesto não traz MIME. O conjunto servível pode ser um `readdir` de `assets/` no boot, com o tipo pela extensão.
- **L7 — Correção factual:** existe build estático do app-react (`project.json` `build-spa`, `scripts/build-spa.ts`), só que com o `__root` do desktop. A conclusão do §5 se mantém; corrigir o texto da restrição.
- **L8 — `docker/.dockerignore` não vale para `-f docker/cloud.Dockerfile .`** (contexto na raiz, que não tem `.dockerignore`). Num build local, `COPY packages/app/react` leva o `node_modules` do host, com binários nativos do darwin. Criar `docker/cloud.Dockerfile.dockerignore`.
- **L9 — Polling no painel:** a regra "never poll" (`packages/app/react/CLAUDE.md`, seção Real-time) tem exceção legítima aqui, porque não há SSE. Deixar um comentário no código e condicionar o `refetchInterval` de `useGetPanelAction` a `PENDING`.
- **L10 — "Pedida por"** depende de a mensagem de origem estar ligada à tarefa (`Thread.linkEntryToIssue`, `thread/entities/Thread.ts:929`). Cobrir com teste e definir o fallback quando não houver CONTACT.
- **L11 — Destino de arquivos e comportamentos.**
  - Falta dizer o que acontece com `IssueTimeline.tsx` e `IssueTimeline.test.tsx` (migrar os testes para `buildConversation`).
  - A deduplicação descarta a legenda que `TranscriptBubble` mostra junto do artefato (`TranscriptBubble/index.tsx:130-135`).
  - `artifactGlyph` mora em `-components/ArtifactPreview/index.tsx:16`, e o painel não pode importar `@/routes`: mover para módulo compartilhado.
- **L12 — Regra da casa do CLI:** criar os componentes com `bun cli`, e registrar a falta de receita para uma "segunda entrada Vite".
- **L13 — `GET /panel/assets/:file` cabe nas convenções, com ressalvas.**
  - Controller público sem middleware pede docblock que justifique a ausência (CTRL-C18, `controller/typescript/registry.yaml:148-166`).
  - Ele entra na OpenAPI e gera um hook no SDK, como o `usePanelPage` que já existe. É ruído aceitável.
  - `contentType` é um campo só (`core/src/types/Controller.ts:71`). O tipo real vai no `rawResponse`.
  - Não colide com `/panel/g/:token` (`panel/controllers/*.ts`, `path`).
- **L14 — `PanelWebBundle` como Service por ambiente é coerente** com o padrão `{token, mock, real}` de `panel/registry.ts:8-14` (com `integration` explícito, M7).
- **L15 — Alvo nx `build-panel`.**
  - O `test-liveness` só cobre arquivos de teste (`scripts/test-liveness.test.ts:6-8`), então o rail não reage a um alvo novo.
  - Seguir o precedente `build-spa` (`app/react/project.json`) com `outputs: {projectRoot}/dist-panel` e `inputs` incluindo `vite.panel.config.ts`.
  - O rail novo `tests/architecture/panel-web-fence.test.ts` é alcançado pelo `bun test` do pacote.
- **L16 — `vite.panel.config.ts` independente do `vite.config.ts`.**
  - Precisa repetir o alias `@` (`vite.config.ts:47-51`), `tailwindcss()` e `react()`, sem `tanstackStart`/`nitro`.
  - `__DEV_OVERLAYS__` só é usado em `routes/__root.tsx`, que fica fora do painel, então não precisa de `define`.
  - O próprio `lib/i18n.ts` é limpo: só `i18next`, `react-i18next` e os JSON (`:1-5`). O vazamento vem dos barrels (C1).
- **L17 — Mapas de rótulo.** Remover `COLS`/`KIND`/`HEALTH`/`DEST`/`RES`/`ERR`/`ACT_ERR` (`PanelPage.ts:84,86,116,118,210,257-258`) em favor de `enums.*`/`errors.*` está correto (bp-23).
  - `QuotaState`, `BatchItemDestinationKind` e `BatchStatus` já existem em `enums`.
  - `ROUTED_BY` (`IssueTimeline.tsx:134`) é mapa de chave, não de rótulo, e pode ficar.
- **L18 — `ITEM_PASS`:** a regra "só o founder adiciona/remove" (`fidelity-allowlists.ts:21-27`) está atendida pela decisão 2.
- **L19 — Paridade do desktop que falta na lista:**
  - `issue.meta` ao lado do título (`IssueDetailSection/index.tsx:115`);
  - texto `detail` da parada (`:283-284`);
  - regra de `pausable`, que esconde Pausar em concluída/arquivada (`:183,200`);
  - Arquivar escondido quando já arquivada (`:131`).

### Perguntas em aberto

1. O autor da orientação ("· Bruno") entra no contrato (sem endereço) ou é corte declarado?
2. O P2 aceita estender `GetSessionIssues` (recomendado) em vez de filtrar o overview no cliente?
3. A divisão em A0/A1/A2/A3/B1/B2 está aprovada?

## Decisões pós-revisão (24/11, aplicadas — prevalecem sobre o texto acima)

Respostas às perguntas: (1) autor da orientação é **corte declarado** (bolha "Orientação" sem nome; idem "· sessão 2"); (2) P2 **estende `GetSessionIssues`** com os campos de vida; (3) divisão **A0/A1/A2/A3/B1/B2** aprovada — contrato primeiro.

- **C1** — o código compartilhado (`lib/task`, `components/task`) importa só módulos-folha (`@/lib/enums`, `@/lib/format`, `@/hooks/useLocale`, `@/lib/utils`), nunca os barrels `@/lib`/`@/hooks`. O rail do painel percorre o **fecho de imports** a partir de `src/panel/web/main.tsx` (resolvendo `@/` e relativos) e falha em qualquer módulo proibido; tem fixture negativa com import indireto.
- **C2** — o painel tem CSS de entrada próprio, `src/panel/web/panel.css`, com `@import` do `index.css` e `@source` cobrindo `src/` do app-react; o teste do build procura uma classe que só `components/task` usa.
- **C3** — `buildConversation` recebe `openStopOf(stopId) → { ask?: AskView; resolutions: StopResolution[] } | undefined`. O desktop mapeia NeedsYou (`availableResolutions`), o painel mapeia `openStops` (`resolutions`). O cartão é desenhado a partir do stop aberto.
- **M1** — as ações não descem por prop: porta `TaskActions` em contexto React (`components/task/TaskActionsContext.tsx`), com um provider por host. O desktop liga os hooks do daemon (responder, resolver, orientar, pausar/retomar). O painel liga em `POST /actions` + situação. O mesmo contexto oferece as capacidades `publishOutput`/`renderBatchLink` dos eventos. Item por prop só para as folhas.
- **M2** — `GetSessionIssues` ganha, por item, `lifeState`, `paused`, `waitingForProviderUntil?`, `retryingAt?`, `escalatedAt?`, pelos mesmos utilitários que o `GetIssueDetail` usa. A paridade do P2 inclui arquivadas, nota de autoarquivamento e estado vazio.
- **M3** — a invalidação da timeline usa a chave **exata** quando o payload traz `issueId`; quando não traz, usa `predicate` pela `url`. O `onSuccess` de orientar/pausar/retomar/arquivar invalida timeline e session issues. Limitação declarada: sem frame SSE de pausa/nova tentativa/empurrão, a coluna do kanban anda na próxima invalidação ou no foco da janela.
- **M4** — o item `STEER` ganha `failed?: boolean` (opcional: as timelines já guardadas na nuvem continuam válidas), vindo do `agentMailbox`. Acaba o casamento por instante.
- **M5** — o `/board` ganha `openAsks: { code, question }[]` (todas as abertas, na ordem em que foram levantadas) e `artifactCount`. "Pausada" no painel sai de `lifeState === 'PAUSED'`.
- **M6** — um mecanismo só: o estágio `panel-web` produz `packages/app/react/dist-panel`; o `build.ts` do api o estagia em `dist/panel-web`. O módulo `real` deriva o caminho de `import.meta.url` e entra em `DERIVED_DIR_MODULES`. A obrigatoriedade é a chave de env declarada `CODM_PANEL_WEB` (`required` × `optional`, com consumidores no manifesto), nunca um booleano solto.
- **M7** — `PanelWebBundle` com bindings `mock`, `integration` e `real` explícitos. A verificação no boot fica no `onStart` do contexto `panel`. `required` sem bundle derruba o boot; `optional` responde 503 com a instrução.
- **M8** — a fidelidade edita o **conteúdo** dos frames existentes (`dbY54`, `G5MOV`), preservando os ids e o `exportNodeId`. `--only` filtra só os laços de escrita/exportação depois de `assignSlugs`, implica `--specs --targets` e pula tokens. P1/P2 cabem em 1440×900.
- **M9** — entra na paridade do painel:
  - ações só identificado e fora de DONE; resoluções só com `canRelease`;
  - recarregar a tarefa aberta depois de identificar/sair;
  - lote com situação, motivo/nota e ida para a tarefa; fechar apaga o hash;
  - `document.title`; saúde com janela%/semana%;
  - a nota "15 min depois de chegar ao grupo" sem `dueAt`; limite de 2000 caracteres;
  - **modo escuro** pela media query aplicando `.dark`.
- **M10** — o `PanelApp` tem host próprio do `useDialogStore`. O hash (`#KEY`/`#L-n`) é a fonte de verdade de tarefa e lote abertos. "Identificar-me" vai por `useDialogStore`.
- **M11** — o item `MESSAGE` ganha `artifactId?` (coluna `transcriptEntries.artifactId`). A deduplicação usa esse campo nos dois lados, e a legenda da entrada continua visível no chip.
- **L1** cortes: autor da orientação, "sessão N". **L2** removida a regra do lembrete (o campo é sempre `false`). **L3** o tipo é `TaskColumn` (não colide com `BoardColumn`); `StatusPill`/`KanbanColumn` ficam como arquivos novos — o `board.tsx` e o `Badge` não mudam (cerca da decisão 2). **L4** checagem de atribuição do tipo da nuvem para `TimelineItem` sem cast. **L5** `done: z.boolean().default(false)`. **L6** conjunto servível por `readdir` de `assets/` no boot, tipo pela extensão. **L7** corrigido: existe `build-spa` do desktop, com o `__root` do desktop — não serve. **L8** `docker/cloud.Dockerfile.dockerignore`. **L9** comentário da exceção de polling; `useGetPanelAction` só recarrega enquanto `PENDING`. **L10** "Pedida por" cai para "—" sem CONTACT. **L11** `IssueTimeline.tsx` sai da página e o teste migra para a conversa; `artifactGlyph` vai para `lib/task/artifactGlyph.ts`. **L12** registrar no PR a falta de receita do CLI para "segunda entrada Vite".
- **M7 (ajuste na implementação, 24/11):** a composição não expõe um hook de start por contexto sem mexer no
  `compose.ts`. Por isso a obrigatoriedade do bundle fica no **build**: com `CODM_PANEL_WEB=required` (setado
  no `cloud.Dockerfile`), o `scripts/build.ts` recusa sair sem o `dist-panel`, e a imagem não é publicada
  sem o painel. Em runtime, um bundle ausente responde 503 com a instrução; isso só acontece em dev.
