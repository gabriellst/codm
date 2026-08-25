/**
 * O GATE DO BINDING schema → Go.
 *
 * O `sqlc.yaml` do codm documenta um ritual de QUATRO passos para regenerar depois de uma migração:
 * (1) `drizzle-kit generate`, (2) `db:sync-go` (copia a migração para a cópia `//go:embed`),
 * (3) re-transcrever `schema.sql` a partir da migração, (4) `sqlc generate`.
 *
 * **Só o passo 2 tinha gate** (`scripts/db/sync-sqlite-migrations.ts`, via `db:check-go`, que trava
 * a igualdade byte-a-byte da cópia embutida). Os passos 3 e 4 não tinham nenhum — e o passo 4 foi o
 * que ficou para trás.
 *
 * Medido em 2026-08-14, ANTES deste teste existir: com o `gen/` no estado commitado, `sqlc diff`
 * já reprovava com 150 linhas de divergência. Faltavam structs inteiras (`AuthenticationDeviceCode`,
 * `AuthenticationDeviceToken`, `OwnerOnboarding`, `ThreadLoop`) e a assinatura de
 * `ListTranscriptByThread` estava velha. Nada acusava: `bun test:tooling`, `db:check-go`,
 * `go build ./...` (app E core) e `go test ./...` todos fechavam **EXIT=0**. O compilador não vê,
 * porque struct a mais ou tabela a menos compila — só quem usaria a tabela ausente quebraria, e
 * ninguém usava ainda.
 *
 * A ironia que fecha o argumento: o próprio `sqlc.yaml` chama os models de *"a compile-time drift
 * guard"*. Um guard que ninguém regenera não guarda — envelhece.
 *
 * TESTEMUNHA (regra da casa: um gate que nunca reprovou não é gate). O quarto caso corrompe o
 * `models.go`, exige que o `sqlc diff` acuse, e restaura.
 *
 * DIVERGÊNCIA DELIBERADA EM RELAÇÃO AO TEMPLATE: lá o `sqlc.yaml` lê as migrações do drizzle
 * DIRETO, e o gate afirma isso (`expect(config).toContain('../../contracts/db/pg/migrations')`).
 * Aqui é o oposto POR NECESSIDADE — o parser sqlite do sqlc rejeita a saída crua do drizzle-kit
 * (identificadores em backtick + separadores `--> statement-breakpoint`), então `schema.sql` é um
 * transcrito normalizado. Portar a asserção do template importaria uma verdade de lá como mentira
 * aqui.
 *
 * FRAQUEZA HERDADA, dita em vez de escondida: os dois casos que realmente rodam `sqlc` estão sob
 * `skipIf(!sqlcAvailable)`. Sem o binário no PATH eles **pulam em silêncio** — o gate inteiro vira
 * no-op. É a mesma forma no template. Fica registrado como dívida; consertar exige decidir se um
 * contribuidor sem `sqlc` deve ver o build falhar.
 */
import { describe, expect, it } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')

/**
 * DOIS configs, e é isso que este gate guarda. O sqlc gera models para TODO o schema que recebe —
 * com um config só, o kernel acabava dono de structs de sete bounded contexts de produto. Decisão
 * do founder (2026-08-14): o core tem sqlc próprio, com schema e queries só dele.
 */
const CONFIGS = [
	{ side: 'core', dir: join(ROOT, 'packages/api/go/core/db/sqlite'), schema: 'schema.core.sql' },
	{ side: 'app', dir: join(ROOT, 'packages/api/go/internal/shared/db/sqlite'), schema: 'schema.app.sql' },
] as const

/**
 * `-f <config absoluto>` em vez de `cwd` — de propósito. Medido: com `{ cwd }`, este teste passa
 * quando rodado da raiz mas FALHA dentro do hook de pre-commit ("error parsing configuration files:
 * file does not exist"), porque lá o cwd do processo filho não é o que se supõe. Um gate que só
 * funciona quando invocado do lugar certo é um gate frágil; o caminho absoluto o torna indiferente
 * a de onde foi chamado. Os paths relativos DENTRO do config (schema.sql, query/, gen/) o próprio
 * sqlc resolve a partir da localização do arquivo.
 */
function sqlc(dir: string, args: string[]) {
	const proc = Bun.spawnSync(['sqlc', '-f', join(dir, 'sqlc.yaml'), ...args])
	return { exitCode: proc.exitCode, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() }
}

const sqlcAvailable = Bun.spawnSync(['which', 'sqlc']).exitCode === 0

/**
 * DIVERGE DO TEMPLATE, de propósito. Lá os dois casos que rodam `sqlc` usam
 * `it.skipIf(!sqlcAvailable)` — sem o binário no PATH eles somem do relatório e o gate vira no-op
 * SEM DIZER. Aqui o skip é RUIDOSO: o caso continua existindo, aparece como passado, e grita no
 * stderr que a verificação não aconteceu. Continua não sendo ideal (o ideal é falhar), mas um
 * no-op silencioso e um no-op anunciado não são a mesma dívida.
 *
 * Motivo imediato da mudança: o biome do codm reprova `it.skipIf(...)` com
 * `lint/suspicious/noMisplacedAssertion` — não reconhece a forma como chamada de teste. A
 * restrição obrigou a olhar de novo para algo que eu tinha só documentado como fraqueza herdada.
 */
function skipWithNoise(): boolean {
	if (sqlcAvailable) return true
	console.warn('⚠️  sqlc ausente do PATH — o gate de paridade schema→Go NÃO foi verificado nesta execução')
	return false
}

describe('sqlc parity — o schema e o Go gerado não derivam', () => {
	it('os dois schemas derivados estão em dia com o transcrito', () => {
		const proc = Bun.spawnSync(['bun', join(ROOT, 'scripts/db/split-sqlite-schema.ts'), '--check'])
		expect(
			proc.exitCode,
			`o schema derivado divergiu do transcrito.\nRode: bun scripts/db/split-sqlite-schema.ts\n\n` +
				`${proc.stdout.toString()}${proc.stderr.toString()}`,
		).toBe(0)
	})

	for (const { side, dir, schema } of CONFIGS) {
		it(`[${side}] o sqlc.yaml lê o schema derivado do seu lado`, async () => {
			const config = await Bun.file(join(dir, 'sqlc.yaml')).text()
			expect(config).toContain(`schema: "${schema}"`)
		})

		it(`[${side}] o código gerado está commitado`, () => {
			expect(existsSync(join(dir, 'gen/models.go'))).toBe(true)
		})

		it(`[${side}] o gerado no repo bate com o que o gerador produz hoje`, () => {
			if (!skipWithNoise()) return
			const { exitCode, stdout, stderr } = sqlc(dir, ['diff'])
			expect(
				exitCode,
				`sqlc diff acusou divergência no lado ${side} — o schema mudou e o Go não foi regenerado.\n` +
					`Rode: cd ${dir} && sqlc generate\n\n${stdout}${stderr}`,
			).toBe(0)
		})

		it(`[${side}] TESTEMUNHA: o gate reprova quando o gerado diverge do schema`, async () => {
			if (!skipWithNoise()) return
			// Prova que o `sqlc diff` acima não passa vacuosamente. Sem isto, um diff que sempre
			// devolve 0 (config errada, binário ausente, caminho vazio) passaria despercebido.
			const modelsPath = join(dir, 'gen/models.go')
			const original = await Bun.file(modelsPath).text()
			try {
				await Bun.write(modelsPath, `${original}\n\ntype CampoQueNaoExiste struct{ X string }\n`)
				expect(sqlc(dir, ['diff']).exitCode, `o sqlc diff DEVERIA acusar um models.go corrompido (${side})`).not.toBe(0)
			} finally {
				await Bun.write(modelsPath, original)
			}
			expect(sqlc(dir, ['diff']).exitCode).toBe(0)
		})
	}

	it('o transcrito guarda a razão de existir — senão o próximo leitor "conserta" o config', async () => {
		const config = await Bun.file(join(CONFIGS[0].dir, 'sqlc.yaml')).text()
		expect(config).toContain("rejects drizzle-kit's raw output")
	})
})
