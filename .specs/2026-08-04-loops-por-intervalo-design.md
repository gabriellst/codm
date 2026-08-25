# Loops por intervalo — "a cada X minutos" — Design Spec

**Date:** 2026-08-04
**Status:** Draft
**Bounded Context:** `thread` (Loop / LoopSchedule); contrato (`packages/contracts`), console (`ThreadSettingsDialog/LoopsSection`)
**Kind:** feature
**Story Points:** 5 — uma fatia vertical sobre um agregado que já existe (VO vira união discriminada, migração com backfill, DTO de leitura muda de forma, formulário vira por-variante), sem contexto novo, sem evento novo, sem hop cross-service

## Context

Um **Loop** (`packages/api/typescript/src/thread/entities/Loop.ts`) é o operador falando no timer: um prompt que a CODM sussurra sozinha dentro de UMA conversa. Quem responde "quando?" é o value object `LoopSchedule` (`thread/objects/LoopSchedule.ts`), hoje com exatamente três campos — `timeOfDay` (`HH:MM`), `weekdays` (≥1 dia) e `timezone` (IANA) — e uma única pergunta interessante: `nextRunAfter(from)`, o primeiro instante ESTRITAMENTE depois de `from` que casa com a agenda.

Tudo que orbita o loop já está montado em volta dessa pergunta:

- `Loop` guarda `nextRunAt` **derivado** e re-deriva em cada uma das quatro transições que podem movê-lo (`create`, `reschedule`, `setEnabled`, `markFired`), mais `skipRun` para "essa rodada não acontece".
- `thread_loops` (`packages/contracts/db/schema/thread.ts`) persiste o VO **achatado** em três colunas `NOT NULL` e indexa `next_run_at`, porque a varredura pergunta "quais loops estão vencidos?" em SQL.
- `FireDueLoops` (C25) roda como job repetível de minuto em minuto (`thread/index.ts`), lê `findDue(now, 50)`, e entrega o sussurro compondo `SteerThread` na transação do próprio loop. Uma rodada atrasada além de `MISSED_RUN_GRACE_MS` (1h) vira `skipRun`, não `markFired`.
- O console renderiza a seção `LoopsSection` dentro do `ThreadSettingsDialog`: lista as linhas, um switch por linha, e UM formulário inline com prompt + horário + pílulas de dia da semana, validado pelo schema da própria SDK.

A canônica de agendamento do fork está em `.claude/skills/scheduler/SKILL.md` (SCH-01…SCH-04): persistir agendado, um use case *deliver-due* como costura, o gatilho como job repetível durável (nunca `setInterval`), e "rodada perdida é uma DECISÃO".

## Problem

`LoopSchedule` só sabe dizer **"naquele horário, naqueles dias"**. Não existe forma de pedir a cadência que mais aparece em operação — *"a cada 15 minutos, verifique X"*, *"de meia em meia hora, me diga se o build quebrou"*.

Hoje as duas saídas disponíveis são igualmente ruins:

1. **Criar 96 loops** (um por quarto de hora, sete dias) para simular "a cada 15 minutos". Cada um com seu prompt duplicado, sua linha no console, seu switch. Editar o texto vira 96 edições.
2. **Não usar loop** e pedir ao operador que fique cutucando a conversa na mão — que é exatamente o que a feature existe para eliminar.

E o achatamento tem custo estrutural, não só de UX: `timeOfDay` + `weekdays` + `timezone` são `NOT NULL` na tabela e obrigatórios no schema, então nenhuma outra forma de agenda cabe na linha. O contrato afirma que "quando" tem UMA forma; o negócio tem duas.

## Goal

O operador escolhe entre duas formas de agenda ao criar ou editar um loop — **horário fixo** (o que já existe, intacto) e **intervalo** ("a cada X minutos") — e o resto do produto (varredura, pausa, edição, console) trata as duas exatamente igual, porque as duas respondem à mesma pergunta.

## Decisions

1. **`LoopSchedule` vira uma UNIÃO DISCRIMINADA, não um objeto com campos opcionais.** O discriminante é `kind: LoopScheduleKind` com dois membros: `DAILY` (`timeOfDay`, `weekdays`, `timezone`) e `INTERVAL` (`everyMinutes`). Achatar as duas formas num objeto tudo-opcional com `.refine()` é exatamente o que o Não-Negociável #3 proíbe: um loop de intervalo com `weekdays: []` guardado "porque a coluna é opcional" é uma linha que mente sobre o que é.

2. **`LoopScheduleKind` é enum de contrato (TypeSpec), não enum local.** Ele atravessa o fio: o console discrimina por ele para escolher qual formulário renderiza e qual membro valida. Enum cross-boundary mora em `packages/contracts/wire/enums/`, pareado com `enumCheck` na tabela — a mesma regra que `DayOfWeek` já segue.

3. **Duas classes de VO sobre uma base abstrata, e uma fábrica que despacha por `kind`.** `DailyLoopSchedule` e `IntervalLoopSchedule` estendem `BaseLoopSchedule`, que declara `nextRunAfter(from)` e `isRunStale(scheduledFor, now)` como abstratos. Por que não uma classe só com `switch` interno: `BaseValueObject<T extends ZodObject>` exige um `ZodObject` (uma união não é), e o truque de tipagem que a casa usa — `interface X extends XProps {}` — não compila sobre um tipo-união. Duas classes é o que o modelo já pedia; a tipagem só tornou isso explícito.

4. **A cadência do intervalo é ancorada no ÚLTIMO EVENTO, não numa grade de relógio.** `nextRunAfter(from) = from + everyMinutes`. Quem chama já passa o instante certo em cada transição: `create`/`setEnabled` passam `now` (o primeiro disparo é daqui a X, nunca imediato), `markFired` passa o instante em que disparou, `skipRun` passa `now`. Uma grade absoluta ("nos minutos 00/15/30/45") exigiria uma âncora persistida e um fuso — e um daemon que dorme metade do dia produziria buracos que ninguém pediu.

5. **`everyMinutes` é inteiro entre 1 e 1440**, com erro de domínio próprio `INVALID_LOOP_INTERVAL`. O piso é a resolução real do sistema (a varredura roda de minuto em minuto, e `HH:MM` é a resolução do outro membro). O teto é um dia: acima disso "a cada X minutos" não é mais uma cadência, é um horário — e horário já tem membro.

6. **A janela de tolerância vira POLIMÓRFICA, e um loop de intervalo nunca fica obsoleto.** `MISSED_RUN_GRACE_MS` sai de `FireDueLoops` e passa a ser `isRunStale` no VO. Para `DAILY` a regra e o valor não mudam (1h): "bom dia, como está o deploy?" entregue às 14:00 lê como defeito. Para `INTERVAL` não há relógio de parede para desmentir — 15 minutos não significam nada em particular do dia — então uma rodada atrasada simplesmente dispara **uma vez** e re-ancora. Não há rajada: `markFired` deriva a próxima rodada do instante em que disparou, então uma semana de máquina desligada produz UM disparo no retorno, não uma fila deles.

7. **A persistência continua ACHATADA na mesma tabela**, com `kind NOT NULL` (backfill `'DAILY'`), as três colunas do membro diário viradas anuláveis e `every_minutes INTEGER` anulável — a forma relacional canônica de uma união discriminada. Uma coluna JSON única guardaria o mesmo dado e tiraria a checagem de enum e a legibilidade da linha; uma tabela por membro seria um join para responder "quais estão vencidos?", que é a única pergunta quente aqui. `next_run_at` e seu índice não mudam — é justamente por serem a única coisa que a varredura lê que os dois membros convivem sem custo.

8. **O DTO de leitura passa a carregar `schedule` como união**, em vez dos três campos achatados no nível do loop. É o mesmo formato que o corpo de create/update já usa, o que faz o console poder devolver `loop.schedule` direto como `defaultValues` do formulário — e faz o `tsc` apontar todo lugar que assumia "todo loop tem `timeOfDay`".

9. **O console ganha um SELETOR de forma e um componente de campos por variante**, despachado por mapa (`CMP-P18`), e cada variante valida contra seu membro concreto (`FRM-P43`). Não existe formulário único com todos os campos opcionais. O texto do prompt é o mesmo nas duas variantes e vive num campo compartilhado, apresentacional.

10. **Nada de janela ativa, dia da semana no intervalo, ou cron.** "A cada 15 minutos, mas só em dias úteis das 9 às 18" é um terceiro membro plausível e ninguém pediu. Ele CABE (é só mais um membro da união) — que é a propriedade que esta spec compra. Fica registrado como follow-up, não implementado.

11. **Nenhum evento novo, nenhum contexto novo, nenhuma mudança no gatilho.** `FireDueLoops` continua sendo o mesmo job de minuto em minuto (SCH-03a) e continua sem regra de negócio: ele pergunta ao VO. Um loop de 15 minutos não precisa de varredura mais fina — precisa de `next_run_at <= now`, que já é como a busca funciona (SCH-02).

## User Stories

- **Story 1:** Como operador, quero agendar um prompt "a cada X minutos" numa conversa, para acompanhar algo que muda o tempo todo sem criar dezenas de loops de horário fixo.
  - Given estou no diálogo de configurações de uma conversa, when clico "Novo loop", escolho a forma **intervalo**, escrevo o prompt e digito `15`, then o loop é criado ativo e a próxima rodada é daqui a 15 minutos.
- **Story 2:** Como operador, quero que os loops de horário fixo continuem funcionando exatamente como funcionavam, para não perder nada do que já agendei.
  - Given tenho loops de horário fixo criados antes desta mudança, when o sistema sobe com a migração aplicada, then eles continuam listados, ativos, com o mesmo horário, os mesmos dias e a mesma próxima rodada.
- **Story 3:** Como operador, quero trocar a forma de um loop existente (de horário fixo para intervalo e vice-versa), para não ter que apagar e recriar.
  - Given um loop de horário fixo, when o edito escolhendo intervalo de 30 minutos e salvo, then ele passa a repetir de 30 em 30 minutos e a próxima rodada é re-derivada a partir de agora.
- **Story 4:** Como operador, quero que um loop de intervalo retome a cadência quando eu ligo a máquina, para não perder o acompanhamento por causa de um período com o app fechado.
  - Given um loop "a cada 15 minutos" cuja rodada venceu há 3 horas com o daemon fechado, when o daemon volta, then ele sussurra **uma** vez e re-ancora a próxima rodada 15 minutos depois — nunca uma rajada das rodadas perdidas.

## Acceptance Criteria

1. `IntervalLoopSchedule({ everyMinutes: 15 }).nextRunAfter(t)` é exatamente `t + 15min`; `everyMinutes` fora de `[1, 1440]` ou não inteiro levanta `INVALID_LOOP_INTERVAL` na construção.
2. `DailyLoopSchedule` mantém, sem alteração de comportamento, todas as asserções existentes de `LoopSchedule.test.ts` (dia da semana no fuso, DST, spring-forward, "estritamente depois", normalização dos dias).
3. `Loop.create` com agenda de intervalo nasce habilitado e armado em `now + everyMinutes`; `markFired` re-ancora a partir do instante do disparo; `setEnabled(false)` limpa `nextRunAt`; `setEnabled(true)` re-arma a partir de `now`.
4. `FireDueLoops` dispara um loop de intervalo vencido há 3 horas (não há janela para intervalo) e pula um loop diário vencido há mais de 1 hora, registrando `skipRun` em vez de `markFired`.
5. `GET /threads/:id/loops` devolve `schedule` como união discriminada por `kind`; `POST`/`PUT` aceitam qualquer um dos dois membros e recusam um corpo que misture campos de membros diferentes.
6. Linhas de `thread_loops` criadas antes da migração continuam legíveis e disparáveis, com `kind = 'DAILY'`.
7. O console renderiza um seletor de forma, os campos da variante escolhida, e a linha de cada loop mostra sua cadência (pílulas de dia + horário, ou "a cada N min"); trocar a forma no formulário troca os campos e o schema que valida.
8. `bun tsc`, `bun lint`, `bun run test` verdes; `bun sdk` + `bun contracts` regenerados e commitados.

## Riscos

- **Migração com recriação de tabela.** Tornar três colunas anuláveis em SQLite obriga o drizzle-kit a recriar `thread_loops` (create-new → insert-select → drop → rename). É a rota padrão do gerador e preserva os dados, mas o SQL gerado precisa ser lido, não assumido — e espelhado na cópia `//go:embed` do gateway (`db:sync-go`, com `db:check-go` como portão).
- **Forma do DTO de leitura muda.** Qualquer consumidor de `listThreadLoops` que lia `loop.timeOfDay` quebra no `tsc` — que é o objetivo. Hoje o único consumidor é `LoopsSection`, mais os dublês de rede do teste e da story do `ThreadSettingsDialog`.
- **Loops de 1 minuto são caros.** Cada disparo enfileira um turno de agente. O piso é decisão explícita do operador (Decisão 5) e o console não sugere nada abaixo do exemplo de 15; não há quota nova nesta spec.

## Follow-ups (fora de escopo)

- Um terceiro membro `WINDOWED_INTERVAL` ("a cada X minutos, entre HH:MM e HH:MM, nestes dias"), se e quando alguém pedir.
- Sugestões/atalhos de cadência no console (5/15/30/60) — hoje é um campo numérico.
