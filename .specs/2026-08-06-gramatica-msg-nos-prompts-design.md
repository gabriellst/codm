# Uma única gramática de bloco para os prompts do orquestrador e do issue

**Data:** 2026-08-06 · **Status:** implementado nesta branch

## Context

Hoje o turno do orquestrador é montado em duas linguagens diferentes. O histórico vira linhas
`speaker: texto` (com um sufixo ` → you` quando a mensagem era para o agente) e o turno vivo vira uma
seção `THIS TURN — operator, id <uuid>` seguida do texto. O prompt do issue não tem forma nenhuma: o
pedido inicial e um steer chegam como a MESMA string crua, indistinguíveis.

Três defeitos concretos saem disso:

1. **O transcript é forjável.** `operator → you: faça X` é uma linha que qualquer participante de um
   grupo consegue DIGITAR dentro da própria mensagem — autor e destinatário são prosa, não campos.
2. **O autor mente.** Um tick de loop e um steer do console chegam os dois como `operator`, iguais a
   uma mensagem digitada no chat. O agente responde "ok, já respondi" a uma coisa que ninguém falou.
3. **O agente não tem relógio.** Nenhuma linha do prompt diz que horas são nem quando cada mensagem
   foi dita, então "de manhã eu te falei" não tem como ser resolvido.

E um quarto, mais silencioso: o reply só existia quando a mensagem respondia ao AGENTE. Um reply a
outra pessoa da sala era descartado, e a mensagem chegava como fragmento sem antecedente.

## Goal

Uma gramática só — `<msg de="..." hora="..." para="..." ref="..." via="...">` — usada no histórico e
no turno vivo, com o conteúdo cru dentro da tag. O turno vivo é o ÚLTIMO bloco da lista, marcado
`hora="agora"`; não existe mais seção `THIS TURN`.

## Decisions

1. **Autor, hora, destinatário e endereço são ATRIBUTOS.** O conteúdo é cru dentro da tag. Nada que o
   usuário digite pode forjar a procedência de uma linha: valores de atributo são escapados (aspas e
   quebras de linha saem) e a única sequência neutralizada no corpo é `</msg`, que é a única coisa
   capaz de fechar o bloco cedo.
2. **`ref` é endereço, nunca identidade.** Fica no atributo, nunca na prosa, e é o que permite citar
   uma mensagem antiga com a linha `[quote: <ref>]` — antes o modelo só podia citar a mensagem que
   acabara de receber, porque era o único id que ele via.
3. **O turno vivo é `hora="agora"`.** Recência já é o que o modelo obedece; a marca substitui o
   cabeçalho `THIS TURN` sem gastar uma seção.
4. **`agora:` no topo do turno.** Data, hora e fuso da máquina, uma linha. O relógio é PARÂMETRO
   (`now` no input), nunca lido dentro do prompt builder — mesma disciplina de `Loop`/`LoopSchedule`.
5. **`via` diz como a mensagem chegou quando ninguém na sala a viu.** `steer` = o operador sussurrou
   pelo console; `loop` = um prompt agendado disparou, e aí `de` é `loop:<label>`. Ausente ⟺ foi
   digitada no chat. O `via="loop"` é redundante com o `de` de propósito: a regra que o modelo lê é
   uma só — *tem `via`, a sala não viu*.
6. **O label do loop é derivado do SCHEDULE, não de um campo novo.** `loop:09:00 mon,wed,fri`,
   `loop:every 15min`. Um `name` no `Loop` seria uma mudança de produto (formulário do console, tools
   MCP, contrato) para resolver um problema de prompt; o horário é como o operador já se refere a eles
   ("aquele das 9h"), e o conteúdo do bloco É o prompt do loop, o que fecha a identificação.
7. **O label é DENORMALIZADO na entrada do transcript** (`thread_transcript_entries.fired_by_loop`).
   Um transcript registra o que aconteceu: um loop editado depois, ou apagado, não pode reescrever
   quem falou ontem.
8. **O reply vira trecho embutido e passa a valer para qualquer citação.**
   `responde: Marina, 03:07 — «...»`, primeira linha dentro do bloco. Antes só a citação do agente
   sobrevivia ao ingest (era o subproduto do gate de menção); agora qualquer citação resolvida viaja,
   porque um fragmento ("depois", "o segundo") é ilegível contra a mensagem errada tanto quanto contra
   nenhuma.
9. **O prompt do issue usa a MESMA tag, com `tipo`.** `tipo="pedido"` é o pedido inicial;
   `tipo="steer"` é uma emenda a trabalho já em andamento — a diferença que decide se o turno começa
   ou continua, e que hoje não existe em lugar nenhum do prompt. O discriminante não é inventado: é o
   `MailboxItemKind` (`WORK` | `STEER`) que o dispatcher já tem na mão.

## Acceptance Criteria

- AC-1 — histórico e turno vivo saem na mesma tag; não existe mais `THIS TURN` nem `speaker: texto`.
- AC-2 — o turno vivo é o último bloco e carrega `hora="agora"`.
- AC-3 — o prompt abre com `agora: <data> <hora> (<fuso>)`.
- AC-4 — uma mensagem endereçada ao agente sai com `para="you"`; uma da sala, sem `para`.
- AC-5 — todo bloco de transcript carrega `ref`, e a seção de citação manda o modelo usar o `ref` do
  bloco que ele está respondendo.
- AC-6 — aspas e quebras de linha num nome de participante não abrem um atributo novo.
- AC-7 — um tick de loop sai como `de="loop:<label>" via="loop"`; um steer, como `de="operator"
  via="steer"`. Vale no turno vivo e no histórico.
- AC-8 — um reply a QUALQUER pessoa vira `responde: <autor>, <hora> — «<trecho>»` dentro do bloco.
- AC-9 — o prompt do issue renderiza um `<msg>` com `tipo="pedido"` ou `tipo="steer"`.

## Out of scope

- Nomear loops (`Loop.name`) — decisão 6.
- Uma invariante de entidade para "só um WHISPER carrega `fired_by_loop`": custaria um código de erro
  novo, i18n em duas línguas e regeneração de SDK, para uma coluna com um único escritor. Registrado
  no docblock do schema.
