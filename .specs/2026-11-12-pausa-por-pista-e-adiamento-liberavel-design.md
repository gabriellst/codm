# Pausa por pista e adiamento liberável

Status: Implemented (fase 0 do plano de tarefas visíveis — item 1)
Data: 2026-11-12

## Problema

Quando o provedor recusa um turno por limite de uso, `waitForProvider` faz `defer` do item até o instante de reset informado (`rate_limit_info.resetsAt`) e pausa a fila em memória. Medido em 2026-11-11 numa instalação real:

1. **A janela pode ser semanal.** A pista de issues foi recusada com reset seis dias à frente. A pista de conversa, na mesma conta, seguia completando turnos.
2. **A pausa era da fila inteira.** Dentro de um mesmo processo, uma recusa nas issues calaria todos os grupos até o reset.
3. **O adiamento sobrevivia à pausa.** A pausa vive na memória; o `defer`, na tabela. O daemon reiniciou, a pausa sumiu, todos os outros alvos voltaram a rodar, e os 4 itens adiados — com 6 recados enfileirados atrás deles pela exclusão por alvo do `claimNext` — ficaram esperando os seis dias. As tarefas apareciam como `WORKING`, e o `ReconcileStalledIssues` não as via porque havia item vivo na fila.
4. **O aviso mentia sobre o quando.** "Eu volto a responder às 00:00" para um reset seis dias depois.
5. **Nada observava a causa mudar.** Troca de modelo da thread, upgrade de plano ou limite liberado antes do previsto não tinham como encurtar a espera.

## Decisões

1. **Pausa por pista** (`pausedUntil: Map<MailboxTargetKind, number>`). A recusa pausa só a pista do item recusado; a outra segue. Aviso e "quem já foi avisado" também são por pista.
2. **Restart libera adiamentos herdados** (`releaseDeferredOnce`, antes do primeiro claim). Se o provedor ainda recusar, os primeiros claims restabelecem a pausa em segundos, com tentativa devolvida.
3. **Pausa longa sonda o provedor** a cada `PROVIDER_PROBE_INTERVAL_MS` (30 min): libera os adiados da pista e deixa reivindicar. Recusa ⇒ volta a adiar sem gastar tentativa e sem repetir o aviso. Sucesso ⇒ fim da pausa.
4. **`MailboxRepository.releaseDeferred(targetKind)`**: um adiamento é o único formato de linha com lease futuro e sem holder (`claimed_by IS NULL`), então o predicado nunca toca um turno vivo. A exclusão por alvo continua contando o adiado — a ordem dos itens de um alvo é preservada (o adiado roda antes do que chegou depois).
5. **Aviso diz o que parou e quando**: relação declarada por pista (`Record<MailboxTargetKind, …>`), com dia e hora quando o reset não é hoje e o intervalo de sondagem. Na pista de issues, deixa claro que a conversa continua respondendo.

## Custo

Uma sondagem recusada custa um spawn de CLI por vaga livre da pista a cada 30 minutos. Um restart com o limite ainda em vigor custa o mesmo, uma vez.

## Fora de escopo (próximos itens da fase 0)

- Expor "esperando cota até dd/mm hh:mm" na tarefa (console e, depois, painel).
- Registrar o tipo da janela (`rateLimitType`) para diferenciar limite geral de limite por modelo.

## Testes

`LibSqlMailboxDispatcher.test.ts`:
- recusa na pista de issues pausa só as issues; a conversa responde; aviso com data;
- restart libera o que o processo anterior adiou, na ordem, junto com o recado que estava atrás;
- pausa longa sonda no intervalo, recusa de novo sem repetir aviso, anda quando o provedor volta.
