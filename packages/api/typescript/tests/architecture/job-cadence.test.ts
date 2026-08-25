import { describe, expect, it } from 'bun:test'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Handler, resolveJobCadence, z } from '@codm/core-typescript'

/**
 * A CADÊNCIA MORA NO JOB (T1.4) — e este arquivo é o rail que a mantém lá.
 *
 * Antes, os três jobs repetíveis declaravam sua cadência na lista `jobs` do `<ctx>/index.ts`:
 * `{ handler: PruneOutbox, repeat: { every: 24 * 60 * 60 * 1000 } }`. Isso era a única coisa
 * NÃO-MECÂNICA naquele barrel, e é por isso que ela importa muito além de estética: enquanto uma
 * decisão morasse ali, o barrel inteiro não era derivável, e a promessa da reforma — "criar um
 * contexto toca um arquivo autorado" — tinha um furo do tamanho exato dessa linha.
 *
 * É o mesmo movimento de `Projector.events`: a declaração mora no artefato que ela governa.
 *
 * O kernel já suportava (`resolveJobCadence`, DC0), com a lista vencendo quando os dois existem —
 * então um caso excepcional continua exprimível sem o job precisar saber disso. O que faltava era
 * mover os três casos reais, e impedir que voltem.
 */

const SRC = join(import.meta.dir, '../../src')
/** Os derivados sairam de `src/` no passo 5 — `src/` volta a ser index.ts, context.ts e os contextos. */
const GENERATED = join(import.meta.dir, '../../generated')

/**
 * Os barris de job que existem — derivado da árvore, nunca listado.
 *
 * Era `<ctx>/index.ts` até a DC2. Com o descritor gerado, o barril de jobs virou `<ctx>/jobs.ts`, e
 * é ele quem o gerador lê; a lista `jobs:` do descritor passou a ser SAÍDA, não entrada.
 */
const barrels = (): { context: string; source: string }[] =>
	readdirSync(SRC, { withFileTypes: true })
		.filter(entry => entry.isDirectory() && existsSync(join(SRC, entry.name, 'jobs.ts')))
		.map(entry => ({ context: entry.name, source: readFileSync(join(SRC, entry.name, 'jobs.ts'), 'utf8') }))

describe('a cadência de job mora no job, não no barrel do contexto (T1.4)', () => {
	it('JOB-01: NENHUM barril de jobs declara cadência — o barril é só a LISTA', () => {
		// O rail. Ele fica vermelho no dia em que alguém escrever `repeat` num barril de novo — que é
		// como a decisão vazou para o barril a primeira vez.
		const culpados = barrels()
			.filter(({ source }) => /\brepeat\b/.test(source.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '')))
			.map(({ context }) => context)

		expect(barrels().length, 'sem barris de job para varrer este teste não estaria medindo nada').toBeGreaterThan(0)
		expect(
			culpados,
			`estes barris declaram cadência: ${culpados.join(', ')}. A cadência é uma DECISÃO, e decisão em barril é o ` +
				`que impede o barril de ser derivado — declare-a como \`static repeat\` no próprio job.`,
		).toEqual([])
	})

	it('JOB-05: o descritor GERADO também não carrega cadência — ela não tem por onde voltar', () => {
		// A outra porta. O barril é a fonte, mas quem o `BoundedContext` lê é o descritor gerado — e se
		// a cadência reaparecesse lá, JOB-01 continuaria verde enquanto a decisão voltava a morar numa
		// lista central. O gerador emite `jobs: [{ handler: X }]` e nada mais; esta linha cobra isso.
		const gerado = readFileSync(join(GENERATED, 'composition.generated.ts'), 'utf8')

		expect(gerado, 'o descritor gerado tem de registrar jobs').toContain('jobs: [{ handler:')
		expect(gerado, 'nenhuma cadência pode ser emitida no descritor — ela mora no job').not.toContain('repeat')
	})

	it('JOB-02: todo job exportado por um barril REALMENTE declara uma cadência', () => {
		// A CONTRAPROVA de JOB-01, e agora DERIVADA. Sem ela, apagar as linhas dos barris satisfaria
		// JOB-01 perfeitamente — e teria desarmado as varreduras periódicas em silêncio, que é um modo
		// de falha bem pior que o defeito original.
		//
		// Ela importava as TRÊS classes concretas (`@shared/usecases/PruneOutbox`,
		// `@issue/…/AutoArchiveCompletedIssues`, `@thread/…/FireDueLoops`), o que fazia uma rail
		// estrutural depender de ESTE produto ter exatamente esses três jobs, em três contextos. Num
		// fork que pode três, ela nem compila. O universo agora sai dos próprios barris.
		//
		// O que ela NÃO afirma mais: o VALOR de cada cadência. Isso é conhecimento de produto e mudou
		// de lugar, não sumiu — vive colado a cada job (`PruneOutbox.test.ts`, `FireDueLoops.test.ts`,
		// `AutoArchiveCompletedIssues.cadence.test.ts`), que é onde alguém que edita uma hora para um
		// milissegundo vai olhar.
		const declared = barrels().flatMap(({ context, source }) =>
			[...source.matchAll(/export \{ (\w+) \} from '([^']+)'/g)].map(m => ({ context, name: m[1] as string, from: m[2] as string })),
		)

		expect(declared.length, 'nenhum job exportado por barril algum — esta contraprova não está medindo nada').toBeGreaterThan(0)

		const semCadencia = declared.filter(({ context, name, from }) => {
			const file = join(SRC, context, `${from.replace(/^\.\//, '')}.ts`)
			if (!existsSync(file)) return true
			const body = readFileSync(file, 'utf8')
			// O marcador que `resolveJobCadence` lê de fato: `static readonly repeat` na classe.
			return !new RegExp(`class ${name}[\\s\\S]*?static\\s+readonly\\s+repeat\\b`).test(body)
		})

		expect(
			semCadencia.map(j => `${j.context}/${j.name}`),
			'estes jobs são exportados pelo barril mas não declaram `static readonly repeat` — o barril os agenda e eles nunca repetem',
		).toEqual([])
	})

	it('JOB-03: TESTEMUNHA — a lista ainda VENCE o job, para o caso excepcional', () => {
		// A precedência existe para que um deployment possa sobrescrever uma cadência sem editar o
		// job. Se ela sumisse, JOB-02 continuaria verde e a capacidade teria evaporado sem aviso.
		// Um handler LOCAL: a precedência é uma propriedade de `resolveJobCadence`, não deste produto.
		// É um `Handler` DE VERDADE, e não um objeto com o formato certo, porque `JobDefinition.handler`
		// é tipado — a primeira versão deste caso usava uma classe solta, o `bun test` passava e o `tsc`
		// reprovava. O tipo é a asserção aqui tanto quanto o `expect`.
		const EmptySchema = z.object({})
		class JobComCadencia extends Handler<typeof EmptySchema, typeof EmptySchema> {
			static readonly repeat = { every: 60_000 }
			readonly name = 'job_com_cadencia' as const
			readonly inputSchema = EmptySchema
			readonly outputSchema = EmptySchema
			protected async handle(): Promise<this['output']> {
				return {}
			}
		}
		expect(resolveJobCadence({ handler: JobComCadencia, repeat: { every: 5_000 } })).toEqual({ every: 5_000 })
	})

	it('JOB-04: um job SEM cadência não ganha uma por acidente', () => {
		// `resolveJobCadence` devolvendo um default seria pior que devolver nada: transformaria todo
		// handler one-shot registrado como job num repetível que ninguém pediu.
		class UmaVezSo {}
		expect(resolveJobCadence({ handler: UmaVezSo as never })).toBeUndefined()
	})
})
