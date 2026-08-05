# i18n das mensagens que saem no canal — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** Quando o agente não consegue falar, o produto fala por ele — um stop de falha vira mensagem no canal, no idioma do operador, sem depender de nenhum agent runner.

**Architecture:** O idioma viaja pela porta de kernel que já existe (`OwnerDirectory` ganha `language`, lido de `UserProfile.language` pelo `responsibleUserId`). O primeiro catálogo de contexto nasce em `thread/i18n/messages.ts` usando o mecanismo já portado em `shared/i18n`, e adota os títulos ingleses hoje hardcoded em `RecordStopFromExecution`. A notificação é enfileirada dentro da transação que `RaiseStop` já abre — mesmo padrão de `RecordOrchestratorReply`: entrada `SYSTEM` no transcript + comando durável `deliver_channel_message`. Quais kinds notificam é uma tabela `Record<StopKind, boolean>`, irmã de `RESOLUTIONS_BY_KIND`.

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, TanStack Router/Query, Zod, Tailwind

**Spec:** .specs/2026-08-04-i18n-de-mensagens-no-canal-design.md
**Tasks:** 3
**Estimated minutes:** 95

---

## Task T1: O idioma do operador chega a quem precisa emitir texto

**Files to write:**
- Modify: `packages/api/typescript/src/shared/services/OwnerDirectory/OwnerDirectory.ts` — `OwnerTenancy` ganha `language`
- Modify: `packages/api/typescript/src/shared/services/OwnerDirectory/MockOwnerDirectory.ts` — sem mudança de código além do tipo; confirmar que compila
- Modify: `packages/api/typescript/src/owner/services/DrizzleOwnerDirectory.ts` — resolve o idioma do perfil do responsável
- Test: `packages/api/typescript/src/owner/services/DrizzleOwnerDirectory.test.ts`

**Files to read:**
- `packages/api/typescript/src/auth/entities/UserProfile.ts`
- `packages/api/typescript/src/auth/repositories/UserProfileRepository/UserProfileRepository.ts`
- `packages/api/typescript/src/shared/i18n/messages.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** (none)
**Consumes (frozen):** `Language` de `@codm/contracts-typescript/wire/enums` (membros `PT_BR = "pt-BR"`, `EN_US = "en-US"`); `OwnerDirectory` / `OwnerTenancy` de `@shared/services`; `OwnerRepository.findByOwnerId(ownerId, tx?)` de `@owner/repositories`; `UserProfile.language` (um `LanguageTag`, cujo `.value` é a tag BCP-47).
**Scope fence:** DONE elsewhere — nada, é a Task raiz. OUT — o catálogo `thread/i18n` (T2), a tabela de kinds e a entrega (T3). NÃO altere `shared/i18n/messages.ts`: o mecanismo já está pronto e esta Task só o alimenta.
**Gate:** `cd packages/api/typescript && bun test src/owner/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T1.1 — Escrever o teste que falha

Crie `packages/api/typescript/src/owner/services/DrizzleOwnerDirectory.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Language } from '@codm/contracts-typescript/wire/enums'
import { OwnerDirectory } from '@shared/services'

/**
 * O idioma como TRANSPORTE: quem resolve um owner recebe o idioma junto, e nenhum chamador precisa
 * saber que ele mora num perfil de outro contexto.
 */
describe('DrizzleOwnerDirectory — o idioma viaja com a tenancy', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('devolve o idioma do perfil do usuário responsável', async () => {
		const { owner } = await givenOwnerWithProfileLanguage(testBed, 'en-US')

		const tenancy = await testBed.resolve(OwnerDirectory).getOwner(owner.id.value)

		expect(tenancy?.language).toBe(Language.EN_US)
	})

	it('devolve o idioma ausente quando o responsável nunca escolheu um', async () => {
		const { owner } = await givenOwnerWithProfileLanguage(testBed, undefined)

		const tenancy = await testBed.resolve(OwnerDirectory).getOwner(owner.id.value)

		expect(tenancy?.language).toBeUndefined()
	})

	it('não inventa idioma para um owner que não existe', async () => {
		expect(await testBed.resolve(OwnerDirectory).getOwner('019e4d24-6524-7041-9e1c-8108180cddff')).toBeNull()
	})
})
```

Escreva o helper `givenOwnerWithProfileLanguage(testBed, tag)` no mesmo arquivo: cria um user, um `UserProfile` com o `language` pedido (ou sem), e um `Owner` cujo `responsibleUserId` é esse user; devolve `{ owner }`. Reutilize os helpers já existentes em `packages/api/typescript/tests/support/given/` (`givenUser`, `givenOwner` ou equivalentes) — leia o diretório antes de montar entidades à mão.

### Step T1.2 — Rodar o teste para confirmar que falha

Run: `cd packages/api/typescript && bun test src/owner/services/DrizzleOwnerDirectory.test.ts`
Expected: FAIL — `tenancy.language` é `undefined` no primeiro caso (o campo ainda não existe)

### Step T1.3 — Proposed file: a porta ganha o campo

```typescript
// packages/api/typescript/src/shared/services/OwnerDirectory/OwnerDirectory.ts — arquivo final COMPLETO
import type { Transaction } from '@codm/core-typescript'
import type { Language, OwnerKind } from '@codm/contracts-typescript/wire/enums'

/**
 * TENANCY facts behind an ownerId — what kind of tenant it is and which user
 * answers for it. This is all the kernel knows about an owner; rich identity
 * (billing name/email/document, product profile) lives in the owning context's
 * own aggregate, read internally there.
 */
export interface OwnerTenancy {
	kind: OwnerKind
	responsibleUserId: string
	/**
	 * O idioma do responsável, para as superfícies que o FRONTEND não traduz — o canal, onde quem
	 * renderiza é o WhatsApp e nenhum `t()` roda.
	 *
	 * Viaja aqui e não é buscado no ponto de emissão de propósito: quem resolve um owner já pagou a
	 * leitura, e a alternativa seria cada emissor conhecer o perfil de outro contexto. Segue a forma do
	 * medscall, onde `OwnerIdentity.language` é o que alimenta e-mails e checkout.
	 *
	 * OPCIONAL porque o operador pode nunca ter escolhido: `resolveLanguage` (`@shared/i18n`) colapsa a
	 * ausência em `DEFAULT_LANGUAGE`, então nenhum chamador ramifica sobre idioma.
	 */
	language?: Language
}

/**
 * Kernel port for resolving the tenancy behind an `ownerId` without any context
 * reaching into another. The REAL adapter lives in the owner context
 * (`DrizzleOwnerDirectory` — owner owns the tenant aggregate) and is bound by the
 * owner registry; consumers (billing's responsible-guard, ui) depend only on
 * this abstraction. Port of the medscall@f04e8a0f owner-context design.
 */
export abstract class OwnerDirectory {
	/** Returns null when no Owner aggregate backs the ownerId. */
	abstract getOwner(ownerId: string, tx?: Transaction): Promise<OwnerTenancy | null>
}
```

### Step T1.4 — Proposed file: o adaptador resolve o idioma

```typescript
// packages/api/typescript/src/owner/services/DrizzleOwnerDirectory.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import type { Transaction } from '@codm/core-typescript'
import type { Language } from '@codm/contracts-typescript/wire/enums'
import { OwnerDirectory, type OwnerTenancy } from '@shared/services'
import { OwnerRepository } from '@owner/repositories'
import { UserProfileRepository } from '@auth/repositories'

/**
 * The canonical adapter for the kernel tenancy port: one read on the tenant
 * aggregate, zero branching — the polymorphic ownerId finally has an aggregate
 * to answer for it. Port of medscall@f04e8a0f `DrizzleOwnerDirectory`.
 *
 * ### Por que o perfil é uma segunda leitura, e não um join
 * O idioma mora no `UserProfile` do contexto `auth`, e um join atravessaria a fronteira que a porta
 * existe para preservar. Ler o perfil pelo `responsibleUserId` que o owner já aponta é a forma
 * sancionada (leitura via repositório de outro contexto), e mantém o dono de cada campo onde ele está.
 */
@injectable()
export class DrizzleOwnerDirectory extends OwnerDirectory {
	constructor(
		private owners: OwnerRepository,
		private profiles: UserProfileRepository,
	) {
		super()
	}

	async getOwner(ownerId: string, tx?: Transaction): Promise<OwnerTenancy | null> {
		const owner = await this.owners.findByOwnerId(ownerId, tx)
		if (!owner) return null
		const profile = await this.profiles.findByUserId(owner.responsibleUserId, tx)
		return { kind: owner.kind, responsibleUserId: owner.responsibleUserId, language: toLanguage(profile?.language?.value) }
	}
}

/**
 * `LanguageTag` é BCP-47 (aceita `fr-CH`), o enum `Language` ship só o que o app traduz — e os VALORES
 * do enum SÃO tags BCP-47 (`"pt-BR"`, `"en-US"`). Então não existe tabela de-para: a tag ou é um membro
 * do enum, ou não é um idioma que catálogo algum ship. Devolver `undefined` no segundo caso deixa
 * `resolveLanguage` fazer o colapso em um lugar só.
 */
function toLanguage(tag?: string): Language | undefined {
	if (!tag) return undefined
	const shipped = Object.values(Language) as string[]
	return shipped.includes(tag) ? (tag as Language) : undefined
}
```

Confirme o nome real do método de leitura em `packages/api/typescript/src/auth/repositories/UserProfileRepository/UserProfileRepository.ts` (o passo de leitura desta Task) — se ele não se chamar `findByUserId`, use o que existir, sem criar método novo.

### Step T1.5 — Rodar os testes do contexto

Run: `cd packages/api/typescript && bun test src/owner/`
Expected: PASS — os 3 testes novos passam

### Step T1.6 — Type check + lint

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` e `bun x biome check src/owner src/shared/services/OwnerDirectory`
Expected: 0 erros

### Step T1.7 — Commit

```bash
git add packages/api/typescript/src/shared/services/OwnerDirectory/ \
        packages/api/typescript/src/owner/services/DrizzleOwnerDirectory.ts \
        packages/api/typescript/src/owner/services/DrizzleOwnerDirectory.test.ts
git commit -m "feat(owner): o idioma do operador viaja com a tenancy (Task T1)"
```

---

## Task T2: O produto tem vocabulário de canal em dois idiomas

**Files to write:**
- Create: `packages/api/typescript/src/thread/i18n/messages.ts`
- Create: `packages/api/typescript/src/thread/i18n/index.ts`
- Test: `packages/api/typescript/src/thread/i18n/messages.test.ts`

**Files to read:**
- `packages/api/typescript/src/shared/i18n/messages.ts`
- `packages/api/typescript/src/thread/handlers/RecordStopFromExecution.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema, /test
**Depends on:** (none)
**Consumes (frozen):** `defineMessages` e `resolveLanguage` de `@shared/i18n` (o mecanismo já existe e não muda); `Language` (`PT_BR`, `EN_US`) e `StopKind` (`SERVER_ERROR`, `BLOCKED_BY_CLASSIFICATION`, `HUMAN_REQUESTED`, `APPROVAL_NEEDED`, `AUTH_REQUIRED`) de `@codm/contracts-typescript/wire/enums`.
**Scope fence:** DONE elsewhere — o transporte do idioma (T1). OUT — a tabela de quais kinds notificam e a entrega (T3 é dona); NÃO edite `RaiseStop.ts` nem `RecordStopFromExecution.ts` nesta Task. Você só lê o segundo para copiar as frases inglesas que já existem.
**Gate:** `cd packages/api/typescript && bun test src/thread/i18n/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T2.1 — Escrever o teste que falha

Crie `packages/api/typescript/src/thread/i18n/messages.test.ts`:

```typescript
import { describe, expect, it } from 'bun:test'
import { Language, StopKind } from '@codm/contracts-typescript/wire/enums'
import { THREAD_MESSAGES } from './messages'

describe('THREAD_MESSAGES — o vocabulário que sai no canal', () => {
	it('fala português por padrão quando o operador não escolheu idioma', () => {
		expect(THREAD_MESSAGES.stopTitle(undefined, { kind: StopKind.SERVER_ERROR })).toBe(
			'Erro do provedor — o agente esbarrou num limite ou numa indisponibilidade',
		)
	})

	it('fala inglês quando o operador escolheu inglês', () => {
		expect(THREAD_MESSAGES.stopTitle(Language.EN_US, { kind: StopKind.SERVER_ERROR })).toBe(
			'Server error — the agent hit an API limit or outage',
		)
	})

	it('colapsa um idioma que nenhum catálogo ship de volta para o padrão', () => {
		// `fr-CH` é BCP-47 válido e não é membro de `Language` — `resolveLanguage` resolve isso em um
		// lugar só, então nenhum chamador precisa ramificar.
		expect(THREAD_MESSAGES.stopTitle('fr-CH' as Language, { kind: StopKind.AUTH_REQUIRED })).toBe(
			THREAD_MESSAGES.stopTitle(Language.PT_BR, { kind: StopKind.AUTH_REQUIRED }),
		)
	})

	it('o aviso de canal carrega a nossa frase E o detalhe do provider sem tradução', () => {
		const providerDetail = "You've hit your session limit · resets 10:30pm (America/Fortaleza)"

		const notice = THREAD_MESSAGES.stopChannelNotice(Language.PT_BR, { kind: StopKind.SERVER_ERROR, detail: providerDetail })

		// A nossa metade traduz…
		expect(notice).toContain('Erro do provedor')
		// …e a do provider vai verbatim, porque é onde está a informação acionável (o horário do reset).
		expect(notice).toContain(providerDetail)
	})

	it('omite o bloco de detalhe quando o provider não mandou nenhum', () => {
		const notice = THREAD_MESSAGES.stopChannelNotice(Language.PT_BR, { kind: StopKind.AUTH_REQUIRED, detail: '' })

		expect(notice.trim().endsWith('.')).toBe(true)
	})

	it('tem título para TODOS os kinds, nos dois idiomas', () => {
		for (const kind of Object.values(StopKind)) {
			for (const language of [Language.PT_BR, Language.EN_US]) {
				expect(THREAD_MESSAGES.stopTitle(language, { kind }).length).toBeGreaterThan(0)
			}
		}
	})
})
```

### Step T2.2 — Rodar o teste para confirmar que falha

Run: `cd packages/api/typescript && bun test src/thread/i18n/messages.test.ts`
Expected: FAIL — `Cannot find module './messages'`

### Step T2.3 — Proposed file: o catálogo

```typescript
// packages/api/typescript/src/thread/i18n/messages.ts — arquivo final COMPLETO
import { Language, StopKind } from '@codm/contracts-typescript/wire/enums'
import { defineMessages } from '@shared/i18n'

/**
 * O vocabulário que o contexto `thread` diz NO CANAL — a superfície que o frontend nunca traduz,
 * porque quem renderiza é o WhatsApp e nenhum `t()` roda ali.
 *
 * Tudo que o APP renderiza continua no padrão da casa: o backend emite código/estrutura e
 * `packages/app/react/src/locales/*` traduz. Este catálogo é a exceção nomeada, não uma segunda via.
 *
 * O mecanismo vive em `@shared/i18n` e não tem vocabulário de domínio; o conteúdo vive aqui, com o
 * contexto que o emite.
 */

const STOP_TITLES_PT: Record<StopKind, string> = {
	[StopKind.SERVER_ERROR]: 'Erro do provedor — o agente esbarrou num limite ou numa indisponibilidade',
	[StopKind.BLOCKED_BY_CLASSIFICATION]: 'Resposta barrada pela classificação',
	[StopKind.HUMAN_REQUESTED]: 'Alguém pediu para falar com uma pessoa',
	[StopKind.APPROVAL_NEEDED]: 'Uma ação precisa da sua aprovação',
	[StopKind.AUTH_REQUIRED]: 'O CLI do agente precisa que você entre de novo',
}

/**
 * As frases inglesas são as MESMAS que viviam hardcoded em `RecordStopFromExecution` — este catálogo
 * as adota em vez de inventar copy nova, e só acrescenta o par em português.
 */
const STOP_TITLES_EN: Record<StopKind, string> = {
	[StopKind.SERVER_ERROR]: 'Server error — the agent hit an API limit or outage',
	[StopKind.BLOCKED_BY_CLASSIFICATION]: 'Reply blocked by classification',
	[StopKind.HUMAN_REQUESTED]: 'A participant asked for a human',
	[StopKind.APPROVAL_NEEDED]: 'An action needs your approval',
	[StopKind.AUTH_REQUIRED]: 'The agent CLI needs you to sign in again',
}

const PT_MESSAGES = {
	stopTitle: (p: { kind: StopKind }) => STOP_TITLES_PT[p.kind],
	/**
	 * O aviso que chega no celular. Duas metades com donos diferentes: a nossa frase, que traduz porque
	 * o `StopKind` é vocabulário nosso; e o `detail`, escrito pelo provider, que vai VERBATIM.
	 *
	 * Traduzir o detail exigiria classificar string de erro de terceiro — frágil por natureza e quebra
	 * em silêncio quando o provider muda o texto. E é justamente ali que mora a informação acionável:
	 * no episódio que originou esta feature, o horário em que o limite resetava estava no detail.
	 */
	stopChannelNotice: (p: { kind: StopKind; detail: string }) =>
		p.detail.length > 0 ? `${STOP_TITLES_PT[p.kind]}.\n\n${p.detail}` : `${STOP_TITLES_PT[p.kind]}.`,
}

export const THREAD_MESSAGES = defineMessages<typeof PT_MESSAGES>({
	[Language.PT_BR]: PT_MESSAGES,
	[Language.EN_US]: {
		stopTitle: p => STOP_TITLES_EN[p.kind],
		stopChannelNotice: p => (p.detail.length > 0 ? `${STOP_TITLES_EN[p.kind]}.\n\n${p.detail}` : `${STOP_TITLES_EN[p.kind]}.`),
	},
})
```

### Step T2.4 — Proposed file: o barrel

```typescript
// packages/api/typescript/src/thread/i18n/index.ts — arquivo final COMPLETO
export * from './messages'
```

### Step T2.5 — Rodar o teste para confirmar que passa

Run: `cd packages/api/typescript && bun test src/thread/i18n/messages.test.ts`
Expected: PASS — os 6 testes passam

### Step T2.6 — Type check + lint

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` e `bun x biome check src/thread/i18n`
Expected: 0 erros

### Step T2.7 — Commit

```bash
git add packages/api/typescript/src/thread/i18n/
git commit -m "feat(thread): catálogo de canal em pt-BR e en-US (Task T2)"
```

---

## Task T3: Um stop que o agente não conseguiu contar chega ao seu celular

**Files to write:**
- Create: `packages/api/typescript/src/thread/utils/StopChannelNotice.ts`
- Modify: `packages/api/typescript/src/thread/usecases/RaiseStop.ts` — resolve título pelo catálogo e enfileira o aviso na transação que já existe
- Modify: `packages/api/typescript/src/thread/handlers/RecordStopFromExecution.ts` — `STOP_TITLES` sai; o handler passa `kind` + `detail` adiante
- Test: `packages/api/typescript/src/thread/usecases/RaiseStop.test.ts`

**Files to read:**
- `packages/api/typescript/src/thread/usecases/RecordOrchestratorReply.ts`
- `packages/api/typescript/src/thread/utils/StopResolutions.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /usecase, /handler, /test
**Depends on:** T1, T2
**Consumes (frozen):** de T1 — `OwnerTenancy.language` (opcional) devolvido por `OwnerDirectory.getOwner(ownerId, tx?)`, importado de `@shared/services`. De T2 — `THREAD_MESSAGES.stopTitle(language, { kind })` e `THREAD_MESSAGES.stopChannelNotice(language, { kind, detail })`, importados de `../i18n`. Já frozen no repo: `CommandQueue.enqueueCommand<DeliverChannelMessage>(name, payload, { jobId }, tx)` com o payload `{ ownerId, channelId, contactExternalId, text, author, quotedMessageId?, replyEntryId, replyThreadId }`; `MessageAuthor.SYSTEM` e `TranscriptKind.SYSTEM`; `thread.recordEntry({ kind, text })`; `thread.raiseStop({ stopId, issueId, kind, title, detail })`; `RESOLUTIONS_BY_KIND` em `../utils/StopResolutions`.
**Scope fence:** DONE elsewhere — o campo `language` na porta (T1) e o catálogo `THREAD_MESSAGES` (T2). Consuma, não redefina. OUT — nada de SDK regen: nenhum controller ou schema de wire muda nesta frente, `OwnerTenancy` é porta interna. NÃO altere `RESOLUTIONS_BY_KIND` nem `POLICY_KEY`: a política de stop e as resoluções admissíveis são outra coisa e continuam como estão.
**Gate:** `cd packages/api/typescript && bun test src/thread/ && bun x tsc -p tsconfig.build.json --noEmit`

### Step T3.1 — Escrever o teste que falha

Crie `packages/api/typescript/src/thread/usecases/RaiseStop.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Language, StopKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { MockOwnerDirectory, OwnerDirectory } from '@shared/services'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { RaiseStop } from './RaiseStop'

/**
 * A propriedade central: um stop que o ORQUESTRADOR não conseguiria ter contado vira mensagem no
 * canal — e a entrega não passa por agent runner nenhum.
 */
describe('RaiseStop — o aviso no canal', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer, ownerId: 'integration-tenant' })
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('um SERVER_ERROR grava entrada SYSTEM e enfileira a entrega', async () => {
		const { thread } = await givenThreadReadyForStops(testBed, Language.PT_BR)

		await testBed.resolve(RaiseStop).execute({
			stopId: '019e4d24-6524-7041-9e1c-8108180cdd01',
			threadId: thread.id.value,
			kind: StopKind.SERVER_ERROR,
			detail: "You've hit your session limit · resets 10:30pm",
		})

		const entries = await testBed.resolve(ThreadRepository).findEntries(thread.id.value)
		const notice = entries.find(e => e.kind === TranscriptKind.SYSTEM)
		expect(notice).toBeDefined()
		expect(notice?.text).toContain('Erro do provedor')
		// O detalhe do provider vai junto, sem tradução — é onde está o horário do reset.
		expect(notice?.text).toContain("You've hit your session limit")

		expect(await enqueuedDeliveries(testBed)).toHaveLength(1)
	})

	it('respeita o idioma do operador', async () => {
		const { thread } = await givenThreadReadyForStops(testBed, Language.EN_US)

		await testBed.resolve(RaiseStop).execute({
			stopId: '019e4d24-6524-7041-9e1c-8108180cdd02',
			threadId: thread.id.value,
			kind: StopKind.SERVER_ERROR,
			detail: 'boom',
		})

		const entries = await testBed.resolve(ThreadRepository).findEntries(thread.id.value)
		expect(entries.find(e => e.kind === TranscriptKind.SYSTEM)?.text).toContain('Server error')
	})

	it('NÃO avisa nos kinds que o agente contou pela própria voz', async () => {
		const { thread } = await givenThreadReadyForStops(testBed, Language.PT_BR)

		for (const [i, kind] of [StopKind.HUMAN_REQUESTED, StopKind.APPROVAL_NEEDED].entries()) {
			await testBed.resolve(RaiseStop).execute({
				stopId: `019e4d24-6524-7041-9e1c-8108180cdd1${i}`,
				threadId: thread.id.value,
				kind,
				detail: 'o agente perguntou algo',
			})
		}

		// O stop existe (o card do Needs-you aparece), mas nada foi para o canal: uma notificação
		// mecânica aqui duplicaria uma fala que já aconteceu.
		expect(await enqueuedDeliveries(testBed)).toHaveLength(0)
	})

	it('avisa nos três kinds em que não houve voz', async () => {
		const kinds = [StopKind.SERVER_ERROR, StopKind.AUTH_REQUIRED, StopKind.BLOCKED_BY_CLASSIFICATION]

		for (const [i, kind] of kinds.entries()) {
			const { thread } = await givenThreadReadyForStops(testBed, Language.PT_BR)
			await testBed.resolve(RaiseStop).execute({
				stopId: `019e4d24-6524-7041-9e1c-8108180cdd2${i}`,
				threadId: thread.id.value,
				kind,
				detail: 'x',
			})
		}

		expect(await enqueuedDeliveries(testBed)).toHaveLength(kinds.length)
	})
})
```

Escreva no mesmo arquivo:
- `givenThreadReadyForStops(testBed, language)` — cria owner, canal, thread e política de stop com todos os critérios habilitados; semeia o `MockOwnerDirectory` (`testBed.resolve(OwnerDirectory) as MockOwnerDirectory`, método `seed(ownerId, { kind, responsibleUserId, language })`) com o idioma pedido; devolve `{ thread }`. Reutilize os `given` que já existem em `packages/api/typescript/tests/support/given/` (`givenThread`, `givenChannel`, …) — leia o diretório antes de montar entidades à mão.
- `enqueuedDeliveries(testBed)` — lê os comandos `deliver_channel_message` pendentes. Use a `PersistenceProbe` do `TestBed` (`testBed.probe`) para consultar a tabela de comandos; leia `packages/api/typescript/tests/support/PersistenceProbe.ts` para a forma exata da consulta.

Ajuste `findEntries` ao método real de leitura de transcript do `ThreadRepository` (leia a interface antes; se a leitura de entradas tiver outro nome, use o existente e não crie método novo).

### Step T3.2 — Rodar o teste para confirmar que falha

Run: `cd packages/api/typescript && bun test src/thread/usecases/RaiseStop.test.ts`
Expected: FAIL — o input de `RaiseStop` ainda exige `title`, e nenhuma entrada `SYSTEM` é gravada

### Step T3.3 — Scaffold da tabela declarativa

```bash
bun cli service thread StopChannelNotice
```

### Step T3.4 — Proposed file (o executor escreve por cima do scaffold)

```typescript
// packages/api/typescript/src/thread/utils/StopChannelNotice.ts — arquivo final COMPLETO
import { StopKind } from '@codm/contracts-typescript/wire/enums'

/**
 * Quais stops viram mensagem no canal — e o critério NÃO é a gravidade, é a VOZ.
 *
 * Notifica quando o orquestrador não conseguiria ter contado: `SERVER_ERROR` (o turno morreu),
 * `AUTH_REQUIRED` (o CLI pede login e a sessão não anda) e `BLOCKED_BY_CLASSIFICATION` (a resposta do
 * agente foi barrada, então o operador não ouviu nada).
 *
 * Não notifica quando houve fala: `HUMAN_REQUESTED` e `APPROVAL_NEEDED` nascem de um turno que rodou e
 * disse alguma coisa — `RecordStopFromExecution` inclusive usa o texto do agente COMO título nesses
 * casos. Uma notificação mecânica ali duplicaria a mensagem que o operador já recebeu.
 *
 * É uma TABELA e não uma cadeia de `if` pela mesma razão que `RESOLUTIONS_BY_KIND` ao lado: um membro
 * novo em `StopKind` quebra a compilação até alguém declarar se ele fala. Um `if` deixaria o kind novo
 * silencioso por omissão, que é o defeito que esta frente existe para corrigir.
 */
export const NOTIFIES_ON_CHANNEL: Record<StopKind, boolean> = {
	[StopKind.SERVER_ERROR]: true,
	[StopKind.AUTH_REQUIRED]: true,
	[StopKind.BLOCKED_BY_CLASSIFICATION]: true,
	[StopKind.HUMAN_REQUESTED]: false,
	[StopKind.APPROVAL_NEEDED]: false,
}
```

Se o scaffold criar o arquivo em `src/thread/services/`, mova-o para `src/thread/utils/` — o vizinho `RESOLUTIONS_BY_KIND` mora em `utils/` e esta tabela é da mesma natureza (dado declarado, não serviço injetável).

### Step T3.5 — Proposed file: `RaiseStop` resolve o título e avisa

```typescript
// packages/api/typescript/src/thread/usecases/RaiseStop.ts — arquivo final COMPLETO
import { injectable } from 'tsyringe-neo'
import { Handler, z, BaseError } from '@codm/core-typescript'
import type { Transaction } from '@codm/core-typescript'
import { MessageAuthor, StopKind, TranscriptKind } from '@codm/contracts-typescript/wire/enums'
import { CommandQueue } from '@codm/core-typescript'
import { OwnerDirectory } from '@shared/services'
import { IssueRepository } from '@issue/repositories/IssueRepository'
import { ThreadRepository } from '../repositories/ThreadRepository'
import { StopPolicyConfigRepository, type StopPolicy } from '../repositories/StopPolicyConfigRepository'
import { NOTIFIES_ON_CHANNEL } from '../utils/StopChannelNotice'
import { THREAD_MESSAGES } from '../i18n'
import type { DeliverChannelMessage } from './DeliverChannelMessage'
import type { ApplicationErrors } from '../errors'

export const RaiseStopInputSchema = z.object({
	stopId: z.uuid(),
	threadId: z.uuid(),
	/**
	 * OPTIONAL since B4 (spec decision 4) — and this single character is the feature. A stop with no
	 * issue is the orchestrator's needs-approval, raised before any issue exists; while this key was
	 * required the case was unreachable no matter what the aggregate allowed.
	 */
	issueId: z.uuid().optional(),
	kind: z.enum(StopKind),
	/**
	 * OPCIONAL desde o catálogo de canal: o título PADRÃO de cada kind agora vive em `THREAD_MESSAGES`
	 * e é resolvido aqui, onde o idioma do operador está em mãos. Quem passa um título explícito é
	 * `RecordStopFromExecution` no caso `HUMAN_REQUESTED`, onde o título É a pergunta que o agente
	 * escreveu — texto de autor, não rótulo de condição, e por isso não pertence a catálogo nenhum.
	 */
	title: z.string().optional(),
	detail: z.string(),
})

export const RaiseStopOutputSchema = z.object({ stopId: z.uuid() })

const POLICY_KEY: Record<StopKind, keyof StopPolicy> = {
	[StopKind.SERVER_ERROR]: 'serverErrors',
	[StopKind.BLOCKED_BY_CLASSIFICATION]: 'blockedByClassification',
	[StopKind.HUMAN_REQUESTED]: 'humanRequested',
	[StopKind.APPROVAL_NEEDED]: 'approvalNeeded',
	[StopKind.AUTH_REQUIRED]: 'authRequired',
}

/**
 * C24 RaiseStop — records a Stop for the Needs-You panel, but ONLY when the criterion is enabled in
 * StopPolicyConfig (`STOP_CRITERION_DISABLED` otherwise). Driven by the terminal's stop fact via
 * `RecordStopFromExecution`; that handler swallows the disabled/archived cases as a no-op.
 *
 * ### Why this lives in `thread/` since B4
 * The Stop is a child of the `Thread` aggregate (spec decision 4), so this use case loads a `Thread`,
 * calls a method on it and saves it. `docs/BACKEND.md:170` forbids importing another context's entities
 * and `:173` restricts changing another context's state to integration events — a version of this use
 * case sitting in `issue/` would break both. It reads `IssueRepository` for the archived guard, which is
 * the sanctioned cross-context shape (a repository READ, `docs/BACKEND.md:412`).
 *
 * ### `ownerId` comes from the THREAD
 * It used to come from `issue.ownerId`, which is exactly what made a stop without an issue impossible to
 * scope. The thread always exists and always knows its owner.
 *
 * ### Por que o AVISO NO CANAL é enfileirado AQUI
 * Porque aqui existe transação. O handler acima roda fora de uma, e uma queda entre "o stop foi
 * gravado" e "o aviso foi enfileirado" perderia exatamente o aviso — a classe de falha que esta
 * feature existe para corrigir. Enfileirado dentro do mesmo `withTransaction` que salva a thread, um
 * stop que commita sempre avisou, e um que falha nunca deixa mensagem órfã no canal. É a mesma forma
 * que `RecordOrchestratorReply` usa, e nenhum agent runner participa: entrada `SYSTEM` no transcript
 * mais comando durável, que é a propriedade que torna o aviso possível justamente quando o agente não
 * pode falar.
 */
@injectable()
export class RaiseStop extends Handler<typeof RaiseStopInputSchema, typeof RaiseStopOutputSchema> {
	readonly name = 'raise_stop' as const
	readonly inputSchema = RaiseStopInputSchema
	readonly outputSchema = RaiseStopOutputSchema

	constructor(
		private readonly threads: ThreadRepository,
		private readonly issues: IssueRepository,
		private readonly policy: StopPolicyConfigRepository,
		private readonly owners: OwnerDirectory,
		private readonly commands: CommandQueue,
	) {
		super()
	}

	protected async handle(input: this['input'], tx?: Transaction): Promise<this['output']> {
		// IDEMPOTENT, and it is a NAMED tightening (see the Scope fence). `stopId` is decided upstream and
		// the fact that drives this is at-least-once, so a redelivery arrives with the SAME id — which used
		// to hit the primary key of `issue_stops` and THROW. The handler above only swallows three named
		// codes, so the outbox retried a constraint violation five times and dead-lettered the needs-you
		// signal: the operator never saw the card. Early return is the shape `OpenIssue` already uses for
		// exactly this ("returns early when it already exists"), and it is what makes the docstring's
		// promise — the sanctioned outcomes are a no-op, "not surfaced" — actually true.
		const existing = await this.threads.findStop(input.stopId)
		if (existing) return { stopId: existing.stopId }

		const thread = await this.threads.findById(input.threadId)
		if (!thread) throw new BaseError<ApplicationErrors>('THREAD_NOT_FOUND', `no thread ${input.threadId}`)

		// The archived guard applies only when there IS an issue. A thread-level stop has no issue to be
		// archived, and demanding one back would re-close the hole decision 4 opens.
		if (input.issueId) {
			const issue = await this.issues.findById(input.issueId)
			if (!issue) throw new BaseError<ApplicationErrors>('ISSUE_NOT_FOUND', `no issue ${input.issueId}`)
			if (issue.archived) throw new BaseError<ApplicationErrors>('ISSUE_ARCHIVED', `issue ${input.issueId} is archived`)
		}

		const policy = await this.policy.get(thread.ownerId)
		if (!policy[POLICY_KEY[input.kind]]) {
			throw new BaseError<ApplicationErrors>('STOP_CRITERION_DISABLED', `the ${input.kind} criterion is disabled`)
		}

		// O idioma como transporte: quem resolve o owner já traz. `language` ausente cai em
		// `DEFAULT_LANGUAGE` dentro do catálogo, então não há ramificação sobre idioma aqui.
		const tenancy = await this.owners.getOwner(thread.ownerId, tx)
		const language = tenancy?.language

		return this.withTransaction(tx, async tx => {
			const stop = thread.raiseStop({
				stopId: input.stopId,
				issueId: input.issueId,
				kind: input.kind,
				title: input.title ?? THREAD_MESSAGES.stopTitle(language, { kind: input.kind }),
				detail: input.detail,
			})

			if (NOTIFIES_ON_CHANNEL[input.kind]) {
				const entry = thread.recordEntry({
					kind: TranscriptKind.SYSTEM,
					text: THREAD_MESSAGES.stopChannelNotice(language, { kind: input.kind, detail: input.detail }),
				})
				await this.threads.save(thread, tx)

				// `jobId` é o id da entrada: a fila dedup nele, então uma redelivery que já commitou não
				// agenda um segundo envio do mesmo aviso.
				await this.commands.enqueueCommand<DeliverChannelMessage>(
					'deliver_channel_message',
					{
						ownerId: thread.ownerId,
						channelId: thread.channelId,
						contactExternalId: thread.contactRef.externalId,
						text: entry.text,
						author: MessageAuthor.SYSTEM,
						replyEntryId: entry.entryId,
						replyThreadId: thread.id.value,
					},
					{ jobId: entry.entryId },
					tx,
				)
				return { stopId: stop.stopId }
			}

			await this.threads.save(thread, tx)
			return { stopId: stop.stopId }
		})
	}
}
```

Confirme o caminho de import de `CommandQueue` e o tipo `DeliverChannelMessage` lendo `RecordOrchestratorReply.ts` (passo de leitura desta Task) e use exatamente os mesmos — não invente um novo módulo. Se `recordEntry` não devolver `text`, use a mesma string que você passou.

### Step T3.6 — O handler para de montar título

Modifique `packages/api/typescript/src/thread/handlers/RecordStopFromExecution.ts`: apague a constante `STOP_TITLES` e o import de `StopKind` se ele ficar sem uso. Onde o `title` era montado, passe adiante apenas o caso do autor: `title: event.payload.kind === StopKind.HUMAN_REQUESTED && detail.length > 0 ? detail : undefined`. Os demais kinds deixam `title` ausente, e o `RaiseStop` resolve pelo catálogo com o idioma em mãos. Mantenha o bloco `try/catch` e a lista `swallowed` exatamente como estão.

### Step T3.7 — Rodar os testes do contexto

Run: `cd packages/api/typescript && bun test src/thread/`
Expected: PASS — os 4 testes novos passam e nenhum existente regride

### Step T3.8 — Type check + lint

Run: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` e `bun x biome check src/thread`
Expected: 0 erros

### Step T3.9 — Commit

```bash
git add packages/api/typescript/src/thread/utils/StopChannelNotice.ts \
        packages/api/typescript/src/thread/usecases/RaiseStop.ts \
        packages/api/typescript/src/thread/usecases/RaiseStop.test.ts \
        packages/api/typescript/src/thread/handlers/RecordStopFromExecution.ts
git commit -m "feat(thread): um stop que o agente não contou chega ao canal (Task T3)"
```

---

## Final Validation

- [ ] `bun tsc` — type check completo limpo
- [ ] `bun lint` — lint limpo
- [ ] `bun run test` — testes passam (ver Notes sobre falhas pré-existentes)
- [ ] AC mapping (cada AC da spec → ≥1 caminho de teste):
  - AC-1 → `packages/api/typescript/src/owner/services/DrizzleOwnerDirectory.test.ts:"devolve o idioma do perfil do usuário responsável"` + `:"devolve o idioma ausente quando o responsável nunca escolheu um"`
  - AC-2 → `packages/api/typescript/src/thread/usecases/RaiseStop.test.ts:"um SERVER_ERROR grava entrada SYSTEM e enfileira a entrega"`
  - AC-3 → mesmo teste do AC-2 (asserta a frase do catálogo E o detail do provider verbatim)
  - AC-4 → `packages/api/typescript/src/thread/usecases/RaiseStop.test.ts:"respeita o idioma do operador"` + `packages/api/typescript/src/thread/i18n/messages.test.ts:"colapsa um idioma que nenhum catálogo ship de volta para o padrão"`
  - AC-5 → `packages/api/typescript/src/thread/usecases/RaiseStop.test.ts:"NÃO avisa nos kinds que o agente contou pela própria voz"` + `:"avisa nos três kinds em que não houve voz"`
  - AC-6 → `packages/api/typescript/src/thread/usecases/RaiseStop.test.ts:"avisa nos três kinds em que não houve voz"` (a tabela é a única fonte da decisão; um `if` falharia ao cobrir os três de uma vez)
  - AC-7 → `packages/api/typescript/src/thread/i18n/messages.test.ts:"tem título para TODOS os kinds, nos dois idiomas"` (as frases inglesas migradas continuam existindo, agora com par)
  - AC-8 → `packages/api/typescript/src/thread/i18n/messages.test.ts:"fala inglês quando o operador escolheu inglês"` (a exaustividade de chaves é garantida em compilação por `defineMessages<typeof PT_MESSAGES>`)

## Notes

**Sem SDK regen.** Nenhum controller ou schema de wire muda: `OwnerTenancy` é porta interna de kernel e o catálogo é código de servidor. Não há Contract Lock nesta frente.

**Sem E2E.** Não há superfície de console nova — a mudança visível é uma mensagem no WhatsApp, que a suíte de Playwright não consegue observar. A cobertura fica nos testes de integração, que exercitam o enfileiramento real do comando.

**Falhas pré-existentes na suíte.** `bun test` em `packages/api/typescript` fecha com 3 falhas de `union-parity` no gateway Go (`ChannelMessageReceivedPayload.content`, `.platformData`, `ChannelSpecialPlatformEventReceivedPayload.payload`). Medido em `main` (`50e1b2f4`) com as mudanças no stash: `tests/architecture/` dá 133 pass / 3 fail sem qualquer código desta frente. NÃO tente consertá-las aqui.

**Árvore compartilhada.** O checkout principal esteve em `feat/loops-por-intervalo` com um agente editando durante o planejamento. Confirme `git status` antes de começar e, se houver trabalho alheio na árvore, trabalhe num worktree.

**O que esta frente NÃO cobre.** O vigia — item de mailbox envenenado (que hoje não levanta stop nenhum), issue `WORKING` sem trabalho na fila, stop aberto há horas sem resposta. É spec própria e vai reusar o catálogo e o transporte criados aqui.
