# Fase 2 — falar e parar na hora

Status: In progress (fase 2 do plano "tarefas visíveis, controláveis e que não se perdem")
Data: 2026-11-16

## Problema (medido numa instalação real, 14 dias)
- Toda mensagem passava pelo orquestrador (uma sessão por grupo, uma coisa por vez): espera mediana de 24 s, p90 de 110 s, 95 mensagens acima de 5 min, pior caso 1h30.
- Mais da metade das mensagens das pessoas é resposta citada a uma mensagem do agente.
- Um recado só entrava entre turnos da tarefa: do envio ao fim do turno que o consumia, mediana de 23 min. Uma tarefa publicava a versão antiga antes de ler a correção.
- ~30 pedidos de "pare / segura / cancele" em 14 dias, sujeitos à mesma espera.

## Decisões do dono
- Resposta citada é o principal sinal de roteamento; steer e pausa valem na hora.
- Para agir pelo painel, a pessoa escolhe o próprio nome na lista do grupo e confirma com um código enviado no WhatsApp dela (vale por aparelho; mantém a regra de quem pode liberar).

## Itens

### 1. Roteador — camada de regra (feito)
`RuleRouter` (contexto `thread`), antes de gravar a mensagem:
- cita uma mensagem ligada a uma issue (fase 0) → essa issue;
- nomeia exatamente uma issue pela chave curta (`APP-12`) → essa issue;
- só roteia issue **WORKING**; concluída ou esperando alguém segue para o orquestrador (reabrir é decisão dele);
- ambíguo (duas chaves, nenhuma) → caminho de sempre. A camada de regra nunca chuta.

A mensagem roteada vira um STEER da sessão da issue, assinado por quem escreveu, com o trecho citado; o grupo recebe só a reação 👀; a linha do tempo da issue mostra enviado/entregue/lido.

### 2. Pausa como comando (feito)
Palavra de controle + alvo → a issue fica pausada no daemon na hora; as ferramentas de efeito externo recusam enquanto pausada; `continue` / `retome` despausa.

**Estado.** `Issue.paused` (coluna `issue_issues.paused`, migração 0034), ORTOGONAL ao `status`: pausar não muda WORKING/NEEDS_INPUT e retomar volta ao mesmo estado. `Issue.pause()` recusa issue COMPLETED ou arquivada (`ISSUE_NOT_PAUSABLE`) e pausa repetida (`ISSUE_ALREADY_PAUSED`); `resume()` recusa o que não está pausado (`ISSUE_NOT_PAUSED`). Casos de uso `PauseIssue` / `ResumeIssue` (contexto `issue`) gravam a flag e os fatos `issue.paused` / `issue.resumed` com quem pediu (`requestedBy`/`requestedById`) e de onde (`IssueControlSource`: `WHATSAPP` | `CONSOLE`). Console: `POST /issues/:issueId/pause` e `/resume` (CloudSessionMiddleware, sem escopo MCP).

**Segurada = issue pausada OU conversa pausada.** Uma checagem só, `IssueHold` (`issue/services`, lê `issues.paused` ⋈ `threads.paused`), usada por:
- **Dispatcher** — no topo de `runIssueWork`: segurada ⇒ o item é adiado 30 s (`defer`, tentativa devolvida, nunca `complete`/`fail`); novo variante `held` do `TurnReport`.
- **Ferramentas externas** — `SendDirectMessage`, `RaiseStop` (`DeclareStop`), `AskOperator` recusam com `ISSUE_PAUSED` quando quem chama é o run de uma issue segurada (o `issueId` da identidade do run). Console e orquestrador não carregam issue e passam — `SendDirectMessage` continua sendo a voz do operador num grupo pausado. `SendArtifact` checa a issue que REGISTROU o artefato (o contexto `artifact` não lê identidade de run; criar a aresta só para isso não valia).

**Na hora.** A flag é a pausa; dois handlers do próprio `issue` só aceleram:
- `AbortIssueTurnOnPause` (`issue.paused`) relê a issue e, se ainda pausada, chama `IssueTurnAborter.abort` (agent/services, um `AbortController` em memória por turno de issue em voo). O dispatcher arma o controlador ANTES de checar a pausa; `RunIssueTurn` lê o sinal, não começa se já abortado e passa `signal` ao runner (kill do grupo de processos). Turno morto pela pausa não persiste desfecho: sem ISSUE_RESULT, sem stop, sem cursor de sessão; o item volta adiado, sem gastar tentativa.
- `ReleaseIssueWorkOnResume` (`issue.resumed`) libera (`releaseDeferred`) os itens adiados da issue se ela não está mais segurada.
- Aresta nova `issue → agent` (ciclo anotado `agent ↔ issue` em `composition/policy.ts`): o dono do fato reage no próprio contexto e comanda o runtime de turnos, mesma forma de `ResumeIssueOnStopResolved`. Evento de integração foi descartado: o abort precisa alcançar o controlador em memória deste processo, e a fila SQL de integração somaria um intervalo de polling.

**WhatsApp.** Em `IngestChannelMessage`, ANTES do portão `canInvoke`: a primeira palavra (depois de tirar menções; caixa e acento ignorados; palavra inteira — "parabéns" não é "pare") é de controle — pausa: `pare`, `pausa`, `pause`, `segura`, `stop`; retomada: `continue`, `continua`, `retome`, `retoma`, `segue` (`thread/utils/controlCommand.ts`) — E há alvo: citação de mensagem ligada a uma issue ou exatamente uma chave (`RuleRouter.target`, qualquer issue não arquivada, não só WORKING). Quem manda: `Thread.canCommand` = `canInvoke` sem a pausa da conversa (participante mudo continua mudo, portão de menção e janela de frescor valem). Efeito por comando (`CONTROL_EFFECT`): `pare` numa issue já pausada só reconhece (reentrega não vira erro nem desfaz a entrada); `pare` em concluída/arquivada e `continue` em issue não pausada caem no caminho de sempre (um "continue com X" é steer). Comando aceito: entrada gravada ligada à issue, `PauseIssue`/`ResumeIssue` na MESMA transação (exceção nomeada `thread → issue/usecases`), nenhum turno do orquestrador, só a reação ⏸️ / ▶️. Sem alvo ou ambíguo → caminho de sempre, inalterado.

**Conversa pausada** (botão "pausar grupo" do console): agora também segura o trabalho das issues dela e as ferramentas externas delas; o resto da semântica não mudou. Retomar o grupo não libera na hora — o item volta no re-check de 30 s.

**Visibilidade.** `IssueTimelineItemKind` ganhou `PAUSED` / `RESUMED` (com `source` e `by`); `IssueLifeState` ganhou `PAUSED`, que vence tudo menos DONE (um item adiado por pausa não é "esperando cota"; o selo de cota e a varredura de issues paradas ignoram issues pausadas). `GetIssuesOverview` / `GetIssueDetail` expõem `paused`. Console: quadro põe PAUSED na coluna de paradas com selo "Pausada"; detalhe da issue tem botão Pausar/Retomar (hooks do SDK) e o selo.

A tabela do painel na nuvem (`panel.panel_issues`) restringe `life_state` por CHECK: migração de nuvem 0004 aceita `PAUSED` (aplicar no deploy, antes do daemon novo publicar).

**Limites conhecidos.** O abort chega pelo outbox (poll de até 1 s), não síncrono. Um primeiro turno morto pela pausa recomeça do brief ao retomar (nenhum cursor de sessão é gravado). Um steer segurado aparece como "entregue" na linha do tempo (o `firstClaimedAt` é carimbado no claim). `para` ficou de fora de propósito: é também a preposição ("Para quando fica pronto?" citando uma issue não pode pausá-la). Citar a linha DIRECT de uma issue (não SYSTEM) num grupo com portão de menção exige a menção, como no steer.

**Fora deste item.** Pausa do grupo inteiro por comando no WhatsApp (só pelo console); evento de integração para o quadro se atualizar sozinho na pausa (atualiza no próximo refresh ou pelo botão).

### 3. Janela de arrependimento
Ações irreversíveis (merge, publicar, disparar push, escrever em produção) esperam alguns segundos e conferem a caixa de recados da issue; recado novo cancela a ação e volta para a sessão.

### 4. Steer imediato (`próximo passo` / `agora`) — `agora` feito; `próximo passo` ao vivo em seguimento
`próximo passo` (padrão): o recado entra na próxima chamada de ferramenta da sessão. `agora`: interrompe o turno. Mecanismo a escolher medindo o runner (entrada em fluxo do CLI × hook entre ferramentas × interromper e retomar).

**Medição (do código — nenhum CLI real foi executado).**
- Claude: `ClaudeAgentRunner` sobe `claude -p --input-format stream-json --output-format stream-json --verbose` (`ClaudeAgentRunner.ts:294`) com `stdin: true` (`:373`), escreve o turno inteiro numa só chamada `proc.write(renderStreamJsonStdin(request, …))` (`:423`; uma linha JSONL `{"type":"user",…}` por mensagem, `:785-806`) e fecha o stdin no PRIMEIRO frame `result` com `stopReason !== TOOL_USE` (`:514-515`). O processo expõe `write` (`AgentProcess.ts`), mas ninguém fora do `run()` tem a referência: `AgentRunRequest` não tem canal de entrada (só `messages`, fixas, e `signal`, `types/AgentRunRequest.ts`). Logo: tecnicamente dá para escrever uma linha a mais com o turno vivo; hoje não há caminho até lá.
- Codex: `CodexAgentRunner` sobe com `stdin: false` (`CodexAgentRunner.ts:267`) — o prompt vai no argv e um stdin aberto travou o `codex exec` por 3 min (`:93-98`). Não há entrada ao vivo possível.
- Interrupção: os dois runners honram `request.signal` matando o grupo de processos (`ClaudeAgentRunner.ts` `onAbort`, `CodexAgentRunner.ts:291-294`); o `IssueTurnAborter` do item 2 já arma o sinal por turno. Interromper-e-retomar é o caminho barato e medível nos dois.
- O que a documentação diz (DOCUMENTADO, não medido aqui): o CLI tem `--replay-user-messages` ("Re-emit user messages from stdin back on stdout for acknowledgment", exige stream-json nos dois sentidos — referência do CLI). No Agent SDK, uma mensagem de usuário sem `priority` (ou `'next'`) "é lida no mesmo turno assim que as chamadas de ferramenta em curso terminam; se o turno acabar antes, ela começa o turno seguinte" — aplicar isso ao stdin cru é INFERÊNCIA. NÃO documentado: o que acontece com uma mensagem ainda na fila quando o stdin fecha (o runner fecha no primeiro `result`). Esse é exatamente o caso em que o recado se perderia em silêncio.

**Decisão.** Construído só `agora` (interromper e retomar), que funciona igual em qualquer runner que honre `signal`. `próximo passo` continua no comportamento de hoje — o recado espera o turno acabar — até a entrada ao vivo ser medida (Seguimento abaixo). Nenhuma capacidade nova foi declarada: declarar `liveInput` sem o caminho que a usa seria um contrato vazio.

**`agora`.** No ramo roteado do `IngestChannelMessage` (só steer roteado: citação/chave, issue WORKING, `canInvoke` — o contrato do roteador não mudou), `parseSteerUrgency` (`thread/utils/steerUrgency.ts`, mesmo estilo de `controlCommand.ts`: caixa e acento ignorados, palavra inteira) lê, depois do endereçamento (menções e no máximo uma chave), `agora` / `now` seguido de algum texto ⇒ `SteerUrgency.NOW`. A palavra sai do texto que a sessão recebe. O STEER é enfileirado como sempre (agora com `entryId` no payload) e, na MESMA transação, o fato `thread.issue_turn_interrupt_requested`; o corte acontece DEPOIS do commit, em `InterruptIssueTurnOnSteer` (handler do `thread`) → `IssueTurnAborter.interrupt(issueId, entryId)`, que aborta com o motivo `TurnAbortReason.INTERRUPT` e POUPA o turno que já carrega esse `entryId` (o fato chega pelo outbox; se o turno a cortar já acabou e o do próprio recado começou, nada é cortado). O handler relê antes de cortar, como `AbortIssueTurnOnPause`: só corta enquanto a issue ainda tem trabalho esperando (`MailboxRepository.hasPending`), então um fato atrasado ou reentregue depois de o recado ser consumido não corta um turno posterior que ninguém pediu para parar.

A sessão do turno cortado vem do frame de init do CLI: os dois runners guardam o `session_id` do init e o devolvem no evento final mesmo quando o processo é morto (`ClaudeAgentRunner.buildResult`, todos os ramos; `CodexAgentRunner.ts:329/391`) — fixado em `cancellation.test.ts`.

`RunIssueTurn` distingue os dois abortos pelo `signal.reason`: PAUSE segue o item 2 (`held`); INTERRUPT também não persiste desfecho (sem ISSUE_RESULT, sem stop), mas GRAVA o cursor da sessão quando o CLI informou a sessão (`interrupted.sessionKept`). O dispatcher então consome o item cortado (o conteúdo dele já está na sessão) e o próximo item do alvo — o steer — retoma a mesma sessão com `--resume` (o `priorMessageId` bate com o cursor gravado). Cortado antes do CLI informar a sessão (`sessionKept: false`): nada chegou a sessão nenhuma, o item é liberado na hora (`defer` para agora, tentativa devolvida) e roda de novo antes do steer — a ordem antiga, sem perda. Nenhum dos dois gasta tentativa.

**Testes.** `LibSqlMailboxDispatcher.interrupt.test.ts` (dispatcher + `RunIssueTurn` reais, runner stub que só termina morto ou liberado): `agora` corta o turno, o steer roda em seguida com `resumeId` = sessão do turno cortado, uma só resposta (a do steer) e nenhum stop; `agora` atrasado não corta o turno do próprio recado; sem `agora` o recado espera o turno acabar (fallback) e os dois respondem; corte antes do início não guarda sessão. `steerUrgency.test.ts`; ingest grava o fato e tira a palavra do texto.

**Limites conhecidos.** `agora` é palavra comum: seguido de avaliação ("agora sim", "agora ficou", "agora deu", "agora está"… — `NOT_AN_ORDER_AFTER_NOW`) é reação e NÃO corta (vira steer comum); "agora" sozinho também não. Outros usos ("agora que você terminou, …") ainda cortam. O corte chega pelo outbox (até ~1 s). Com outros recados mais antigos na fila da mesma issue, eles rodam antes do `agora` (a fila é por ordem de chegada; não há prioridade por item). A retomada de uma sessão Claude morta no meio de uma ferramenta não foi medida contra o CLI real — o transcript do CLI é gravado por mensagem, então o esperado é retomar do último passo registrado. O ✅ do item 5 sai também para o item cortado (ele foi consumido pela sessão).

**Seguimento — o que `próximo passo` ao vivo precisa (Claude; Codex não tem como).**
1. Medir contra o CLI real, numa conta de teste: (a) uma linha `{"type":"user",…}` escrita no meio de um laço de ferramentas entra no MESMO turno depois da ferramenta em curso? (b) com `--replay-user-messages`, o eco sai quando a mensagem é LIDA (entra na conversa) ou quando é enfileirada? (c) mensagem enfileirada + stdin fechado: processada ou descartada? (d) `result.queued_turn_count`.
2. Seam: `AgentRunRequest` ganha um canal de entrada ao vivo (ex.: `input?: AsyncIterable<AgentMessage>`), e cada runner declara a capacidade (`liveInput`) na própria classe — o Codex declara que não tem; o despacho é por capacidade, nunca por provedor.
3. Runner Claude: adicionar `--replay-user-messages` (capacidade sondada no `--help`, como `appendSystemPromptFile`); escrever cada mensagem do canal enquanto o stdin está aberto; NÃO fechar o stdin no `result` enquanto houver mensagem escrita sem eco (ou enquanto `queued_turn_count > 0`); emitir um evento de runtime "mensagem lida" ao ver o eco.
4. Fila: hoje `claimNext` recusa um alvo com lease vivo, então o steer nem é visto durante o turno. Precisa de um claim "para turno vivo" (o turno da issue em voo puxa os STEER pendentes do mesmo alvo), carimbando `first_claimed_at` (☑️) na escrita e completando o item só quando o eco chegar (✅ no fim do turno); sem eco até o fim do turno, o item volta para a fila normal — nunca completar na escrita, porque um recado perdido em silêncio é o pior desfecho aqui.

### 5. Entregue/lido no WhatsApp (feito)
Reação na mensagem roteada quando o recado é entregue à sessão e quando o turno que o leu termina.

**Sinais.** A mensagem roteada anda 👀 → ☑️ → ✅, como os tiques do próprio WhatsApp (caixa cinza, depois o check verde). `CUE_DELIVERED = '☑️'`, `CUE_READ = '✅'` em `thread/utils/ChannelCues.ts`. O WhatsApp guarda UMA reação por remetente por mensagem e a reenviada SUBSTITUI a anterior (`ReactToChannelMessage` já documenta isso), então cada sinal troca o anterior, sem empilhar.

**De onde sai o endereço.** O transcript não guarda o id da mensagem na plataforma, então o STEER leva no payload `channelOrigin` (`RoutedSteerOriginSchema`, `thread/services/SteerCue`: a entrada do comando de reação menos o emoji, mais o `entryId`), montado pelo `IngestChannelMessage` com o MESMO endereço do 👀 (`reactionAddress`) e o mesmo portão (id da plataforma presente, reações ligadas na conversa). Só o ingest escreve `channelOrigin`: steer do console, tique de loop, resolução de stop e o lembrete de declaração não têm, e ficam calados por declaração.

**Quando.** Quem sabe é o `LibSqlMailboxDispatcher`:
- ☑️ no PRIMEIRO hand-off do item — `ClaimedMailboxItem.firstClaim`, decidido na mesma escrita que carimba `first_claimed_at` (o "entregue" da linha do tempo; os dois nunca discordam). Não `attempts === 1`: `defer` devolve a tentativa (pausa, limite do provedor) e o claim seguinte leria 1 de novo. Retry e re-claim não reagem.
- ✅ logo depois do `complete` do item — o turno que o levou terminou e o item foi consumido. Não para relatório `dropped` (nenhum turno rodou) e nunca para `held` (turno morto pela pausa volta adiado antes do `complete`).
- `cueRoutedSteer` (serviço livre em `thread/services`, mesma forma de `beginTypingPresence`) enfileira `react_to_channel_message` com `jobId` `cue:<entry>:<estágio>` — diferente do `cue:<entry>` do 👀, para um não engolir o outro. A fila roda por `run_at`, então o 👀 do ingest sai antes do ☑️. Best-effort como todo sinal; no dispatcher nunca lança (roda depois do `complete`, e um throw ali faria `fail` de um item consumido).

**Por que não evento + handler.** O pedido era "evento → handler do `thread` enfileira a reação". Um handler do `thread` não pode importar `@agent/events` (superfície proibida), e um evento de integração exigiria contrato TypeSpec + SDK + Go para um enfeite. O dispatcher é o único que conhece os dois instantes; ele chama o serviço do `thread` pela aresta `agent → thread` já declarada (nota atualizada em `agent/context.ts`). Nenhuma exceção de política nova.

**Limites conhecidos.** Um steer que chega com a issue pausada ganha ☑️ no primeiro claim (mesmo limite da linha do tempo, que já o mostra "entregue"), e ✅ só quando a issue retomar e o turno terminar. Desligar as reações da conversa depois do steer enfileirado não apaga o `channelOrigin` já gravado (o ☑️/✅ dele ainda sai). Um turno muito curto pode, em tese, ter ☑️ e ✅ no mesmo lote da fila — saem na ordem de `run_at`.

### 6. Ações pelo painel (identificação por código no WhatsApp)
Depende do deploy da fase 1. Dividido em **6a** (quem é a pessoa neste aparelho — feito) e **6b** (agir — esboço).

#### 6a. Identificar a pessoa (feito)
**Decisão do dono.** A pessoa escolhe o próprio nome na lista do grupo e confirma com um código que o codm manda no WhatsApp DELA; vale por aparelho (navegador); a regra de quem pode liberar continua a mesma.

**Fluxo.** Painel → "Identificar-me" → lista de nomes (`GET /panel/g/:token/members`) → `POST …/identify {memberId}` cria um pedido de código → o daemon puxa o pedido em até ~15 s e manda a DM → a pessoa digita → `POST …/verify {memberId, code}` → cookie do aparelho → "Você é <nome> neste aparelho" + "Sair" (`POST …/forget`). `GET …/me` diz quem é o aparelho (ou ninguém).

**Privacidade (regra dura).** Telefone/JID nunca vão para a nuvem. A nuvem só vê `memberId` + nome de exibição + `canRelease`. `memberId` = HMAC-SHA256(chave local, `threadId` + JID), base64url de 128 bits: estável por grupo, diferente entre grupos (não liga a mesma pessoa em dois grupos) e irreversível sem a chave. A chave é um arquivo de 32 bytes aleatórios em `<CODM_DATA_DIR>/panel-member.key` (0600, criado no primeiro uso — o padrão do `FileCloudSession`), e não uma tabela: o daemon reconstrói o mapa `memberId → JID` a cada rodada a partir do roster vivo, então não há nada a migrar nem a manter em sincronia com o Go. Perder o arquivo só troca os ids (sessões antigas viram "ninguém"). O nome vem SÓ do catálogo de contatos (`gateway_remotes.name`); o roster JSON guarda muitas vezes o JID cru como nome, então ele não é usado, e um nome com cara de telefone/JID é descartado. Membro sem nome real fica FORA da lista (limite conhecido: ele não consegue se identificar até o WhatsApp sincronizar o nome).

**Quem pode liberar.** `canRelease` = `Thread.postureOf(JID) === BYPASS` (o grant "pode liberar" / `canElevate`, a mesma régua de `canReleaseOf` no orquestrador). O JID do próprio dono (`gateway_channels.owner_remote_id`) é o `operator` — no WhatsApp o `fromMe` vira o sentinela — então herda a postura do operador. O sentinela `operator` nunca aparece na lista (não tem endereço).

**Canal de puxada — chamada própria, do contexto `thread`.** O daemon não é alcançável pela nuvem, então pedidos nuvem→daemon são PUXADOS. Escolha: `PUT /panel/roster` a cada 15 s, separado do `PUT /panel/sync`. Por quê: quem conhece pessoas (roster, postura, canal, envio no WhatsApp) é o `thread`; o `PublishPanelSnapshot` mora no `issue`, e `issue` não consome `thread` (o sentido declarado é `thread → issue`). Pôr o roster no snapshot do `issue` exigiria um ciclo novo `issue ↔ thread` ou um repasse em memória entre dois jobs. O job `PublishPanelRoster` (`thread`) envia o roster dos grupos que têm issues e recebe na resposta os códigos a entregar; latência ≤ 15 s, uma requisição pequena a mais por ciclo. A porta `PanelRosterRelay` (Cloud/Mock, mesma forma do `PanelPublisher`) é do `thread`. Grupo que a nuvem não conhece (ainda sem board) ou de outro dono é ignorado.

**Quem gera o código — a nuvem, na hora da puxada.** O `identify` grava só o PEDIDO (sem código). Quando o daemon puxa (`PUT /panel/roster`), a nuvem gera o código naquele instante, grava só o HMAC (`hmac(segredo da nuvem, requestId:código)`) com validade de 10 min contada no relógio da nuvem, e devolve o código em claro APENAS na resposta HTTP. O daemon manda a DM direto pelo `ChannelSender.send` (não pela fila de comandos: a linha de `scheduled_commands` guardaria o texto, e uma linha morta fica para sempre) e reivindica o eco (`ConsumedMessageRepository.claim`, como toda entrega SYSTEM) para a DM nunca virar entrada de transcript nem turno. Assim o código em claro não vai para o Postgres nem para o SQLite do daemon. Comparado a "o daemon gera e reporta o hash": não há ida e volta extra, e o `verify` nunca chega antes do hash. Perdida a resposta ou falhada a DM, o código emitido morre sem uso; a pessoa pede outro depois de 1 min.
Limite conhecido: o gateway Go projeta toda mensagem enviada em `gateway_messages` (conteúdo incluído), então a DM fica no log do gateway como qualquer mensagem — o código é de uso único e expira em 10 min. A DM para um membro com quem a conta nunca falou abre essa conversa no WhatsApp/gateway (o envio aceita qualquer JID).
Texto: "Seu código do painel do codm: 123456 — vale 10 min." (pt) / "Your codm panel code: 123456 — valid for 10 min." (en), pela língua da conversa (`resolveThreadLanguage`).

**Regras do código.** 6 dígitos (`randomInt`), uso único, 10 min, no máximo 5 tentativas, guardado só como HMAC, comparação em tempo constante. Só o código mais recente de um membro vale (um novo pedido emitido aposenta os anteriores). Pedidos por membro: 1 por minuto e 5 por hora (`PANEL_CODE_RATE_LIMITED`). Pedido não puxado em 5 min caduca (o daemon estava fora; ninguém está mais esperando). A tentativa é gasta ANTES da comparação, num `UPDATE … SET attempts = attempts + 1 WHERE attempts < 5 RETURNING` fora da transação que lança o erro (senão o rollback devolvia a tentativa); o consumo é `UPDATE … SET used_at WHERE used_at IS NULL RETURNING` (duas abas com o mesmo código: só uma ganha).

**Sessão do aparelho.** Token aleatório de 32 bytes em cookie `codm_panel` — `HttpOnly; Secure; SameSite=Strict; Path=/panel/g/<token>; Max-Age=30 dias` — guardado como SHA-256. O cookie é lido por um middleware (`PanelDeviceMiddleware`, que lê o `Cookie` do request cru e carimba `ctx.panelDevice`), porque o input de controller só tem `body/query/params/ctx`. O `Set-Cookie` sai montado à mão (o helper do framework escreve `HttpOnly=true` e pula valor vazio, o que impede apagar). `me` só vale se a sessão é DESTE grupo, não expirou e o membro ainda está no roster atual (saiu do grupo → ninguém). Trocar o link (`RotatePanelLink`) apaga as sessões e os pedidos daquele grupo na mesma transação — além de o cookie velho nem ser mais enviado (o `Path` era o token antigo).

**Tabelas (nuvem, migração 0005).** `panel_groups.members` (jsonb `[{memberId,name,canRelease}]`, substituído inteiro a cada roster — é um valor do grupo, lido inteiro, nunca consultado por dentro; o `upsert` do grupo já reescreve a linha a cada ciclo). `panel_code_requests` (`id`, `owner_id`, `thread_id`, `member_id`, `requested_at`, `code_hash`, `issued_at`, `expires_at`, `attempts`, `used_at`; índice por `(thread_id, member_id, requested_at)`). `panel_sessions` (`token_hash` pk, `owner_id`, `thread_id`, `member_id`, `created_at`, `expires_at`). Limpeza: o `PUT /panel/roster` apaga pedidos com mais de 24 h e sessões vencidas do dono.

**Erros** (`panel/errors`): `PANEL_MEMBER_NOT_FOUND` (404 — membro fora do roster), `PANEL_CODE_RATE_LIMITED` (429), `PANEL_CODE_INVALID` (400 — código errado, ou nenhum emitido ainda: não gasta tentativa quando não há código), `PANEL_CODE_EXPIRED` (410 — vencido ou já usado), `PANEL_CODE_ATTEMPTS_EXCEEDED` (429 — 5 erros: peça outro). Token de grupo errado responde exatamente como hoje (`PANEL_NOT_FOUND`).

**Página.** "Identificar-me" no cabeçalho: escolher nome → "Enviar código" → digitar → "Confirmar"; depois "Você é <nome> neste aparelho · Sair". Tudo por `textContent`; os cabeçalhos de segurança da página ficam.

**Testes.** Nuvem em Postgres em processo (`PanelIdentity.test.ts`): roster guardado e listado (só nome), outro dono não escreve roster; identify → o pedido sai na puxada UMA vez; verify certo cria sessão, errado conta tentativa, vencido/usado/5 erros recusados, limite por minuto; rotação mata a sessão; token de outro grupo não vê nem verifica. Daemon (`PublishPanelRoster.test.ts`): roster com `memberId` opaco e `canRelease` pela postura, sem telefone/JID em nada que vai para a nuvem (inclusive membro sem nome), pedido puxado → DM para o JID certo, eco reivindicado, nada em claro na fila de comandos.

#### 6b. Agir pelo painel (esboço — não construído)
- Ações: pausar, retomar, orientar (steer), responder um stop. Postadas por um aparelho identificado (`POST /panel/g/:token/actions`, cookie obrigatório), gravadas na nuvem como pedido pendente e entregues ao daemon pela MESMA puxada do `PUT /panel/roster` (resposta ganha `actions`); o daemon devolve o desfecho na puxada seguinte (aceita/recusada + código de erro) e o painel mostra.
- Execução no daemon como AQUELE membro (o `memberId` resolvido para o JID pelo roster vivo, nunca confiando no nome): `PauseIssue`/`ResumeIssue` (issue), `SteerIssueTurn` (agent), `ResolveStop` (thread). `IssueControlSource` ganha `PANEL`; os fatos registram `requestedBy` = nome, `requestedById` = JID (local).
- Regra de liberar checada DUAS vezes: a nuvem recusa de cara quem não tem `canRelease` (resposta rápida), e o daemon re-checa pelo `postureOf` atual (a nuvem pode estar atrasada 15 s; a autoridade é o daemon).
- Idempotência: id do pedido de ação vira `jobId`/dedup no daemon; repetição não age duas vezes.
- **PERGUNTAR AO DONO:** o grupo vê um eco da ação feita pelo painel (ex.: "⏸️ pausada por Fulano pelo painel")? Não decidido.

### Triagem paralela com modelo pequeno
Para o que a camada de regra não resolve (pedido novo, lista): triagens sem estado em paralelo, uma por mensagem. Depois dos itens 2–5.

## Fora de escopo
Mudar o comportamento do orquestrador em conversa geral; decisões como objeto (fase 3).
