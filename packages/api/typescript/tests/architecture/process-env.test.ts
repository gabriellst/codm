import { describe, expect, it } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * RAIL (spec D14/AC-4): `process.env.` fora do módulo Config é proibido em src/. O Config tipado
 * (`RawEnvSchema`) é a única porta de entrada de ambiente — um site cru é um eixo paralelo em
 * gestação (foi assim que nasceram mais de um flag de teste solto por aí, extintos desde). Exceções
 * vivem no INVENTORY (shrink-only, motivo inline); o estado final não é a lista vazia, e sim a
 * lista conter só leituras de ambiente do SISTEMA OPERACIONAL — env de configuração do produto
 * continua proibido fora do Config e deve ser adicionado ao `RawEnvSchema`/registry, nunca aqui.
 */
const SRC = join(import.meta.dir, '../../src')
const INVENTORY: string[] = [
	// `ComSpec` é variável de AMBIENTE DE EXECUÇÃO que o próprio Windows define (aponta o
	// interpretador de lote, ex.: cmd.exe) — não é config do produto, então não pertence ao
	// RawEnvSchema/template.config.ts (de onde o .env.example é GERADO): declará-la ali pediria
	// ao usuário para configurar algo que o SO já fornece sozinho. Não é o eixo paralelo que o
	// rail existe para impedir — é leitura de onde o interpretador mora, não uma config redigitada
	// por fora do Config. O fallback `?? 'cmd.exe'` também torna a leitura não-essencial: uma
	// instalação sem `ComSpec` é anômala e ainda assim funciona.
	'agent/services/AgentRunner/platformInvocation.ts',
]

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap(name => {
		const full = join(dir, name)
		return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : []
	})
}

describe('process.env é exclusivo do Config', () => {
	it('nenhum site cru fora do inventário', () => {
		const offenders = walk(SRC)
			.filter(file => !INVENTORY.some(entry => file.endsWith(entry)))
			.filter(file => /process\.env\./.test(readFileSync(file, 'utf8')))
		expect(offenders).toEqual([])
	})
	it('o inventário não tem entradas mortas', () => {
		for (const entry of INVENTORY) {
			const file = walk(SRC).find(f => f.endsWith(entry))
			expect(file, `entrada morta no INVENTORY: ${entry}`).toBeDefined()
			expect(/process\.env\./.test(readFileSync(file!, 'utf8')), `${entry} não usa mais process.env`).toBe(true)
		}
	})
})
