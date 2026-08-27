# Idioma do stop no desktop — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** O card de "precisa de você" volta a aparecer no desktop, e o aviso que vai ao WhatsApp volta a sair no idioma do responsável — sem que o desktop passe a ser autoridade sobre tenancy.

**Architecture:** `RaiseStop` deixa de injetar `OwnerDirectory` (token que só é bindado pelo contexto `owner`, cloud-only, e que no desktop faz o tsyringe construir a classe abstrata). O idioma passa a vir de `CloudSession.identity()` — porta que mora em `shared`, já bindada no perfil local — e passa a ser resolvido **sob demanda**, só quando o título genérico ou o aviso ao canal forem de fato usados. Como `HUMAN_REQUESTED` não usa nenhum dos dois, os três caminhos que importam no desktop param de tocar qualquer resolução de identidade.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, Zod

**Spec:** .specs/2026-08-27-idioma-do-stop-no-desktop-design.md
**Tasks:** 3
**Estimated minutes:** 75

---

## Ordenação

Sem `/task-breakdown`: o plano toca dois contextos (`thread`, `shared`) e cinco arquivos — abaixo do limiar que torna o overlay de quatro fases útil. Topo-sort inline:

- **T1** e **T3** são independentes entre si — podem rodar em paralelo.
- **T2** (Contract Lock) depende de T1, porque só faz sentido regenerar depois que o schema mudou.

Caminho crítico: `T1 → T2`.

---

## Task T1: Um stop é gravado no desktop, e o aviso ao canal sai no idioma da sessão

**Files to write:**
- Modify: `packages/api/typescript/src/shared/schemas/SessionSchema.ts` — adiciona `user.language` opcional
- Modify: `packages/api/typescript/src/thread/usecases/RaiseStop.ts` — remove `OwnerDirectory`; idioma resolvido sob demanda via `CloudSession`
- Test: `packages/api/typescript/src/thread/usecases/RaiseStop.test.ts` — adiciona os casos de AC-1..AC-7

**Files to read:**
- `packages/api/typescript/src/shared/services/CloudSession/CloudSession.ts`
- `packages/api/typescript/src/shared/services/CloudSession/MockCloudSession.ts`
- `packages/api/typescript/src/thread/utils/StopChannelNotice.ts`
- `packages/api/typescript/src/shared/i18n/messages.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /schema, /test
**Depends on:** (none)
**Consumes (frozen):** `CloudSession` (classe abstrata) e seu método `identity(): Promise<Session | null>` de `@shared/services/CloudSession`; `MockCloudSession.setIdentity(session)` e as constantes `MOCK_CLOUD_OWNER_ID` / `MOCK_CLOUD_USER_ID` / `MOCK_CLOUD_SESSION_ID` do mesmo módulo; `Session` de `@shared/schemas`; `Language` de `@codm/contracts-typescript/wire/enums`; `NOTIFIES_ON_CHANNEL` de `../utils/StopChannelNotice`; `THREAD_MESSAGES.stopTitle(language, { kind })` e `THREAD_MESSAGES.stopChannelNotice(language, { kind, detail })` de `../i18n/messages`, ambos aceitando `Language | null | undefined` como primeiro argumento; `StopKind` de `@codm/contracts-typescript/wire/enums`.
**Scope fence:** LEFT — o schema da sessão, o `RaiseStop` e seu teste. OUT — `RecordStopFromExecution` (Task T3), a regeneração do SDK (Task T2), e **o lado da nuvem**: fazer o better-auth emitir `user.language` está Fora de Escopo na spec e NÃO deve ser tentado aqui. Não toque em `AuthAccountMiddleware`: ele faz `SessionSchema.extend({session: …})` e o bloco `user` passa intacto, então nada é necessário lá. Não crie binding local de `OwnerDirectory`.
**Gate:** `cd packages/api/typescript && bun test src/thread/usecases/RaiseStop.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T1.1 — Adicionar `language` ao schema da sessão

Modify `packages/api/typescript/src/shared/schemas/SessionSchema.ts`: dentro do objeto `user`, após `emailVerified`, adicione o campo

```typescript
		/**
		 * O idioma do responsável — para as superfícies que o FRONTEND não traduz, o canal, onde quem
		 * renderiza é o WhatsApp e nenhum `t()` roda.
		 *
		 * OPCIONAL, e por dois motivos independentes: uma sessão emitida antes deste campo não o carrega,
		 * e `CloudSession.identity()` devolve `null` inteiro quando não há nuvem configurada, o daemon
		 * está offline ou a sessão foi revogada. A ausência já tem semântica — `resolveLanguage` colapsa
		 * em `DEFAULT_LANGUAGE` —, então nenhum consumidor precisa ramificar.
		 */
		language: z.enum(Language).optional(),
```

E adicione o import de `Language` no topo do arquivo, a partir de `@codm/contracts-typescript/wire/enums`.

### Step T1.2 — Escrever os testes que falham

Adicione ao `describe` de `packages/api/typescript/src/thread/usecases/RaiseStop.test.ts`. Leia o arquivo antes: reaproveite o `beforeAll`/`beforeEach`/`afterAll` e os helpers `given*` que ele já usa, e siga o mesmo `ownerId` que os casos existentes passam — **não** introduza o literal `'integration-tenant'`, que não é UUID e faz as entidades lançarem `INVALID_ENTITY`.

```typescript
	it('AC-1/AC-3: grava um stop HUMAN_REQUESTED sem o contexto `owner` montado', async () => {
		// A condição EXATA do desktop: `owner` é cloud-only, então `OwnerDirectory` não tem binding.
		// Antes desta mudança o tsyringe construía a classe abstrata e `RaiseStop` estourava
		// `TypeError: this.owners.getOwner is not a function` — silenciosamente, porque o handler
		// relança e o outbox dead-letta depois de cinco tentativas.
		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const stopId = uuidv7()

		await testBed.resolve(RaiseStop).execute({
			stopId,
			threadId: thread.id.value,
			kind: StopKind.HUMAN_REQUESTED,
			title: 'o agente pediu ajuda',
			detail: 'o agente pediu ajuda',
		})

		const stop = await testBed.resolve(ThreadRepository).findStop(stopId)
		expect(stop?.stopId).toBe(stopId)
		expect(stop?.title).toBe('o agente pediu ajuda')
	})

	it('AC-2: um stop HUMAN_REQUESTED não resolve idioma nenhum', async () => {
		// O dublê FALHA se chamado. `NOTIFIES_ON_CHANNEL[HUMAN_REQUESTED]` é false e o título já vem
		// pronto, então nem `stopChannelNotice` nem `stopTitle` rodam — e o idioma que alimentaria os
		// dois não tem por que ser buscado.
		const cloud = testBed.resolve(CloudSession) as MockCloudSession
		cloud.setFailure(new Error('identity() não deveria ser chamado para HUMAN_REQUESTED'))

		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const stopId = uuidv7()

		await testBed.resolve(RaiseStop).execute({
			stopId,
			threadId: thread.id.value,
			kind: StopKind.HUMAN_REQUESTED,
			title: 'pergunta do agente',
			detail: 'pergunta do agente',
		})

		expect((await testBed.resolve(ThreadRepository).findStop(stopId))?.stopId).toBe(stopId)
		cloud.setFailure(undefined)
	})

	it('AC-4: um kind que notifica o canal usa o idioma da sessão', async () => {
		const cloud = testBed.resolve(CloudSession) as MockCloudSession
		cloud.setIdentity({
			user: { id: MOCK_CLOUD_USER_ID, email: 'operator@example.test', name: 'Test Operator', emailVerified: true, language: Language.EN_US },
			session: { id: MOCK_CLOUD_SESSION_ID, userId: MOCK_CLOUD_USER_ID, expiresAt: new Date('2999-12-31T00:00:00.000Z'), ownerId: MOCK_CLOUD_OWNER_ID },
		})

		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const stopId = uuidv7()

		await testBed.resolve(RaiseStop).execute({
			stopId,
			threadId: thread.id.value,
			kind: StopKind.SERVER_ERROR,
			detail: 'upstream 503',
		})

		const stop = await testBed.resolve(ThreadRepository).findStop(stopId)
		expect(stop?.title).toBe(THREAD_MESSAGES.stopTitle(Language.EN_US, { kind: StopKind.SERVER_ERROR }))
	})

	it('AC-5: sem identidade, o stop é gravado e o texto cai em DEFAULT_LANGUAGE', async () => {
		const cloud = testBed.resolve(CloudSession) as MockCloudSession
		cloud.setIdentity(null)

		const thread = await givenThread(testBed, { ownerId: MOCK_CLOUD_OWNER_ID })
		const stopId = uuidv7()

		await testBed.resolve(RaiseStop).execute({
			stopId,
			threadId: thread.id.value,
			kind: StopKind.SERVER_ERROR,
			detail: 'upstream 503',
		})

		const stop = await testBed.resolve(ThreadRepository).findStop(stopId)
		expect(stop?.stopId).toBe(stopId)
		expect(stop?.title).toBe(THREAD_MESSAGES.stopTitle(DEFAULT_LANGUAGE, { kind: StopKind.SERVER_ERROR }))
	})

	it('AC-6: uma sessão sem `language` faz parse e o campo fica ausente', () => {
		const parsed = SessionSchema.parse({
			user: { id: MOCK_CLOUD_USER_ID, email: 'operator@example.test', name: null, emailVerified: true },
			session: { id: MOCK_CLOUD_SESSION_ID, userId: MOCK_CLOUD_USER_ID, expiresAt: new Date('2999-12-31T00:00:00.000Z'), ownerId: MOCK_CLOUD_OWNER_ID },
		})
		expect(parsed.user.language).toBeUndefined()

		const withLanguage = SessionSchema.parse({
			user: { id: MOCK_CLOUD_USER_ID, email: 'operator@example.test', name: null, emailVerified: true, language: Language.EN_US },
			session: { id: MOCK_CLOUD_SESSION_ID, userId: MOCK_CLOUD_USER_ID, expiresAt: new Date('2999-12-31T00:00:00.000Z'), ownerId: MOCK_CLOUD_OWNER_ID },
		})
		expect(withLanguage.user.language).toBe(Language.EN_US)
	})
```

Imports a garantir no topo do arquivo de teste: `uuidv7` de `uuidv7`; `StopKind` e `Language` de `@codm/contracts-typescript/wire/enums`; `CloudSession`, `MockCloudSession`, `MOCK_CLOUD_OWNER_ID`, `MOCK_CLOUD_USER_ID`, `MOCK_CLOUD_SESSION_ID` de `@shared/services/CloudSession`; `SessionSchema` de `@shared/schemas`; `THREAD_MESSAGES` de `../i18n/messages`; `DEFAULT_LANGUAGE` de `@shared/i18n/messages`; `ThreadRepository` de `../repositories/ThreadRepository`; `RaiseStop` de `./RaiseStop`.

O binding de `CloudSession` nos modos `mock` e `integration` é `MockCloudSession` (`shared/registry.ts:323`), então o cast no `testBed.resolve` é seguro nesses ambientes.

**AC-3 depende de o teste rodar num container sem o contexto `owner`.** Verifique como o `TestBed` monta contextos antes de escrever o caso: se a suíte já resolve `RaiseStop` sem montar `owner`, o AC-1/AC-3 acima já é a prova e nada mais é preciso. Se o harness montar todos os contextos, o caso ainda vale (o `RaiseStop` deixa de pedir o token, então o binding não é mais consultado) — mas registre isso em DONE_WITH_CONCERNS, porque a prova fica mais fraca do que o AC-3 pede.

### Step T1.3 — Rodar os testes e ver falhar

Run: `cd packages/api/typescript && bun test src/thread/usecases/RaiseStop.test.ts`
Expected: FAIL — `language` não existe em `SessionSchema` até o Step T1.1 ser aplicado, e os casos AC-2/AC-4/AC-5 falham enquanto `RaiseStop` ainda resolve o idioma pelo `OwnerDirectory`.

### Step T1.4 — Proposed file (o executor escreve isto sobre o arquivo atual)

Substitua **apenas** o construtor e o corpo de `handle` em `packages/api/typescript/src/thread/usecases/RaiseStop.ts`. Todo o resto do arquivo — imports não citados, schemas, o docblock da classe — permanece.

O construtor perde `OwnerDirectory` e ganha `CloudSession`:

```typescript
	constructor(
		private readonly threads: ThreadRepository,
		private readonly issues: IssueRepository,
		private readonly policy: StopPolicyConfigRepository,
		private readonly session: CloudSession,
		private readonly commands: CommandQueue,
	) {
		super()
	}
```

E o bloco que resolvia o idioma (hoje entre o guard de política e o `withTransaction`) passa a ser:

```typescript
		// O IDIOMA SÓ É BUSCADO QUANDO ALGUÉM VAI USÁ-LO — e essa é a correção, não uma otimização.
		//
		// Ele alimenta exatamente dois textos: o título genérico (só quando o chamador não trouxe um) e o
		// aviso que vai ao canal (só para os kinds que notificam). Para `HUMAN_REQUESTED` nenhum dos dois
		// acontece: `NOTIFIES_ON_CHANNEL` é false e `RecordStopFromExecution` já preenche o título com o
		// `detail` do agente. A resolução eager que existia aqui era, nesse caminho, trabalho jogado fora.
		//
		// E jogado fora de um jeito caro: ela vinha do `OwnerDirectory`, bindado pelo registry do contexto
		// `owner`, que é CLOUD-ONLY. No desktop o token não tem binding, o tsyringe construía a classe
		// ABSTRATA — um objeto sem métodos — e este método estourava `TypeError` antes de gravar coisa
		// alguma. Nenhum Stop foi gravado no desktop desde 2026-08-10 por causa disso.
		//
		// A fonte agora é `CloudSession`, que mora em `shared` e É bindada no perfil local. A direção do
		// ADR 0001 fica intacta: a nuvem continua sendo a única autoridade sobre identidade — o desktop
		// pergunta, não decide.
		const needsLanguage = input.title === undefined || NOTIFIES_ON_CHANNEL[input.kind]
		const language = needsLanguage ? (await this.session.identity())?.user.language : undefined
```

O `withTransaction` abaixo permanece exatamente como está: `input.title ?? THREAD_MESSAGES.stopTitle(language, { kind: input.kind })` e `THREAD_MESSAGES.stopChannelNotice(language, { kind: input.kind, detail: input.detail })` continuam recebendo `language`, que agora é `undefined` precisamente nos casos em que nenhum dos dois é avaliado.

Ajuste os imports: remova `OwnerDirectory` e adicione `CloudSession` de `@shared/services/CloudSession`. Se `NOTIFIES_ON_CHANNEL` ainda não estiver importado no topo, ele já está — é usado dentro do `withTransaction`.

### Step T1.5 — Rodar os testes e ver passar

Run: `cd packages/api/typescript && bun test src/thread/usecases/RaiseStop.test.ts`
Expected: PASS — os casos novos e **todos os pré-existentes**. Os casos antigos que asseguram título e aviso traduzidos são o contrato do AC-7: se algum deles quebrar, o comportamento na nuvem regrediu e a mudança está errada.

### Step T1.6 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors. Se `bun tsc` apontar outro consumidor de `RaiseStop` construído à mão com cinco argumentos posicionais, corrija-o para resolver pelo container.

### Step T1.7 — Commit

```bash
git add packages/api/typescript/src/shared/schemas/SessionSchema.ts \
        packages/api/typescript/src/thread/usecases/RaiseStop.ts \
        packages/api/typescript/src/thread/usecases/RaiseStop.test.ts
git commit -m "fix(thread): stop deixa de depender de contexto cloud-only e lê idioma da sessão (Task T1)"
```

---

## Task T2: Contract Lock — SDK regen

**Files to write:**
- Regen: `packages/api/typescript/src/api/openapi.json`
- Regen: `packages/client/dist/**`

**Files to read:**
- `packages/api/typescript/src/auth/controllers/GetSession.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T1
**Consumes (frozen):** o campo `user.language` de `SessionSchema` (`packages/api/typescript/src/shared/schemas/SessionSchema.ts`), congelado pela Task T1. `GetSessionOutputSchema` deriva de `SessionSchema` (`auth/controllers/GetSession.ts:34`), então a mudança atravessa a OpenAPI sem nenhuma edição adicional de controller.
**Scope fence:** LEFT — apenas rodar os geradores e commitar o que eles produzirem. OUT — qualquer edição manual em `openapi.json` ou em `packages/client/dist/**`; qualquer mudança de código de produção. Se o diff gerado não contiver `language`, **não conserte à mão**: reporte BLOCKED, porque significa que a Task T1 não fez o campo chegar ao schema de saída.
**Gate:** `bun tsc`

### Step T2.1 — Regenerar OpenAPI + SDK

```bash
bun emit-openapi && bun sdk
```

### Step T2.2 — Verificar que a regeneração produziu o campo

```bash
git diff --stat packages/client/dist/ packages/api/typescript/src/api/openapi.json
git diff packages/api/typescript/src/api/openapi.json | grep -i language | head
```

Expected: `openapi.json` alterado, arquivos sob `packages/client/dist/` alterados, e o `grep` mostrando `language` entrando no componente de sessão. Campo **aditivo e opcional** — nenhum consumidor existente quebra.

### Step T2.3 — Type-check após a regeneração

Run: `bun tsc`
Expected: 0 errors em todos os workspaces.

### Step T2.4 — Commit

```bash
git add packages/api/typescript/src/api/openapi.json packages/client/dist/
git commit -m "chore(sdk): regenera openapi+sdk para user.language na sessão (Task T2)"
```

---

## Task T3: Um stop que falha por erro não sancionado deixa rastro

**Files to write:**
- Modify: `packages/api/typescript/src/thread/handlers/RecordStopFromExecution.ts` — loga antes de relançar o erro não sancionado

**Files to read:**
- `packages/api/typescript/src/agent/services/ProviderDetector/SystemProviderDetector.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /handler
**Depends on:** (none)
**Consumes (frozen):** `LoggingService` de `@codm/core-typescript`, cujo `warn` recebe `{ content: { message, ...campos } }` — **já injetado** no construtor deste handler como `private readonly logging`; `BaseError` de `@codm/core-typescript`; `ThreadStopRaisedEvent` de `@codm/contracts-typescript/wire/events`.
**Scope fence:** LEFT — uma linha de log no caminho de relançamento. OUT — NÃO mude o comportamento: os mesmos quatro códigos continuam sendo engolidos, e todo o resto continua sendo relançado para o outbox retentar. NÃO mexa na lista `swallowed`. NÃO toque em `RaiseStop` (Task T1).
**Gate:** `cd packages/api/typescript && bun test tests/flows/stop-control-plane.flow.test.ts && bun x tsc -p tsconfig.build.json --noEmit`

### Step T3.1 — Logar antes de relançar

Modify `packages/api/typescript/src/thread/handlers/RecordStopFromExecution.ts`: no bloco `catch`, o `return` que engole os quatro códigos sancionados já loga. Antes do `throw error` final, adicione

```typescript
			// O CAMINHO NÃO SANCIONADO TAMBÉM PRECISA DE RASTRO, e ele é o mais caro de investigar.
			//
			// Um erro fora da lista é relançado para o outbox retentar — e depois de esgotar as tentativas
			// a linha é dead-lettered com `processed_at` CARIMBADO. Quem procura problemas filtrando por
			// `processed_at IS NULL` não encontra nada, e a única evidência fica em `last_error`, onde
			// ninguém olha sem já suspeitar. Foi assim que um `TypeError` no `RaiseStop` manteve todos os
			// stops do desktop invisíveis por duas semanas.
			this.logging.warn({
				content: {
					message: 'stop not recorded — unsanctioned error, rethrowing for outbox retry',
					error: error instanceof Error ? error.message : String(error),
					stopId: event.payload.stopId,
					issueId: event.payload.issueId,
					threadId: event.payload.threadId,
					kind: event.payload.kind,
				},
			})
			throw error
```

### Step T3.2 — Type check + lint

Run: `bun tsc && bun lint`
Expected: 0 errors

### Step T3.3 — Rodar os testes tocados

Run: `cd packages/api/typescript && bun test tests/flows/stop-control-plane.flow.test.ts src/thread/usecases/RaiseStop.test.ts`
Expected: PASS — nenhum comportamento mudou, só o diagnóstico.

### Step T3.4 — Commit

```bash
git add packages/api/typescript/src/thread/handlers/RecordStopFromExecution.ts
git commit -m "feat(thread): erro não sancionado no stop deixa rastro antes de ser relançado (Task T3)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun run test` — todos os testes passam
- [ ] `bun contexts:check` — composição gerada em dia
- [ ] `git diff` mostra `packages/client/dist/` e `openapi.json` alterados **e commitados** (Task T2) — o `SessionSchema` é output de controller, então esquecer a regeneração deixa a SDK fora de sincronia
- [ ] AC mapping (cada AC da spec → ≥1 teste):
  - AC-1 → `src/thread/usecases/RaiseStop.test.ts:"AC-1/AC-3: grava um stop HUMAN_REQUESTED sem o contexto \`owner\` montado"` (o construtor sem `OwnerDirectory` é o que faz o caso passar; `bun tsc` é o gate estrutural)
  - AC-2 → `src/thread/usecases/RaiseStop.test.ts:"AC-2: um stop HUMAN_REQUESTED não resolve idioma nenhum"`
  - AC-3 → `src/thread/usecases/RaiseStop.test.ts:"AC-1/AC-3: grava um stop HUMAN_REQUESTED sem o contexto \`owner\` montado"`
  - AC-4 → `src/thread/usecases/RaiseStop.test.ts:"AC-4: um kind que notifica o canal usa o idioma da sessão"`
  - AC-5 → `src/thread/usecases/RaiseStop.test.ts:"AC-5: sem identidade, o stop é gravado e o texto cai em DEFAULT_LANGUAGE"`
  - AC-6 → `src/thread/usecases/RaiseStop.test.ts:"AC-6: uma sessão sem \`language\` faz parse e o campo fica ausente"`
  - AC-7 → os casos PRÉ-EXISTENTES de `src/thread/usecases/RaiseStop.test.ts` seguirem verdes (título e aviso traduzidos)
  - AC-8 → verificação no diff da Task T3 (um `warn` estruturado; o repo não tem infra de asserção sobre `LoggingService`, e criar um espião só para isto seria backdoor de teste)

## Notes

**Sem E2E.** Nada aqui atravessa HTTP ou UI. O `SessionSchema` é output de controller, mas a mudança é aditiva e opcional; o `bun tsc` pós-regeneração é o gate que prova a compatibilidade.

**Sem migração.** Nenhuma tabela muda.

**AC-8 não tem teste automatizado, e isso é escolha.** Assim como no plano anterior, o repo não tem infraestrutura de asserção sobre `LoggingService`; montar um espião só para isto significaria um backdoor no código de produção ou um teste que afirma o formato de uma string. A verificação é a leitura do diff no review de T3.

**O que este plano deliberadamente NÃO faz:** emitir `user.language` do lado da nuvem. Até o better-auth passar a incluir o campo, `identity()` devolve `user.language` ausente e tudo cai em `DEFAULT_LANGUAGE` — que é exatamente o comportamento de hoje no desktop, com a diferença de que agora o stop **é gravado**. A metade que destrava o desktop (Decisão 1) não depende da metade que restaura o idioma (Decisão 3).

**Defeito conhecido de planos anteriores, para não repetir:** `ownerId: 'integration-tenant'` não é UUID e faz `Issue.open()`/`givenThread` lançarem `INVALID_ENTITY`. Use `MOCK_CLOUD_OWNER_ID` de `@shared/services/CloudSession/MockCloudSession`, como os siblings fazem.
