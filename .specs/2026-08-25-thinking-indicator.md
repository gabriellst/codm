# Indicador "Pensando" — presença com lease, mensagem de fase e spinner do console

**Status:** Approved (founder, 2026-08-25 — "Parece bom assim" + requisito anti-dangling)

## Context

Quando um contato manda mensagem e o agente começa a trabalhar, o canal fica mudo até a
resposta. O founder quer o efeito "Pensando" do Claude Code: estrela animada + verbos
aleatórios (repo claude-code-spinner-verbs, 185 built-in). O gateway Go JÁ tem
`EditMessageHandler`/`EditMessageController` (edição de mensagem no canal é capacidade
viva) e o contrato JÁ tem `channel.chat_presence_updated` (presença de chat inbound).
Unicode não anima em texto; o WhatsApp não anima emoji em mensagem — a única animação
nativa é o indicador "digitando…" do próprio cliente.

## Problem

(a) Sem feedback, o contato não sabe que o agente está trabalhando. (b) Um indicador de
digitação ligado "na mão" já ficou DANGLING numa oportunidade anterior (fim de stream
sem corte) — qualquer desenho novo precisa ser à prova disso por construção.

## Goal

Durante um run de agente disparado por mensagem inbound: o contato vê "digitando…"
nativo (animado pelo cliente) + uma mensagem "✻ Pensando — {verbo}" que evolui por fase
e TERMINA editada como a resposta final; no console, o chat mostra o spinner real
(26 glifos, ease, começa e termina em ✻) + verbo. O indicador de digitação NUNCA fica
pendurado — nem em crash.

## Decisions

1. **Presença = lease com heartbeat, nunca set-and-forget.** O daemon TS renova o
   *composing* a cada ~8s durante o run (o protocolo expira o indicador no cliente em
   ~10-25s sem renovação). Parar de renovar — fim, erro, crash, restart, rede — mata o
   indicador sozinho: o caminho de falha é seguro por construção. Transições terminais
   conhecidas enviam *paused* explícito para corte imediato. Heartbeat amarrado ao ciclo
   de vida do run (mesmo dono da mensagem de fase).
2. **Mensagem de fase por edição.** Ao iniciar o run: envia "✻ Pensando — {verbo}",
   guarda o messageId; a cada MUDANÇA DE FASE real do run (não timer de animação): edita
   com verbo novo + glifo avançado; ao final: EDITA A MESMA MENSAGEM para a resposta do
   agente (zero mensagem fantasma). Erro terminal: edita para a mensagem de erro amigável.
3. **Spinner pleno só no console.** Componente local no chat (SessionChatSection):
   ciclo dos 26 glifos `❀❁❂❃❄❅❆❇❈✦✧✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿` rotacionado para começar/terminar
   em ✻, delays por frame pré-computados com ease-in-out (rápido no meio, desacelera no
   fim), verbo ao lado. Sem wire.
4. **Verbos PT: subset curado de ~60** dos 185 built-in do repo, traduzidos, como
   constantes em `core-typescript` (compartilhado daemon+console — uma lista, sorteio
   por fase). Extensível aos 185 depois se o founder quiser.
5. **Go executa, TS decide.** Nenhuma lógica de animação/fase no gateway: o daemon chama
   Send/Edit/Presence via a superfície S2S existente (mesma porta do forwardToChannel).
   Se o gateway não expõe presença OUTBOUND hoje, ganha o comando (contrato primeiro).
6. **E2E/roteiro**: o overlay do canal de teste precisa aceitar Edit + presença outbound
   (roteiro cresce sob demanda, doutrina existente); o demo/e2e prova o ciclo completo
   inclusive o corte do indicador.

## User Stories

- Como contato no WhatsApp, ao mandar tarefa vejo "digitando…" + "✻ Pensando — Destilando…"
  evoluindo, e a mesma mensagem vira a resposta — nunca fico com "digitando" fantasma.
- Como operador no console, vejo o spinner do Claude Code (ease, verbos) enquanto o run roda.

## Acceptance Criteria

- AC-1: run inbound dispara composing ≤2s após o início; renovado a cada ~8s; após a
  resposta final, indicador cortado (paused explícito) — assertado no e2e via overlay.
- AC-2: matar o daemon no MEIO de um run (teste de processo) não deixa presença ativa
  além da janela de expiração do protocolo — nenhum caminho de código depende de cleanup
  pós-crash (prova por desenho: heartbeat morre com o processo; teste cobre a parada).
- AC-3: mensagem de fase criada no início, editada por mudança de fase (≥2 fases no
  cenário do roteiro) e editada para a resposta final — histórico do canal termina SEM
  mensagem "Pensando" residual.
- AC-4: console renderiza o spinner com a sequência rotacionada (✻ inicial e final) e
  delays ease (teste unitário da função de frames: primeiro/último glifo ✻, delay máximo
  nas pontas, mínimo no meio); story do estado "pensando" no chat.
- AC-5: constantes de verbos PT (~60) em core-typescript, consumidas por daemon e console
  (sem lista duplicada); sorteio não repete o verbo imediatamente anterior.
- AC-6: erro do run edita a mensagem de fase para erro amigável e corta a presença.
- AC-7: `bun tsc`/`bun lint`/testes verdes; contrato regenerado se ganhar comando novo.
