# Idioma do stop no desktop — Design Spec

**Date:** 2026-08-27
**Status:** Approved
**Bounded Context:** cross-context: `thread`, `auth`, `shared`
**Kind:** bug
**Story Points:** 5 — uma correção de escopo léxico em `RaiseStop` (que sozinha destrava o desktop) mais um campo aditivo no `SessionSchema`, que é output de controller e portanto toca a SDK; sem migração local, sem contrato TypeSpec novo.

## Context

Um Stop é o mecanismo de "precisa de você": o agente para, o operador vê um card no console e, para alguns tipos, recebe um aviso no WhatsApp. Quem grava a linha é `thread/usecases/RaiseStop.ts`, acionado pelo handler externo `thread/handlers/RecordStopFromExecution.ts` a partir do integration event `thread.stop_raised`.

Antes de montar o Stop, `RaiseStop.ts:114` resolve a tenancy do dono para obter o idioma:

```ts
const tenancy = await this.owners.getOwner(thread.ownerId, tx)
const language = tenancy?.language
```

Esse `language` alimenta exatamente dois pontos: o título genérico (`RaiseStop.ts:122`, `THREAD_MESSAGES.stopTitle`) e o aviso enviado ao canal (`RaiseStop.ts:129`, `THREAD_MESSAGES.stopChannelNotice`). O docblock de `OwnerTenancy.language` diz para que ele existe: *"para as superfícies que o FRONTEND não traduz — o canal, onde quem renderiza é o WhatsApp e nenhum `t()` roda."* O card do console é traduzido pelo frontend com `t()` e não precisa dele.

O `OwnerDirectory` é bindado pelo registry do contexto `owner` (`owner/registry.ts:11`), e esse contexto é **cloud-only** por decisão declarada em `owner/context.ts`: *"tenancy emitida na máquina é tenancy editável por quem tem o disco"* (ADR 0001). O contexto `thread`, que consome o token, é **local** (`thread/context.ts`).

`CloudSession` (`shared/services/CloudSession/`) é o oposto: mora em `shared`, é bindado em `shared/registry.ts` e **está disponível no desktop** — é ele que hoje entrega a identidade da nuvem ao daemon, lendo/renovando o `cloud-session.json` no `CODM_DATA_DIR`. Seu `identity()` devolve um `Session` (`shared/schemas/SessionSchema.ts`) com `user{id,email,name,emailVerified}` e `session{id,userId,expiresAt,ownerId}`. O `ownerId` chega ali pelo `additionalFields` do better-auth (`activeOwnerId`), mapeado em `auth/middlewares/AuthAccountMiddleware.ts:59,84`.

## Problem

1. **Nenhum Stop é gravado no desktop, desde 10/08/2026.** No perfil local o contexto `owner` não monta, então o token `OwnerDirectory` nunca é bindado e o tsyringe constrói a **classe abstrata** — um objeto sem métodos. `RaiseStop.ts:114` estoura `TypeError: this.owners.getOwner is not a function`. O modo de falha está documentado em `auth/registry.ts:56`, que o contorna com uma factory que adia a resolução; `RaiseStop` injeta o token direto no construtor e não tem esse remédio.

2. **A falha é silenciosa por construção.** `RecordStopFromExecution` só engole quatro `BaseError` nomeados; um `TypeError` é relançado, o outbox retenta cinco vezes e dead-letta o evento — carimbando `processed_at`. Quem procura problemas filtrando por `processed_at IS NULL` não encontra nada. A evidência fica só em `last_error`. Medido no banco de produção: os dois `integration.thread.stop_raised` de 26/08 (19:19 e 19:22) têm `attempts = 5` e esse `TypeError` gravado.

3. **A leitura que quebra tudo é descartada no caminho mais comum.** Para `StopKind.HUMAN_REQUESTED`, `NOTIFIES_ON_CHANNEL` é `false` (`thread/utils/StopChannelNotice.ts:22`), então `stopChannelNotice` nunca roda; e `RecordStopFromExecution` preenche o `title` com o `detail` do agente, então o `??` de `RaiseStop.ts:122` nunca avalia `stopTitle`. O `language` é resolvido e jogado fora. `HUMAN_REQUESTED` é o kind que `AskOperator` levanta, que `TransitionIssueStatus` com `NEEDS_INPUT` levanta e que `ReconcileStalledIssues` levanta — os três caminhos que importam no desktop.

4. **Para os kinds que falam com o canal, o idioma é necessário e não tem de onde vir.** `SERVER_ERROR`, `AUTH_REQUIRED` e `BLOCKED_BY_CLASSIFICATION` enviam aviso no WhatsApp, onde nenhum `t()` roda. No desktop o WhatsApp existe; a fonte de idioma é que não.

## Goal

O card de "precisa de você" volta a aparecer no desktop, e o aviso que vai ao WhatsApp volta a sair no idioma do responsável — sem que o desktop passe a ser autoridade sobre tenancy, que é o que o `placement` cloud-only existe para impedir.

## Decisions

1. **O idioma passa a ser resolvido dentro dos ramos que o consomem, não no topo de `RaiseStop.handle`.** Hoje a resolução é eager e incondicional; passa a acontecer só quando o título genérico for realmente necessário (`input.title` ausente) ou quando o kind notificar o canal. Isso é o que torna `HUMAN_REQUESTED` independente da resolução — e essa metade, sozinha, já destrava os três caminhos que importam no desktop.

2. **A fonte do idioma para o `thread` passa a ser `CloudSession.identity()`, não `OwnerDirectory`.** A escolha é de direção, não de conveniência: `CloudSession` mora em `shared`, já está bindado no perfil local, e mantém a **nuvem como única autoridade sobre identidade** — a mesma direção do ADR 0001. Bindar um `OwnerDirectory` local foi considerado e rejeitado: poria leitura de tenancy no disco do usuário, que é exatamente o que `owner/context.ts` recusa.

3. **`SessionSchema` ganha `language` no bloco `user`, opcional.** Ele viaja pelo mesmo trilho que `session.ownerId` já usa — `additionalFields` do better-auth, mapeado em `AuthAccountMiddleware`. Opcional porque uma sessão emitida antes desta mudança não o carrega, e porque `identity()` pode devolver `null` (sem nuvem configurada, offline, sessão revogada).

4. **Ausência de idioma cai em `DEFAULT_LANGUAGE`, sem ramificação.** `shared/i18n/messages.ts:23` já define `PT_BR` como default e o catálogo já trata `undefined`. Nenhum `if` novo sobre idioma entra em `RaiseStop` — o valor ausente já tem semântica.

5. **`RaiseStop` deixa de depender de `OwnerDirectory`.** Com o idioma vindo de outra porta, a injeção sai do construtor. Isso remove do contexto `thread` (local) a dependência de um token que só existe na nuvem — a causa estrutural do Problema 1, e não apenas o seu sintoma.

6. **Nenhuma mudança no comportamento da nuvem.** Lá o contexto `owner` monta e `OwnerDirectory` resolve normalmente; a informação passa a chegar por outra porta, com o mesmo valor. Os testes existentes de `RaiseStop` que asseguram título e aviso traduzidos continuam sendo o contrato.

## User Stories

- **Story 1:** Como operador no desktop, quero ver o card de "precisa de você" quando o agente para, para saber que ele espera por mim.
  - Dado um agente que chama `AskOperator` no desktop, quando o stop é levantado, então a linha existe em `stops` e o card aparece.
  - Dado o mesmo cenário sem nuvem configurada, quando o stop é levantado, então a linha existe do mesmo jeito — `HUMAN_REQUESTED` não consulta idioma.

- **Story 2:** Como operador, quero que o aviso no WhatsApp chegue no meu idioma, porque o WhatsApp não traduz nada.
  - Dado um `SERVER_ERROR` numa sessão cuja identidade traz `language`, quando o aviso é enviado, então ele sai nesse idioma.
  - Dado o mesmo `SERVER_ERROR` com o daemon offline, quando o aviso é enviado, então ele sai em `DEFAULT_LANGUAGE` e o stop é gravado normalmente.

- **Story 3:** Como desenvolvedor investigando um stop que não apareceu, quero que a falha não se esconda atrás de um `processed_at` carimbado, para não precisar saber de antemão que devo olhar `last_error`.
  - Dado um stop que falha por erro não sancionado, quando o outbox esgota as tentativas, então há um log com o erro e o `stopId`.

## Acceptance Criteria

- [ ] AC-1: `RaiseStop` não injeta `OwnerDirectory` — o token não aparece no seu construtor.
- [ ] AC-2: Um stop `HUMAN_REQUESTED` é gravado sem que nenhuma resolução de idioma aconteça (nem `CloudSession.identity()`, nem `OwnerDirectory`), verificável por um dublê que falha se chamado.
- [ ] AC-3: Um stop `HUMAN_REQUESTED` é gravado com sucesso num container montado **sem** o contexto `owner` — a condição exata do desktop, hoje impossível.
- [ ] AC-4: Um stop de kind que notifica o canal resolve o idioma via `CloudSession.identity()` e o aviso sai nesse idioma.
- [ ] AC-5: Com `identity()` devolvendo `null`, um stop de kind que notifica é gravado e o aviso sai em `DEFAULT_LANGUAGE`.
- [ ] AC-6: `SessionSchema` aceita `user.language` ausente sem erro de parse, e uma sessão que o traz o expõe em `identity()`.
- [ ] AC-7: O comportamento na nuvem não regride: os testes existentes de título e aviso traduzidos de `RaiseStop` continuam verdes.
- [ ] AC-8: Um erro não sancionado em `RecordStopFromExecution` produz um log com o erro e o `stopId` antes de ser relançado.

## Fora de escopo

**Emitir `language` do lado da nuvem.** Esta spec faz o campo viajar e ser consumido; popular o `additionalField` a partir de `authentication_user_profiles.language` é trabalho no serviço cloud e tem seu próprio ciclo. Até lá, `identity()` devolve `user.language` ausente e tudo cai em `DEFAULT_LANGUAGE` — que é o comportamento de hoje no desktop, só que agora com o stop sendo gravado.

**Cache de `identity()`.** A chamada é um round-trip por decisão deliberada: `FileCloudSession` teve o cache de identidade removido de propósito, porque *"fazia do arquivo uma segunda autoridade sobre identidade por até uma hora"*. Com a Decisão 1, só os kinds que notificam o canal chamam — eventos raros, já num caminho degradado. Se a medição mostrar custo, a janela se discute separadamente, com o mesmo cuidado que `isEntitled()` recebeu.

## Riscos & Migração

**O `SessionSchema` é output do controller `GetSession`** (`auth/controllers/GetSession.ts`), então a mudança atravessa `bun sdk` e aparece na SDK do cliente. É **aditiva e opcional**, portanto compatível com consumidores existentes — mas exige o `bun sdk` no mesmo PR e um olhar no diff de `packages/client/dist/`.

**Sessões já emitidas não carregam o campo.** Por isso ele é opcional e por isso o fallback não é um caminho de erro: é o caminho normal até a nuvem passar a emitir.

**A correção não é observável pelos testes atuais.** Nenhum teste monta um container sem o contexto `owner`, que é a condição do desktop — foi por isso que o defeito passou. O AC-3 existe para fechar essa lacuna especificamente, e é o teste que teria pego o bug original.
