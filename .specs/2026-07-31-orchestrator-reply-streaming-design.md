# Streaming da resposta do orquestrador no WhatsApp — Design Spec

**Date:** 2026-07-31
**Status:** Approved (2 decisões ratificadas pelo founder via widget em chat, 31/07; 2 decidas pelo orquestrador e declaradas abaixo)
**Bounded Context:** thread (entrega de canal) + agent (turno do orquestrador)
**Kind:** feature
**Story Points:** 8 — o transporte existe dos dois lados; o que falta é o verbo `edit` na porta, a política de corte e as garantias de ordem

## Context

**O objetivo é o TEMPO APARENTE, não o total** (ratificação do founder, 31/07: "estou atrás do tempo aparente mesmo"). Streaming não faz a resposta ficar pronta mais cedo — levemente o contrário, pelo custo das edições. Ele troca "silêncio até a resposta inteira" por "algo aparece em 1-2s e cresce". Registrado aqui para que ninguém meça esta frente por latência total depois.

Medições que enquadram o desenho (31/07):

- **O encanamento não é o custo.** `DrizzleMailboxDispatcher` faz poll com piso de **250ms**; o `CommandQueue` a **1s**. O caminho inteiro de entrega custa ~1-2s. O que a pessoa espera é o agente **gerar a resposta inteira** antes de qualquer coisa sair.
- **O texto já existe incrementalmente.** `AgentStreamRegistry` entrega o stream e `RunOrchestratorTurn` já o consome — é o que alimenta o streaming do console por SSE. Não é preciso criar fonte de dados nova.
- **O gateway já sabe editar.** `EditMessageController` serve `POST /messages/edit` no api-go (`internal/channel/controllers/edit_message.go`).
- **O identificador necessário já volta do envio.** `ChannelSender.send()` devolve `{ messageId }` — o wamid que uma edição exige.

O que falta: a porta `ChannelSender` só tem `send`, e não há política de corte nem garantia de ordem entre edições.

## Problem

A pessoa manda uma mensagem no WhatsApp e fica sem nenhum sinal até a resposta completa chegar. O console tem streaming; o WhatsApp, que é a superfície principal do produto, não — e é lá que a espera é sentida.

## Goal

Quem conversa pelo WhatsApp vê a resposta do orquestrador **começar em ~1-2s** e crescer até ficar completa, em vez de encarar silêncio pelo tempo inteiro da geração.

## Decisions

1. **Escopo: SÓ a resposta do orquestrador** (ratificação do founder). O progresso do turno de issue **não** entra: são minutos de texto, estouram a janela de edição do WhatsApp com frequência e multiplicam as edições (risco de limitação de taxa no número). Vira frente própria depois, já sabendo como o WhatsApp reage às edições no uso real.
2. **Cadência híbrida** (ratificação do founder): o **primeiro envio** dispara assim que houver a **primeira frase completa** — é ele que mata o tempo aparente. As **edições** seguem a cada **~1,5s OU a cada parágrafo, o que vier primeiro**. Nunca por linha: isso faria a mensagem tremer e atrairia rate-limit.
3. **O domínio continua registrando UMA resposta, no fim.** O streaming vive na camada de ENTREGA. Modelar resposta parcial como fato de domínio poluiria o transcript com fragmentos e contaminaria tudo que lê a conversa — inclusive o contexto que volta para o modelo. O console não perde nada: ele já tem stream próprio por SSE.
4. **Canal sem edição, ou janela expirada, continua em mensagem NOVA.** O WhatsApp só permite editar por ~15 minutos. Fechada a janela (ou num canal que não edita), o restante vai como continuação — nada se perde; no pior caso a conversa ganha um segundo balão. A capacidade é declarada pela porta, não presumida por plataforma.
5. **`ChannelSender` ganha `edit`**, apoiado no `POST /messages/edit` que já existe. Nenhum endpoint novo no gateway.
6. **Ordem é garantida por sequência, não por esperança.** Cada edição carrega um número monotônico e a fila **serializa por mensagem de plataforma**; uma edição que chegar atrasada (sequência menor que a última aplicada) é **descartada**, nunca aplicada — senão o texto encolhe na tela do contato.
7. **A última edição carrega o texto COMPLETO e final.** Assim o estado final é correto mesmo que qualquer intermediária se perca: o mecanismo é auto-corretivo, não dependente de entrega perfeita.
8. **Entrega pelo CommandQueue** (durável, com retry), na mesma linhagem do `deliver_channel_message` que a frente B3 estabeleceu. O primeiro envio está no caminho crítico — só depois dele existe o `messageId` que as edições referenciam.
9. **Sem contrato novo** se possível: nenhum evento de integração e nenhum enum novo. Se o comando de edição exigir vocabulário no contrato, ele é declarado uma vez e reusado.

10. **Sinais instantâneos antes do primeiro texto** (pedido do founder, 31/07: "reagir a mensagem que deu trigger com 👀"). Streaming corta a espera para ~1-2s; uma reação corta para ~0 — ela não depende de geração nenhuma. Duas superfícies, ambas já servidas pelo gateway e verificadas em 31/07:
    - **Reação 👀 na mensagem que disparou o agente** (`POST /messages/reaction`, `SendReactionController`). Dispara no momento em que a mensagem é ACEITA como invocável — não quando o turno começa (que ainda espera lease). O predicado é o mesmo `canInvoke` que decide o turno, e essa unidade é deliberada: reagir a uma mensagem que NÃO vai acordar o agente (gate de menção fechado, mensagem fora da janela de 5 minutos) seria mentira. Cue e comportamento nascem da mesma decisão.
    - **Presença de digitação durante a geração** (`POST /messages/presence`, `SendChatPresenceController`) — o "digitando…" nativo do WhatsApp, que é exatamente o que um humano faz. Começa quando o turno começa e cessa quando o primeiro texto sai (a mensagem substitui o sinal). Nota de implementação: a presença expira sozinha na plataforma (ordem de ~10s), então precisa de renovação periódica enquanto durar a geração.
11. **Ciclo de vida da reação.** Uma reação por remetente é substituída ao enviar outra, então trocar é gratuito. `👀` ao aceitar; ao FECHAR o turno, troca para um sinal distinto **apenas quando o desfecho exige o humano** (stop levantado) — esse é o momento em que a pessoa precisa saber que a bola está com ela. Em desfecho normal a própria resposta é o sinal e a reação sai de cena. Qual emoji marca "precisa de você" é escolha de produto do founder; a spec não o fixa.
12. **Cues são best-effort e NUNCA bloqueiam.** Enfileirados no CommandQueue como o resto da entrega; falha em reagir ou em publicar presença não falha o ingest nem o turno, e não gera erro visível ao operador. Um sinal cosmético que derruba a mensagem real seria o pior dos mundos.

## User Stories

- **Story 1:** Como contato no WhatsApp, quero ver a resposta começar quase imediatamente.
  - Given uma mensagem que invoca o orquestrador, when ele começa a gerar, then a primeira frase chega como mensagem em ~1-2s e o restante aparece por edições até o texto final.
- **Story 2:** Como operador, não quero a mensagem "tremendo" nem o número limitado.
  - Given uma resposta longa gerada em 20s, when o streaming roda, then o número de edições é da ordem de uma por ~1,5s ou por parágrafo — não uma por linha.
- **Story 3:** Como contato, nunca quero ver a mensagem encolher ou terminar truncada.
  - Given edições entregues fora de ordem, then a atrasada é descartada e o texto nunca regride.
  - Given qualquer edição intermediária perdida, then a final ainda deixa o texto completo.
- **Story 4:** Como operador, quero que respostas muito longas continuem chegando.
  - Given a janela de edição expirada no meio, then o restante chega como mensagem nova de continuação.

## Acceptance Criteria

- [ ] AC-1: primeira frase completa ⇒ mensagem enviada; o `messageId` devolvido é o alvo de todas as edições daquela resposta.
- [ ] AC-2: edições seguem a cadência híbrida — asserido por teste com relógio controlado (nunca por `sleep` real).
- [ ] AC-3: o texto final entregue ao canal é **idêntico** ao texto da entrada do transcript.
- [ ] AC-4: edição com sequência menor que a última aplicada é DESCARTADA (o texto nunca regride).
- [ ] AC-5: perder edições intermediárias não muda o estado final (prova de auto-correção).
- [ ] AC-6: canal sem capacidade de edição ⇒ comportamento de hoje (uma mensagem no fim), sem erro.
- [ ] AC-7: o transcript registra **uma** entrada por resposta, com o texto completo.
- [ ] AC-9: mensagem ACEITA como invocável ⇒ reação `👀` enfileirada na mensagem que disparou; mensagem NÃO invocável (gate de menção fechado, ou fora da janela de 5 minutos) ⇒ **nenhuma** reação. O teste assere os dois lados — reagir ao que não vai gerar resposta é a falha que mais engana o operador.
- [ ] AC-10: enquanto o turno gera, a presença de digitação está ativa e é renovada; ela cessa quando o primeiro texto sai.
- [ ] AC-11: falha ao reagir ou ao publicar presença NÃO impede o ingest, não impede o turno e não vira erro visível — asserido com a porta de canal falhando.
- [ ] AC-8: FALSEADORES com números: (a) remover a guarda de sequência ⇒ AC-4 vermelho com o texto regredindo; (b) remover a garantia de texto completo na última edição ⇒ AC-5 vermelho; (c) trocar a cadência por "por linha" ⇒ o teste de AC-2 acusa a explosão de edições; (d) desligar a checagem de capacidade ⇒ AC-6 vermelho.

## Notas de implementação (não são decisões)

- `RunOrchestratorTurn.ts` e os arquivos do `OrchestratorAgent` estavam com trabalho não-commitado do founder (feature ConfigurePrompt) em 31/07. A implementação desta spec provavelmente os toca — **confirmar que a árvore está limpa antes de começar**, senão o commit engole a feature dele.
- Vale medir, no primeiro uso real, quantas edições uma resposta típica gera e como o WhatsApp reage. A cadência de 1,5s é um ponto de partida ratificado, não um número medido.
