/**
 * Os EXECUTORES DE COMANDO deste contexto — barril mecânico (B3, decisão 2).
 *
 * Sem estas linhas o caminho inteiro fica inerte do jeito mais difícil de notar: produtores
 * enfileiram, o `tsc` fica verde, todo teste unitário passa, e nenhuma mensagem chega ao canal.
 * Registrar também LIGA o poller da fila neste processo.
 *
 * As duas PISTAS INSTANTÂNEAS (spec de streaming, decisão 10) compartilham exatamente esse modo de
 * falha: sem registro, produtores enfileiram e ninguém reivindica, então o emoji nunca aparece e o
 * indicador nunca acende — com o `tsc` verde e todo teste unitário passando.
 *
 * `StreamChannelReply` é a mesma história outra vez, com um agravante que a torna ainda mais
 * silenciosa: sem registro, a resposta é entregue muito bem pelo `DeliverChannelMessage` no fim do
 * turno — então nada quebra, nenhum teste falha, e o único sintoma é que o streaming pelo qual esta
 * frente inteira existe simplesmente não acontece.
 */
export { DeliverChannelMessage } from '../usecases/DeliverChannelMessage'
export { DeliverChannelAttachment } from '../usecases/DeliverChannelAttachment'
export { ReactToChannelMessage } from '../usecases/ReactToChannelMessage'
export { StreamChannelReply } from '../usecases/StreamChannelReply'
export { SustainTypingPresence } from '../usecases/SustainTypingPresence'
