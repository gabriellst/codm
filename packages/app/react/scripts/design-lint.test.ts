// packages/app/react/scripts/design-lint.test.ts — o FALSEADOR do design-lint.
//
// A lição mais cara da fase de fidelidade foi que uma régua não validada abençoa lixo: a primeira
// versão da métrica declarou 74/74 "pronto" na média global enquanto seis telas visivelmente
// diferentes passavam — o olho do founder pegou o que a régua deixou passar, e custou uma fase
// inteira de retrabalho. A ordem certa é inversa: ANTES de confiar num detector, construir o caso
// deliberadamente errado e exigir que ele REPROVE.
//
// Cada teste abaixo é um defeito que JÁ aconteceu neste repo, reduzido a uma árvore sintética. E os
// dois últimos são o inverso — casos LEGÍTIMOS que o detector não pode acusar, porque foi
// exatamente onde as duas primeiras versões da regra de dialeto se enganaram (raio relativo à caixa;
// variante semântica de cor).
import { describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runDesignLint } from './design-lint'

type Node = Record<string, unknown>

/** Monta uma árvore de design sintética em disco e roda o lint contra ela. */
function lintTree(specs: Record<string, Node>, tokens?: Record<string, { type: string; value: string }>) {
	const root = mkdtempSync(join(tmpdir(), 'design-lint-'))
	try {
		mkdirSync(join(root, 'components'), { recursive: true })
		mkdirSync(join(root, 'screens'), { recursive: true })
		for (const [name, node] of Object.entries(specs)) writeFileSync(join(root, 'components', `${name}.json`), JSON.stringify(node))
		if (tokens) writeFileSync(join(root, 'tokens.json'), JSON.stringify({ variables: tokens }))
		return runDesignLint(root)
	} finally {
		rmSync(root, { recursive: true, force: true })
	}
}

const FIELD_GRADIENT = {
	type: 'gradient',
	gradientType: 'radial',
	enabled: true,
	rotation: 0,
	size: { width: 5.87, height: 7.82 },
	center: { y: 3.09 },
	colors: [
		{ color: '#D9D9D926', position: 0 },
		{ color: '#D9D9D900', position: 1 },
	],
}

describe('design-lint — falseadores (o defeito conhecido TEM de ser pego)', () => {
	test('opacity no nó em vez de alpha no fill', () => {
		const findings = lintTree({
			campo: { type: 'frame', name: 'Campo', fill: { ...FIELD_GRADIENT, opacity: 0.6 } },
		})
		const hit = findings.filter(f => f.rule === 'opacity-no-no')
		expect(hit).toHaveLength(1)
		expect(hit[0]?.severity).toBe('error')
	})

	test('dialeto: MESMA paleta, no MESMO componente, com duas geometrias', () => {
		const findings = lintTree({
			tela: {
				type: 'frame',
				name: 'Tela',
				children: [
					{ type: 'ref', ref: 'q:select', name: 'Idioma', fill: FIELD_GRADIENT },
					{ type: 'ref', ref: 'q:select', name: 'Margem', fill: { ...FIELD_GRADIENT, size: { width: 3.42, height: 3.86 } } },
				],
			},
		})
		const hit = findings.filter(f => f.rule === 'instancias-divergentes')
		expect(hit).toHaveLength(1)
		expect(hit[0]?.detail).toContain('2 execuções')
	})

	test('ícone que o pack renomeou — exporta "?" sem avisar', () => {
		const findings = lintTree({
			nav: { type: 'frame', name: 'Nav', children: [{ type: 'icon', name: 'I', icon: 'home', library: 'lucide' }] },
		})
		expect(findings.filter(f => f.rule === 'icone-renomeado')).toHaveLength(1)
	})

	test('ícone de biblioteca estranha', () => {
		const findings = lintTree({
			nav: { type: 'frame', name: 'Nav', children: [{ type: 'icon', name: 'I', icon: 'star', library: 'tabler' }] },
		})
		expect(findings.filter(f => f.rule === 'icone-fora-do-pack')).toHaveLength(1)
	})

	test('borda em gradiente (ver docs/UI-FIDELITY.md)', () => {
		const findings = lintTree({
			card: {
				type: 'frame',
				name: 'Card',
				stroke: { type: 'gradient', gradientType: 'linear', colors: [{ color: '$white-a30' }, { color: '$white-a09' }] },
			},
		})
		expect(findings.filter(f => f.rule === 'stroke-gradiente')).toHaveLength(1)
	})

	test('literal de cor onde já existe token com o mesmo valor', () => {
		const findings = lintTree(
			{ chip: { type: 'frame', name: 'Chip', fill: '#101010CC' } },
			{ 'veil-dark': { type: 'color', value: '#101010CC' } },
		)
		expect(findings.filter(f => f.rule === 'literal-com-token')).toHaveLength(1)
	})
})

describe('design-lint — o que NÃO pode ser acusado (onde as versões anteriores erravam)', () => {
	test('mesma paleta em componentes DIFERENTES: o raio é relativo à caixa, não é dialeto', () => {
		// Um botão de 45px e uma tabela de 800px precisam de multiplicadores diferentes para produzir
		// o MESMO raio absoluto. A 1ª versão da regra agrupava por paleta global e acusava isto.
		const findings = lintTree({
			tela: {
				type: 'frame',
				name: 'Tela',
				children: [
					{ type: 'ref', ref: 'q:button', name: 'Botão', fill: { ...FIELD_GRADIENT, size: { width: 1.92, height: 2.17 } } },
					{ type: 'ref', ref: 'q:table', name: 'Tabela', fill: { ...FIELD_GRADIENT, size: { width: 5.06, height: 7.07 } } },
				],
			},
		})
		expect(findings.filter(f => f.rule === 'instancias-divergentes')).toHaveLength(0)
	})

	test('variante semântica de cor no mesmo componente: Badge neutro vs danger NÃO é dialeto', () => {
		// A 2ª versão agrupava por componente e acusava Badge (neutro/accent/danger/sobre-foto) e
		// Checkbox (marcado/desmarcado). Cor diferente é INTENÇÃO.
		const findings = lintTree({
			tela: {
				type: 'frame',
				name: 'Tela',
				children: [
					{ type: 'ref', ref: 'q:badge', name: 'Neutro', fill: { ...FIELD_GRADIENT, colors: [{ color: '$white-a05' }] } },
					{ type: 'ref', ref: 'q:badge', name: 'Perigo', fill: { ...FIELD_GRADIENT, colors: [{ color: '#E5484D14' }] } },
				],
			},
		})
		expect(findings.filter(f => f.rule === 'instancias-divergentes')).toHaveLength(0)
	})

	test('divisória (strokeWidth por lado) usa vocabulário próprio, não o de borda de caixa', () => {
		const findings = lintTree({
			header: { type: 'frame', name: 'Header', stroke: '$q:white-a07', strokeWidth: { top: 1 } },
		})
		expect(findings.filter(f => f.rule === 'stroke-branco-fora-do-token')).toHaveLength(0)
	})

	test('árvore limpa não produz achado nenhum', () => {
		const findings = lintTree({
			campo: { type: 'frame', name: 'Campo', fill: FIELD_GRADIENT, stroke: '$stroke-inset', strokeWidth: 1 },
		})
		expect(findings).toHaveLength(0)
	})
})
