import { describe, expect, it } from 'bun:test'
import { assertFamiliesProvided } from '../../composition/compose'
import { MANIFEST } from '@generated/composition.generated'
import { PLACEMENT, mountedContexts } from '@shared/deployment'
import type { ContextDescriptor } from '@shared/descriptor'
import type { ContextId } from '@codm/contracts/context-ids'

/**
 * infra-channel — a testemunha de que `infra` é CANAL, e não decoração.
 *
 * A `PLACEMENT` diz que `auth`, `owner` e a linha cloud de `shared` rodam sobre `pg`. Essa frase só
 * vale alguma coisa se alguém FORNECER os bindings dessa família e a composição os APLICAR. Enquanto
 * não valia, o `db: 'pg'` era exatamente o tipo de declaração que este programa inteiro vem caçando:
 * verdadeira no arquivo, inexistente no processo.
 *
 * Estes casos cobram as duas metades, e o falseador (INF-03) é o que impede o próprio gate de ser
 * vazio — sem ele, `assertFamiliesProvided` poderia ser um `return` e tudo aqui continuaria verde.
 */
const CLOUD = { deployment: 'cloud' } as const
const LOCAL = { deployment: 'local' } as const

describe('infra-channel (ADR 0005/0006 — a família escolhida é a família montada)', () => {
	it('INF-01: sob CLOUD, a família de cada contexto montado é FORNECIDA por alguém que monta', () => {
		expect(() => assertFamiliesProvided(MANIFEST, CLOUD)).not.toThrow()
	})

	it('INF-02: e sob LOCAL também — as duas composições passam pela mesma cobrança', () => {
		expect(() => assertFamiliesProvided(MANIFEST, LOCAL)).not.toThrow()
	})

	it('INF-03: TESTEMUNHA — sem o módulo da família, a composição RECUSA e nomeia a família', () => {
		// O manifesto com o módulo `pg` arrancado do único contexto que o fornece. É exatamente o
		// estado em que a `PLACEMENT` diria `db: 'pg'` e ninguém construiria o mundo que ela descreve.
		const crippled = {
			...MANIFEST,
			shared: { ...MANIFEST.shared, infra: { db: { libsql: MANIFEST.shared.infra?.db?.libsql } } },
		} as unknown as Record<ContextId, ContextDescriptor>

		let raised: unknown
		try {
			assertFamiliesProvided(crippled, CLOUD)
		} catch (error) {
			raised = error
		}

		expect(raised, 'sem esta recusa, a nuvem subiria com os bindings da OUTRA família ou sem binding nenhum').toBeDefined()
		expect(String(raised), 'a recusa tem de nomear a família que ficou sem módulo').toContain("'pg'")
		expect(String(raised)).toContain('decorativa')
	})

	it('INF-04: o módulo da família é MESCLADO no registry — `infra` é canal, não declaração', async () => {
		// A prova de que o canal existe: o registry base do `shared` NÃO traz o driver, e o módulo da
		// família traz. Quem os junta é o `infraRegistryFor`, na fase A (ADR 0007) — antes era também o
		// `withInfraModules`, por contexto, e essa segunda passada foi o que o ADR apagou. Comparar as
		// duas contagens é a forma mais barata de dizer "há o que mesclar" sem acoplar ao conteúdo.
		const base = MANIFEST.shared.registry?.real.length ?? 0
		const familyEntries = MANIFEST.shared.infra?.db?.libsql?.real.length ?? 0

		expect(familyEntries, 'o módulo da família não pode ser vazio — senão INF-01 passaria por acidente').toBeGreaterThan(0)
		expect(base, 'e o registry base tem de existir, senão não há o que mesclar').toBeGreaterThan(0)
	})

	it('INF-05: a tabela declara `pg` para a nuvem e `libsql` para o desktop — o eixo é REAL', () => {
		// Sem esta asserção, todo o resto passaria igualmente bem num repo de uma família só, e o
		// mecanismo inteiro seria cerimônia.
		const cloudFamilies = new Set(mountedContexts(CLOUD).map(context => PLACEMENT[context][0]?.infra.db))
		const localFamilies = new Set(
			mountedContexts(LOCAL).map(context => PLACEMENT[context].find(p => p.when.deployment === 'local')?.infra.db),
		)

		expect(cloudFamilies, 'a nuvem roda sobre Postgres (ADR 0005)').toContain('pg')
		expect(localFamilies, 'o desktop roda sobre o arquivo SQLite').toContain('libsql')
		expect(cloudFamilies.has('libsql'), 'nenhum contexto da nuvem pode ficar no SQLite do desktop').toBe(false)
	})
})
