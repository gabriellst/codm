# Plano — a voz do grupo (spec `.specs/2026-11-25-voz-do-grupo-design.md`)

Aprovado pelo dono em 25/11 ("parece bom"), com três acréscimos: os artefatos voltam à conversa, a conversa precisa de mais contexto, e um aviso quando alguém escreve enquanto o agente ainda responde outra mensagem ("podemos deixar em fila").

Uma fatia por commit; `tsc` + testes da fatia verdes antes do próximo. Release única (0.12.0) no fim.

## P1 — Formatos sem código e sem link
- `thread/i18n/messages.ts`: `SIGNAL_PT`/`SIGNAL_EN` começam por `<emoji> <chave> — <texto>`. Saem `· D#`, o link do painel, `(+N no console)` e o "Sigo com"; entra `Se ninguém responder em 15 min: <rótulo>.` e, na decisão, `Responda com o número ou citando esta mensagem.` O boletim mantém o link.
- `answerDisambiguation`: as perguntas são nomeadas pela chave da tarefa e pelo começo da pergunta, sem código.
- `thread/utils/OutputPolicy.ts`: `DIGEST` sai da tabela (pergunta e prévia vão sozinhas); `FlushSignalDigest` fica para drenar o que já estiver na fila.
- Nada que lia os prefixos antigos (grep: `· D`, `askCode(` na saída do grupo). Os códigos continuam sendo ACEITOS (`parseAskCode`, `RuleRouter`).
- Spec da fase 3: revisão onde o aceite muda (resumo por pessoa, contagem de mensagens).
- Testes: formatos por nível (PT e EN), `DeliverIssueSignal`, `RaiseStop`, `FlushSignalDigest`, `fase3-typical-task`.

## P2 — A tarefa se chama por slug curto
- `ForkIssue` / `DeclareIssueOpen`: campo `name` (2 a 4 palavras, até 24 caracteres). Chave = `uniqueSlugKey(name, chaves da conversa)` (índice `issues_thread_key_unq` é por conversa). Sem `name`: as 3 primeiras palavras do título. Toda chave tem hífen (nome de uma palavra ganha sufixo `-<n>`), então nunca uma palavra solta.
- `shared/utils/slug.ts`: tirar os acentos (`\p{M}`) em vez de virar hífen.
- `RuleRouter`: a chave citada no texto é procurada entre as chaves das tarefas abertas da conversa (token inteiro, sem diferenciar maiúsculas), e não por regex de formato. Vale para `BDA-15` e `video-na-landing` igual.
- Prompt do orquestrador: pedir o `name`. `bun sdk` se o schema do controller mudar.
- As tarefas abertas com `BDA-n` mantêm a chave até fechar (7 hoje); as de slug longo vão para a limpeza (fora do código).

## P3 — Artefatos de volta
- Tabela declarada `ARTIFACTS_TO_GROUP: Record<GroupOutputMode, Record<IssueSignalLevel, boolean>>` em `OutputPolicy`: as imagens de prévia, progresso e fechamento vão ao grupo em `DECISIONS_AND_LIVE` e `EVERYTHING`.
- `DeliverIssueSignal`: toda imagem citada vai, até 6 por sinal, cada uma com a sua entrada ligada à tarefa (citar a imagem roteia), id determinístico por sinal + artefato. Legenda: `<chave> — <nome do artefato>`.
- `ReportProgress` aceita `artifactIds` (as 15 imagens não citadas de 24/11 eram prints de verificação que a 0.9.0 mandava ao grupo). O texto do progresso segue a tabela de rota (painel no padrão); as imagens seguem `ARTIFACTS_TO_GROUP`.
- Descrições das ferramentas: todo print que mostra algo ao grupo vai citado.

## P4 — Aviso de "estou respondendo outra"
- `MailboxRepository.runningItem(targetKind, targetId)`: o item com dono e não consumido (LibSql + Mock).
- `IngestChannelMessage`, nos mesmos ramos `invocable` do 👀 (nunca no caminho de resposta):
  - THREAD com turno do orquestrador em curso: `Ainda estou respondendo a mensagem anterior — respondo uma de cada vez. A sua ficou na fila e já vem.`
  - STEER para tarefa em turno: `Recebi — <chave> está no meio de um passo e lê isso assim que terminar.`
- Um aviso por turno em curso: `jobId = busy:<id do item em curso>`. Cita a mensagem nova. Entrada SYSTEM (o console vê o mesmo que o grupo).
- Sem cortar o turno (decisão do dono: fila).

## P5 — Voz curta
- Descrições de `AskDecision`, `AskQuestion`, `RequestFeedback`, `ReportProgress`, `DeclareIssueComplete`: para o grupo, até 3 frases curtas, sem PR/merge/worktree/commit/console, sem chave nem código.

## Fora deste plano
- Limpeza das 23 tarefas abertas com slug longo (lista para o operador aprovar).
- Duas vozes (orquestrador repetindo a tarefa): rastrear os outros pares antes.
