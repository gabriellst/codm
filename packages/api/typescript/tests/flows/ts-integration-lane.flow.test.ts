// TS→TS PELA MESMA LANE — a prova executável das decisões 4/5 sobre um arquivo SQLite real.
//
// O que está em jogo: até B3 um integration event publicado pelo TS não existia em lugar nenhum. O
// publisher chamava `publish()`, que era alias de `dispatch()`, e o consumidor rodava na mesma call
// stack. Um crash entre as duas metades perdia o fato, e o docblock que prometia "o outbox reentrega"
// era falso para essa direção. Aqui o caminho inteiro é exercitado como em produção: um
// `Publish*IntegrationEvents` de verdade publica, a linha aparece na lane `integration` (a mesma que o
// gateway Go escreve), e SÓ o poller entrega.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import * as schema from '@codedm/contracts/db'
import { outbox } from '@codedm/contracts/db'
import { migrationsDir } from '@codedm/contracts/db/migrations'
import { ContactKind, ProviderKind } from '@codedm/contracts-typescript/wire/enums'
import { DrizzleDomainEventRepository, LibsqlDriver, SqlExternalMediator, type Handler } from '@codedm/core-typescript'
import { PublishThreadIntegrationEvents } from '@thread/handlers/PublishThreadIntegrationEvents'
import { ThreadAttachedEvent } from '@thread/events/ThreadAttachedEvent'

const OWNER = '66666666-6666-4666-8666-666666666666'
const PUBLISHED = 'integration.thread.attached'

describe('a TS publisher rides the SAME lane as the Go gateway, and only the poller delivers', () => {
	let dir: string
	let driver: LibsqlDriver
	let mediator: SqlExternalMediator

	const makeHandler = (name: string) => {
		const calls: unknown[] = []
		const handler = {
			name,
			events: [name],
			bindContainer() {
				return handler
			},
			async execute(input: unknown) {
				calls.push(input)
			},
		} as unknown as Handler
		return { handler, calls }
	}

	const fact = (threadId: string) =>
		new ThreadAttachedEvent({
			entityId: threadId,
			ownerId: OWNER,
			payload: {
				threadId,
				channelId: crypto.randomUUID(),
				contactExternalId: 'contact-1',
				contactDisplayName: 'Ada',
				contactKind: ContactKind.USER,
				workspaceId: crypto.randomUUID(),
				providers: [ProviderKind.CLAUDE_CODE],
			},
		})

	beforeAll(async () => {
		dir = mkdtempSync(join(tmpdir(), 'codedm-ts-lane-'))
		driver = new LibsqlDriver({ schema, migrationsDir, dbPath: join(dir, 'codedm.db') })
		await driver.runMigrations()
	})

	afterAll(() => {
		rmSync(dir, { recursive: true, force: true })
	})

	beforeEach(async () => {
		await driver.reset()
		mediator = new SqlExternalMediator(driver, new DrizzleDomainEventRepository(driver.db))
	})

	it('publica → linha na lane `integration`, ZERO handlers rodados; drainOnce entrega e tombstona', async () => {
		const { handler, calls } = makeHandler(PUBLISHED)
		await mediator.register(handler)
		const publisher = new PublishThreadIntegrationEvents(mediator)
		const threadId = crypto.randomUUID()

		await publisher.execute(fact(threadId))

		// A metade durável: a linha existe, na lane compartilhada, e ninguém foi avisado ainda.
		const [row] = await driver.db.select().from(outbox)
		expect({ name: row?.name, source: row?.source, ownerId: row?.ownerId, processed: row?.processedAt ?? null }).toEqual({
			name: PUBLISHED,
			source: 'integration',
			ownerId: OWNER,
			processed: null,
		})
		expect(calls).toHaveLength(0)

		// A metade da entrega: um poll, um claim, o consumidor recebe — sem saber quem produziu.
		expect(await mediator.drainOnce()).toBe(1)
		expect(calls).toHaveLength(1)
		expect((calls[0] as { name: string; payload: { threadId: string } }).payload.threadId).toBe(threadId)

		const [after] = await driver.db.select().from(outbox)
		expect({ processed: after?.processedAt instanceof Date, claimedBy: after?.claimedBy ?? null }).toEqual({
			processed: true,
			claimedBy: null,
		})
	})

	it('sobrevive ao crash: a linha publicada por um processo é entregue por OUTRA instância do mediator', async () => {
		const publisher = new PublishThreadIntegrationEvents(mediator)
		await publisher.execute(fact(crypto.randomUUID()))

		// "O processo caiu antes de qualquer entrega." Uma instância NOVA — sem nada em memória — reclama
		// a mesma linha do arquivo. É a garantia que o caminho antigo não tinha: não havia linha.
		const reborn = new SqlExternalMediator(driver, new DrizzleDomainEventRepository(driver.db))
		const { handler, calls } = makeHandler(PUBLISHED)
		await reborn.register(handler)

		expect(await reborn.drainOnce()).toBe(1)
		expect(calls).toHaveLength(1)
	})
})
