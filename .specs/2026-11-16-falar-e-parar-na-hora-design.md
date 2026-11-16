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

### 4. Steer imediato (`próximo passo` / `agora`)
`próximo passo` (padrão): o recado entra na próxima chamada de ferramenta da sessão. `agora`: interrompe o turno. Mecanismo a escolher medindo o runner (entrada em fluxo do CLI × hook entre ferramentas × interromper e retomar).

### 5. Entregue/lido no WhatsApp
Reação na mensagem roteada quando o recado é entregue à sessão e quando o turno que o leu termina.

### 6. Ações pelo painel (identificação por código no WhatsApp)
Depende do deploy da fase 1.

### Triagem paralela com modelo pequeno
Para o que a camada de regra não resolve (pedido novo, lista): triagens sem estado em paralelo, uma por mensagem. Depois dos itens 2–5.

## Fora de escopo
Mudar o comportamento do orquestrador em conversa geral; decisões como objeto (fase 3).
