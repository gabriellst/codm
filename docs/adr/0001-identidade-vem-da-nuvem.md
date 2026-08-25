# ADR 0001 — Identidade vem da nuvem; `auth` é contexto cloud-only

- **Status:** aceito
- **Data:** 2026-08-14
- **Decidido em:** sessão de grill (founder + orquestrador)

## Contexto

O codm roda em dois lugares a partir do mesmo código: um **daemon local** dentro do shell Tauri, e
uma **instância na nuvem**. Até aqui os dois montavam todos os contextos, e a identidade local era
uma constante.

O `OperatorMiddleware` carimba `OPERATOR_ID` / `OPERATOR_SESSION` incondicionalmente em toda
request — sem credencial, sem consulta de sessão, sem lookup de owner. O próprio docblock declara
a intenção de ser temporário:

> *"There is exactly ONE operator (founder decision 2): no credentials, no session store, no owner
> lookup. (…) Swapping a real auth boundary back in is a one-file change here — the rest of the
> codebase never learns the axis collapsed."*

O problema com isso é concreto: se `ownerId` nasce localmente, ele pode ser **alterado à mão**. O
eixo de tenancy do sistema inteiro passa a ser um valor que a máquina do usuário escolhe. Tenancy
tem de vir de autenticação, não de configuração local.

Um seam para falar com a nuvem **já existia** e já é carregado — o `FileCloudSession` valida o
device token chamando a SDK gerada do próprio produto contra a instância remota:

```ts
import { getEntitlement } from '@codm/client-typescript/typescript'
await getEntitlement({ baseURL: Config.env.CODM_CLOUD_URL, headers: { Authorization: `Bearer ${token}` } })
```

Só que ele resolvia **permissão** ("esta instalação pode rodar?"), não **identidade** ("quem é o
dono disto?"). E `GetEntitlement` já devolve `userId` — a nuvem já sabia responder, ninguém
perguntava.

## Decisão

**O contexto `auth` passa a ser 100% nuvem.** Ele não monta no perfil local.

**A identidade local é resolvida contra a nuvem**, por um middleware novo que substitui o
`OperatorMiddleware`: ele chama `GetSession` na instância remota usando a SDK do próprio produto
com `baseURL` apontada para `CODM_CLOUD_URL`, e carimba em `request.ctx` o `user` / `session` /
`ownerId` que a nuvem devolveu — preservando exatamente a forma que o código downstream já lê.

**O contexto `owner` também é cloud-only.** Não existe Owner nascido localmente; os recursos
locais carregam apenas a **referência** `ownerId`, que veio da autenticação.

**A sessão resolvida é cacheada em disco, e o cache vale indefinidamente offline.** Só um 401/403
explícito da nuvem invalida; timeout, falha de DNS ou 500 não mudam nada.

> ⚠️ **EMENDADO em 2026-08-15 — esta decisão foi revertida.** A sessão NÃO é mais cacheada e a
> identidade é perguntada à nuvem. Ver *Emenda 1* no fim deste documento antes de agir por este
> parágrafo. Esta é, deliberadamente,
a mesma postura que o `CloudSession` já aplica ao entitlement — uma regra só para responder "posso
usar isto agora?", e o `FileCloudSession` é o molde a seguir.

**Uma única peça de `auth` fica local, e por necessidade física:** o `SetCloudTokenController` e o
serviço `CloudSession`. Eles migram para `shared` (o contexto de infra local). A razão está no
próprio docblock do controller — *"the caller is this machine's own console, never the cloud"*: o
console troca o código de uso único por um token **no processo dele**, e precisa entregá-lo ao
daemon sem reiniciar. Isso é uma travessia entre dois processos da mesma máquina, não
autenticação. Movê-la para `shared` é o que permite `auth` sair inteiro sem inventar composição
por controller.

**O frontend passa a ter dois clients TypeScript**, um de nuvem e um local.

## Alternativas descartadas

- **Composição por controller** (manter `auth` único e escolher controllers por deployment).
  Exigiria um eixo de composição que o desenho não tem — hoje se compõe contexto inteiro. Seria
  uma camada nova para resolver o que mover uma peça para `shared` já resolve.
- **Um client só, com duas baseURLs.** Nada impediria chamar um endpoint local contra a nuvem.
  Com dois clients, a chamada errada **não compila** — a mesma filosofia de tornar a combinação
  incoerente inexprimível em vez de detectável.
- **Cache de sessão com TTL curto** ou **validação por request**. O primeiro quebra o uso offline
  do desktop e cria duas regras diferentes para a mesma pergunta; o segundo amarra o
  `MailboxDispatcher` (que consulta a porta a cada 250ms) à latência da nuvem — motivo documentado
  de `isEntitled()` ser síncrono e cache-first.

## Consequências

**Boas, e maiores do que a mudança pede:**

- **O problema das duas famílias de banco encolhe de três contextos para UM.** Antes, o conjunto
  duplo era `auth` + `owner` + `shared`. Com `auth` e `owner` indo inteiros para a nuvem, sobra
  **`shared`** — e só ele.

  `shared` é genuinamente dual, e não há como fugir: é o contexto raiz, e os dois perfis precisam
  de migrações, outbox, eventos de domínio, idempotência e health. Medido em
  `shared/registry.ts`, os tokens dependentes de família são exatamente
  `DrizzleDatabaseDriver` (→ `FileLibsqlDriver`), `DomainEventRepository`, `OutboxDispatcher` e
  `IdempotencyGuard`.

  **Isso é uma boa notícia de duas formas.** Primeiro, um contexto dual é um problema de tamanho
  administrável, ao contrário de três. Segundo, e mais importante: os quatro tokens duais de
  `shared` são **exatamente** o que a suíte de conformidade do template certifica
  (`core/src/db/conformance/outbox-conformance.ts` + `idempotency-conformance.ts`, com o
  `violator.conformance` provando que a suíte sabe reprovar). O "contrato de admissão de família"
  do template deixa de ser analogia e passa a ser a ferramenta certa para o único lugar do codm que
  precisa dela.
- **O acoplamento local é ao seam, não ao dado.** Medido: fora de `auth/`, o único arquivo que
  importa repositório de auth é `owner/services/DrizzleOwnerDirectory.ts` — e `owner` também vai
  para a nuvem. Todo o resto (`ui`, `workspace`, …) importa apenas `OperatorMiddleware`. O BFF
  local não lê nenhuma tabela de usuário: `GetOperatorIdentity` tira nome e foto do **canal
  conectado** (*"BORROWED from the connected channel"*), e `GetMyAccount` é stub. A previsão do
  docblock do middleware — "o resto do código nunca aprende que o eixo colapsou" — se confirma.

**Custos, ditos explicitamente:**

- **O falseador (c) do contrato de reconciliação morre, e é substituído por quatro testemunhas.**
  "O mesmo e2e do `owner` roda nas DUAS composições" perde o sentido, porque `owner` passa a
  existir em uma só. O que prova o sistema agora:

  1. **Conformidade nas duas famílias** — a suíte do template roda contra `shared` em pg **e** em
     libsql: mesma suíte, dois harnesses, sem `if` e sem fixture condicional. É a substituta
     direta do (c) e é mais forte, porque cobre exatamente os 4 tokens duais e já vem com um
     `violator.conformance` provando que a suíte sabe reprovar.
  2. **Local sem token não monta** — numa instalação sem sessão, o daemon serve só a superfície de
     login. Falseador: se qualquer endpoint local responder sem token, a fronteira vazou.
  3. **`ownerId` vem da nuvem** — um recurso criado localmente carrega um `ownerId` emitido pela
     nuvem, não cunhado na máquina. Falseador: adulterar o `ownerId` local e o recurso passar a ser
     rejeitado. Esta é a testemunha do defeito que originou todo este ADR.
  4. **Perfil cloud não serve o local** — a nuvem sobe com `auth`+`owner`+`shared` e 404 nos outros
     sete. Continua sendo a capacidade (i) do contrato, agora barata: contexto não montado nem
     carrega.
- **O pipeline da SDK ganha um eixo.** Hoje `packages/client/lib/discover.ts` é chaveado por
  *pasta de serviço* (`packages/api/<service>` → 1 spec). Dois clients exigem que o **perfil** vire
  eixo **declarado** ali — não inferido de nome de arquivo, conforme a regra "contrato antes de
  implementação" do `CLAUDE.md`.
- **Identidade herda a disciplina de cache do entitlement.** O middleware novo não pode fazer
  round-trip por request; precisa ser cache-first como o `isEntitled()`.
- **Login obrigatório, uma vez.** Numa instalação nunca logada não há token, logo não há `ownerId`,
  logo não há o que escopar: o daemon serve **apenas a superfície de login**. O primeiro login
  exige rede; a partir dele a sessão cacheada vale indefinidamente offline. A regra cabe numa
  frase: *"você precisa estar online uma vez"*.

  Isso é uma escalada real sobre o comportamento atual — hoje `isEntitled()` gateia **uma única
  coisa**, o `DrizzleMailboxDispatcher.claimNext` (agentes não rodam), e todo o resto do app
  funciona sem login. Depois desta decisão, sem sessão não funciona nada além de logar.

  Consequência de produto assumida: **não existe experimentar o codm antes de criar conta.** A
  alternativa (Owner provisório local, reassociado no login) foi descartada por reintroduzir um
  `ownerId` cunhado localmente e por transformar o login numa migração de dados — reconciliação
  disfarçada, que a decisão 3 recusa.

---

## Emenda 1 (2026-08-15) — a identidade deixa de ser cacheada

**Decidido pelo founder.** Reverte a decisão *"a sessão resolvida é cacheada em disco, e o cache
vale indefinidamente offline"* e a exigência derivada, registrada em Consequências, de que *"o
middleware novo não pode fazer round-trip por request; precisa ser cache-first como o
`isEntitled()`"*.

### Por que

Três defeitos vieram do cache, e nenhum deles era visível quando a decisão foi tomada:

1. **Duas autoridades sobre identidade.** A nuvem respondia pelo better-auth; o daemon respondia
   pelo arquivo. Podiam discordar por até uma hora, e nesse intervalo a do disco vencia.
2. **O `ownerId` voltava a ser local.** Este ADR existe para apagar identidade cunhada na máquina.
   O cache a recolocava num arquivo que quem tem o disco edita — a mesma classe de defeito, um
   nível abaixo. Que a revalidação corrigisse depois não muda o que valia enquanto isso.
3. **Um deadlock de bootstrap, medido.** O daemon só recebia token por
   `POST /v1/session/cloud-token`, e aquele controller era gateado pelo `CloudSessionMiddleware`,
   que exigia a identidade cacheada — que só existe depois do token. Numa instalação nova a porta
   que entrega a credencial exigia a credencial, respondia 401, e o console **engolia** o erro (o
   push é best-effort de propósito). O daemon nunca era destravado, e o `MailboxDispatcher` ficava
   parado para sempre.

O terceiro é o que torna a emenda não-opcional: o desenho anterior não conseguia completar um
primeiro login.

### O que passa a valer

- **A identidade é perguntada à nuvem** (`GET /v1/session`, pela classe `Client` do SDK), a cada
  requisição, com uma janela de **coalescência de 5s em memória** — que existe para colapsar a
  rajada paralela de uma tela numa chamada, e não para responder offline. Ela não guarda `ownerId`
  em disco, morre com o processo, e some quando a nuvem recusa a credencial.
- **O entitlement do trabalho de fundo** (`isEntitled()`, consultado pelo `drainLoop` a cada
  250ms–2s) usa a MESMA pergunta, memoizada por **60s**. A cadência é de máquina, não humana.
- **Em disco sobra a credencial, e nada sobre quem ela é.**
- **A porta de login perde o gate.** `SetCloudTokenController` fica sem middleware, como `Health` —
  a porta que entrega a credencial não pode exigi-la.
- **Falha de rede ≠ 401.** `identity()` propaga a causa; só um 401/403 revoga. O `isEntitled()`
  mantém o último veredito conhecido, porque derrubar turnos enfileirados por um soluço de rede
  trocaria uma falha de conectividade por trabalho perdido.

### O custo, aceito explicitamente

Um round-trip à nuvem por requisição (coalescido), e **um daemon que não serve offline**. A
alternativa *"validação por request"*, descartada no texto original por amarrar o dispatcher à
latência da nuvem, volta — e aquela objeção é respondida pela janela de 60s do gate de fundo, que
não existia quando ela foi escrita.

### Testemunhas

- `CloudSession.test.ts` — "o que vai para o disco é só a credencial" (falsificador: reintroduzir
  `identity` no `CachedState`); "a janela COALESCE a rajada"; "um login novo fura a janela";
  "erro de REDE propaga".
- `tests/architecture/cloud-identity.test.ts` — **IDN-04** trocou de regra: guardava *"`identity()`
  é síncrona"*, hoje guarda *"nuvem inalcançável não é 401"*.
