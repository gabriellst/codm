import { describe, expect, it } from 'bun:test'
import { CONTEXTS } from '@generated/contexts.generated'
import { keysOf } from '@codm/core-typescript'
import { PLACEMENT, criteriaFromEnv, mountedContexts, placementFor } from '@shared/deployment'

/**
 * deployment — a tabela de alocação diz ONDE cada contexto monta e com qual família, e é a única
 * cópia dessa informação.
 *
 * A METADE QUE O `tsc` JÁ COBRE, e que este arquivo NÃO repete: as duas exaustividades. Elas são
 * propriedades de TIPO, medidas com o compilador, não com asserções:
 *
 *   contexto novo → `PLACEMENT` deixa de satisfazer `Record<ContextModule, …>`, TS1360 na linha
 *                   da tabela nomeando o contexto que falta (medido 2026-08-14 com `billing`)
 *   eixo novo     → `ContextInfra` ganha um campo obrigatório e QUATORZE erros aparecem, um por
 *                   placement, cada um dizendo "Property 'cache' is missing" (medido com `cache`)
 *
 * Um teste que tentasse asserir isso em runtime seria mais fraco e chegaria depois. O que sobra
 * para runtime é o que o tipo NÃO pode dizer: que a derivação bate com a tabela, e que `'none'`
 * significa o que o ADR 0004 diz que significa.
 */
describe('deployment (a tabela de alocação por contexto)', () => {
	it('DEP-01: a tabela cobre exatamente os contextos declarados, sem sobra nem falta', () => {
		expect(keysOf(PLACEMENT).sort()).toEqual(keysOf(CONTEXTS).sort())
	})

	it('DEP-02: todo contexto monta em pelo menos um deployment — nenhum é inalcançável', () => {
		const orphan = keysOf(PLACEMENT).filter(
			context =>
				placementFor(context, { deployment: 'cloud' }) === undefined && placementFor(context, { deployment: 'local' }) === undefined,
		)
		expect(
			orphan,
			'Um contexto declarado que não monta em lugar nenhum é código que existe e nunca roda — ' +
				'a forma de ponteiro morto que esta tabela deveria tornar impossível. Dê-lhe um placement, ' +
				'ou tire-o de CONTEXTS.',
		).toEqual([])
	})

	it('DEP-03: o conjunto da nuvem é DERIVADO da tabela, não declarado à parte', () => {
		expect(mountedContexts({ deployment: 'cloud' }).sort()).toEqual(['auth', 'owner', 'shared'])
	})

	it('DEP-04: o desktop monta OITO — `auth` e `owner` sao da nuvem (ADR 0001)', () => {
		const local = mountedContexts({ deployment: 'local' }).sort()
		expect(local).toEqual(['agent', 'artifact', 'external', 'issue', 'shared', 'thread', 'ui', 'workspace'])
		expect(local, 'identidade e tenancy vivem na nuvem — montá-las aqui reintroduziria o ownerId cunhado localmente').not.toContain('auth')
		expect(local).not.toContain('owner')
	})

	it('DEP-05: `external` declara `db: none` — a afirmação, não a omissão (ADR 0004)', () => {
		const placement = placementFor('external', { deployment: 'local' })
		expect(placement?.infra.db, 'external tem ZERO bindings Drizzle*; declarar um banco aqui seria dado falso').toBe('none')
	})

	it('DEP-06: nenhum OUTRO contexto declara `none` — `external` é o único que não persiste', () => {
		const none = keysOf(PLACEMENT).filter(context => PLACEMENT[context].some(placement => placement.infra.db === 'none'))
		expect(
			none,
			'`none` é para um contexto que genuinamente não escreve em banco nenhum. Se outro passou a ' +
				'declará-lo, ou ele perdeu seus repositórios (e isso é o achado), ou o `none` está sendo usado ' +
				'como "ainda não decidi" — que é exatamente o que o ADR 0004 recusa.',
		).toEqual(['external'])
	})

	it('DEP-07: `placementFor` é total sobre a tabela — devolve undefined, nunca lança nem inventa default', () => {
		for (const context of keysOf(PLACEMENT)) {
			expect(() => placementFor(context, { deployment: 'cloud' })).not.toThrow()
			expect(() => placementFor(context, { deployment: 'local' })).not.toThrow()
		}
		// `agent` é local-only: perguntar pela nuvem devolve undefined, e undefined é a resposta
		// "não monta aqui" — nunca um plano de outro deployment por engano.
		expect(placementFor('agent', { deployment: 'cloud' })).toBeUndefined()
	})

	// ─── HERDADO de tests/architecture/cloud-profile.test.ts, apagado em 2026-08-14 ───
	//
	// Aquele arquivo assertava CLOUD-01..05 sobre `src/shared/cloud-profile.ts`. Duas das cinco
	// sobrevivem aqui porque continuam sendo perguntas verdadeiras, e três morreram com o arquivo:
	//
	//   CLOUD-01 (o conjunto da nuvem é exatamente auth+owner+shared)  →  DEP-03, acima
	//   CLOUD-02 (o complemento fica de fora)                          →  DEP-09, abaixo
	//   CLOUD-05 (CODM_PROFILE é lido literalmente)                    →  DEP-10, abaixo
	//   CLOUD-03/04 (o FILTRO mantém/não-mantém routers)               →  MORREM, e o motivo importa
	//
	// CLOUD-03 e CLOUD-04 testavam `filterRoutersForCloudProfile`, que existia porque não havia
	// composição: o perfil da nuvem MONTAVA os dez contextos e escondia sete depois. Com a composição
	// explícita não há o que filtrar — os sete nunca são montados. Não é uma asserção que deixou de
	// ser checada; é um comportamento que deixou de existir, e reescrevê-la seria testar um filtro
	// que não está lá.
	it('DEP-09: o complemento do conjunto da nuvem fica FORA — os sete não montam lá', () => {
		const cloud = mountedContexts({ deployment: 'cloud' })
		const excluded = keysOf(PLACEMENT)
			.filter(context => !cloud.includes(context))
			.sort()
		expect(excluded).toEqual(['agent', 'artifact', 'external', 'issue', 'thread', 'ui', 'workspace'])
	})

	it('DEP-10: `CODM_PROFILE` é lido LITERALMENTE — só a string exata "cloud" arma a nuvem', () => {
		expect(criteriaFromEnv({ CODM_PROFILE: 'cloud' }).deployment).toBe('cloud')
		expect(criteriaFromEnv({ CODM_PROFILE: undefined }).deployment).toBe('local')
		expect(criteriaFromEnv({ CODM_PROFILE: 'Cloud' }).deployment, 'um parse tolerante subiria a nuvem como desktop por uma maiúscula').toBe(
			'local',
		)
		expect(criteriaFromEnv({ CODM_PROFILE: 'true' }).deployment).toBe('local')
		expect(criteriaFromEnv({}).deployment).toBe('local')
	})

	it('DEP-08: um `when` mais específico não é engolido por um mais genérico', () => {
		// `shared` declara os dois deployments explicitamente; cada consulta acha o SEU.
		expect(placementFor('shared', { deployment: 'cloud' })?.when.deployment).toBe('cloud')
		expect(placementFor('shared', { deployment: 'local' })?.when.deployment).toBe('local')
	})
})
