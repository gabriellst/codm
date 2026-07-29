# GOAL — Pós-pivot: a volta do resultado, o steer, e o console que combina com o design

**Base:** `agent-abstraction` @ `b04523ba` · **Origem:** feedback do founder após o primeiro uso real (29-jul)
**Spec do pivot:** `.specs/codedm/2026-07-28-orchestrator-pivot.md` (v3, D1–D9 ratificadas)
**Design:** projeto claude.ai `3e62a296-72b1-4076-8425-3a67eec50074` ("AnywhereCode desktop app") — `CodeDM.dc.html` + 16 screenshots

> **PROVA É EM CÓDIGO.** Decisão do founder: nada aqui exige o grupo real do WhatsApp. Toda AC se
> fecha com teste automatizado (unit / integration / flow) e com a suíte Playwright que já existe
> permanecendo verde. Não há passo manual no caminho de aceite.

---

## 0. De onde isto vem — o que o uso real mostrou

O produto funcionou na primeira conversa de verdade: conversou, forkou issue com ack imediato, e a
voz saiu certa ("criei a issue … — te aviso quando tiver resultado", "No."). O que quebrou:

| sintoma que o founder viu | causa real | onde |
|---|---|---|
| "marquei a issue como concluída mas nunca me mandou o resumo" | `ISSUE_RESULT` não existe — a F4 nunca foi construída | B1 |
| "mandei steer e ele não perguntou de novo" | `thread.steered` tem ZERO consumidores (§7.7) | B2 |
| "ele se recusa a escrever arquivo" | uma frase do `OrchestratorAgent/prompt.ts` | B4 |
| "eventos do outbox com 1 attempt" | **não é bug** — `attempts` conta execuções INICIADAS, e `last_error` é NULL em tudo | — |
| "conversas não aparecem" | `Navbar` lê `activeSessions`, que filtra `RUNNING\|NEEDS_ATTENTION`; a thread está `IDLE` | F1 |

O próprio agente diagnosticou o B1 na conversa: *"A issue está mesmo COMPLETED — mas o resultado
nunca me chegou aqui, então eu respondi 'ainda rodando' sem saber."* Enquanto o B1 não fechar, o
produto **mente para o operador**, e essa é a razão dele vir primeiro.

---

## 1. Tarefas, em ordem

Cada tarefa é um commit (ou poucos), **verde antes de seguir**.

### B1 — O resultado da issue volta e é COMPOSTO (§6.3, §7.4, §7.6)

`RunIssueTurn.persistOutcome` insere, **na mesma transação dos eventos de outcome**, um item
`ISSUE_RESULT` na mailbox da THREAD — com `outcome`, `replyText` e `originEntryId`. O dispatcher
agenda um turno do orquestrador; o `OrchestratorPromptBuilder` já sabe compor essa variante (o
`issueResult` do prompt existe e é testado). A citação é **obrigatória** e não é decisão do modelo:
`RunOrchestratorTurn` seta `replyToEntryId = originEntryId`.

`DeclareIssueComplete` passa a PERSISTIR o `summary` que hoje descarta no ramo COMPLETED — é ele que
alimenta a composição.

- **AC-B1.1** — flow test: fork → turno de trabalho conclui → item `ISSUE_RESULT` existe na mailbox da
  thread, na MESMA transação do outcome (assertar que um outcome revertido não deixa item).
- **AC-B1.2** — flow test: dispatcher drena o `ISSUE_RESULT` → nasce `OrchestratorRepliedEvent` com
  `replyToEntryId` = o `originEntryId` da issue.
- **AC-B1.3** — o prompt do turno `ISSUE_RESULT` **não** renderiza a seção QUOTING (já coberto por
  `prompt.test.ts`; re-assertar após a mudança).
- **FALSEADOR B1** — remova o `replyToEntryId` forçado no use case e AC-B1.2 fica VERMELHO. Prove.

### B2 — Steer funciona (D7, §7.7)

`issue/steer { issueId, text }` entra no escopo `orchestration` (hoje só `ForkIssue`,
`GetSessionIssues`, `GetIssueStatus`). Enfileira `STEER` na mailbox da ISSUE. `SteerThread` (console)
é repontado para enfileirar `STEER` nas issues ativas da thread — `thread.steered` ganha seu primeiro
consumidor de fato, e o WHISPER continua no transcript como registro.

**T2f VALE PARA O `issue/steer`**: ele aceita `issueId` e o token de `orchestration` não carrega claim
de issue, então o handler verifica `issue.threadId === claims.threadId` por conta própria. Sem isso, um
modelo dirigido por mensagem de terceiro redireciona trabalho de outra conversa.

- **AC-B2.1** — o dispatcher, ao consumir `STEER`, roda um turno do subagent com o texto como prompt.
- **AC-B2.2** — `SteerThread` do console enfileira `STEER` para cada issue ativa da thread.
- **AC-B2.3** — um token de `orchestration` da thread A não consegue steerar issue da thread B.
- **FALSEADOR B2** — comente a checagem de dono e AC-B2.3 fica VERMELHO. Prove.

### B3 — `RequestAgentReplyDelivery` morre (§5, F4)

**No MESMO commit do B1.** Vivo junto com a composição, ele entrega a voz crua do worker direto no
canal, em corrida com o turno composto: **duas mensagens por conclusão**. Morre com ele o wire event
`integration.agent.reply_drafted`.

- **AC-B3.1** — `git grep RequestAgentReplyDelivery -- packages/api/typescript/src` vazio.
- **AC-B3.2** — flow test: UMA conclusão de issue produz UMA `ChannelDeliveryRequestedEvent`.
- **FALSEADOR B3** — reintroduza o handler e AC-B3.2 fica VERMELHO (duas entregas). Prove.

### B4 — O orquestrador PODE escrever, mas prefere forkar (founder, 29-jul)

A proibição total sai do `OrchestratorAgent/prompt.ts`. No lugar: o orquestrador **pode** editar, mas a
orientação é forkar uma issue quando o trabalho é mais que trivial — para não ficar ocupado e travar a
conversa (o turno é serializado por thread, então enquanto ele edita, ninguém é respondido).

> Nota estrutural, para decisão do founder e NÃO para inventar aqui: o isolamento de verdade é o
> worktree-por-issue do R6. A instrução é a versão v1; a estrutural fica registrada como follow-up.

- **AC-B4.1** — `prompt.test.ts`: o texto NÃO contém proibição absoluta de escrita, e CONTÉM a
  orientação de preferir forkar.

### F1 — As conversas aparecem

`GetHomeDashboard` ganha a lista COMPLETA de threads (não só `activeSessions`, que filtra
`RUNNING|NEEDS_ATTENTION`). `Navbar` passa a ler essa lista. `activeSessions` continua existindo para
o bloco "Sessões ativas" — são duas perguntas diferentes e a home mostra as duas.

- **AC-F1.1** — teste do use case: thread `IDLE` aparece na lista de threads e NÃO em `activeSessions`.
- **AC-F1.2** — `bun sdk` regenerado E commitado; `bun check:generated` exit 0.

### F2 — A thread atualiza em tempo real

A página da thread reage aos integration events (SSE) em vez de depender de refetch manual:
mensagem nova, mudança de status, issue criada/concluída.

- **AC-F2.1** — teste do componente/hook: ao chegar o frame SSE, a query correspondente é invalidada.

### F3 — Terminal output correto, em tempo real, e recuperável

Hoje não atualiza ao vivo e não recupera ao sair e voltar. Precisa das duas metades: o STREAM (SSE) e
o HISTÓRICO (o que já rolou antes de você abrir).

- **AC-F3.1** — abrir uma issue com turno em andamento mostra as linhas ANTERIORES, não só as novas.
- **AC-F3.2** — sair da tela e voltar não perde o que já tinha.

### F4 — Sem seletor steer/direct

O seletor sai. A regra passa a ser: **steer quando o agente está pausado**; caso contrário, mensagem
normal. Uma decisão do estado, não do usuário.

- **AC-F4.1** — teste: com a thread pausada, o envio vira STEER; com ela rodando, não.

### D1 — Importar o design e alinhar as páginas

Ler `CodeDM.dc.html` + screenshots do projeto claude.ai via `DesignSync` (leitura; o projeto é
`PROJECT_TYPE_PROJECT`, então NÃO dá para empurrar componentes de volta — só ler). Depois, página por
página: home, thread, issues, channels, workspaces, settings, e os diálogos.

### D2 — Home page igual ao design

Cores batendo, e o card sem a parte de baixo faltando. Se `CardFooter` entrar, **sem linha horizontal
e sem cor diferente** — tudo limpo e contínuo. (O founder já começou isso: há um import de `CardFooter`
não commitado em `HomeDashboard/index.tsx`.)

### D3 — Header da thread

Muito diferente do design, e precisa ser **sticky** — não rolar junto.

### D4 — Padding

O card de stats da home está com padding errado (ver screenshot do founder).

### D5 — i18n, varredura de verdade

"Good morning" aparece em português. Enums sem label traduzido. **E é maior do que parece**: o
`test:tooling` já reporta **199 chaves de `pt.json` sem referência literal** no source do React —
famílias dinâmicas (`errors.*` via `lib/errors.ts`) aparecem ali por construção, mas é nesse palheiro
que os enums faltantes estão. Varredura, não remendo dos dois que o founder viu.

- **AC-D5.1** — nenhuma string de UI hard-coded em inglês nas páginas tocadas.
- **AC-D5.2** — todo enum renderizado passa por `enumLabel` e tem chave em `pt.json` E `en.json`.
- **AC-D5.3** — o gate de i18n-coherence continua verde.

---

## 2. Como se prova (TUDO em código)

```
cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit && bun test
cd packages/contracts && bun test codegen/
cd packages/api/go && go build ./... && go test ./...
bun run test:tooling && bun tsc && bun check:generated
cd packages/api/typescript && bun scripts/dump-sqlite-schema.ts --check
cd packages/e2e && bun e2e
```

**Sem prova no grupo real.** Decisão do founder para este goal.

### As disciplinas que já custaram caro nesta linhagem

- **Prove que o gate REPROVA.** Os falseadores marcados são obrigatórios: teste vermelho com a
  implementação desligada, verde com ela ligada.
- **`tsc` verde não é evidência.** Cinco defeitos desta fase passaram por tsc e pela suíte unitária:
  o dispatcher nunca iniciado, handlers sem container, `ctx` de middleware apagado pela validação Zod,
  entrega morta bloqueando o outbox, e o drain serializando alvos.
- **Middleware que stampa `ctx` PRECISA declarar a chave no schema do controller** — Zod stripa
  desconhecida, em silêncio.
- **Cadeia correta elo a elo não é cadeia ligada.** Onde algo atravessa camadas, teste de FLOW.
- **Meça antes de teorizar.** Um e2e "lento" custou três hipóteses de arquitetura; os timestamps do
  banco responderam em um comando (a cadeia levava 2,5s — o teste é que esperava a chave errada).
