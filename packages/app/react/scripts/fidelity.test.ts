import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { computeScore, resolveItemPass, storyId } from './fidelity'

/**
 * Unit coverage of the score calculation ONLY — no Storybook build, no Playwright, no browser.
 * `computeScore` takes 2 (or 3) filesystem paths and is pure otherwise, so this exercises it
 * directly against two tiny synthetic PNGs built with `pngjs` (no binary fixture files to keep in
 * sync — see `tests/fixtures/bad-color-fixture.tsx` for the alternative idiom used when a SOURCE
 * fixture reads better than a generated one; a PNG has no readable source form, so generated wins).
 */

function writePng(path: string, pixels: [number, number, number, number][], width: number, height: number): void {
	const png = new PNG({ width, height })
	for (let i = 0; i < pixels.length; i++) {
		const [r, g, b, a] = pixels[i] as [number, number, number, number]
		png.data[i * 4] = r
		png.data[i * 4 + 1] = g
		png.data[i * 4 + 2] = b
		png.data[i * 4 + 3] = a
	}
	writeFileSync(path, PNG.sync.write(png))
}

describe('fidelity — storyId', () => {
	test('lowercases title + export name, joined by --, non-alphanumerics collapse to a dash', () => {
		expect(storyId('UI/Button', 'Default')).toBe('ui-button--default')
	})

	test('single-word exports are unaffected by word-splitting (masked the F3 bug for 19/35 stories)', () => {
		expect(storyId('UI/Button', 'Loading')).toBe('ui-button--loading')
	})

	test('camelCase exports split into dash-separated words, mirroring Storybook\'s real toId', () => {
		// Real regression (F3, 2026-08-24): the old `storyId` produced
		// `onboarding-screens--onboardingboasvindas` — a 404 against the real Storybook build,
		// whose actual id (confirmed in storybook-static/index.json) is
		// `onboarding-screens--onboarding-boas-vindas`.
		expect(storyId('Onboarding/Screens', 'OnboardingBoasVindas')).toBe('onboarding-screens--onboarding-boas-vindas')
		expect(storyId('UI/Button', 'AllVariants')).toBe('ui-button--all-variants')
	})

	test('a single-uppercase-letter word (e.g. an acronym) still splits at the following boundary', () => {
		expect(storyId('UI/Input', 'QrAtivo')).toBe('ui-input--qr-ativo')
	})

	test('digit boundaries split too (letter→digit and digit→letter)', () => {
		expect(storyId('UI/Wizard', 'Step2Foo')).toBe('ui-wizard--step-2-foo')
	})
})

describe('fidelity — computeScore', () => {
	test('identical 2x2 PNGs score 1 (no diff pixels)', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'fidelity-score-'))
		try {
			const pixels: [number, number, number, number][] = [
				[255, 0, 0, 255],
				[0, 255, 0, 255],
				[0, 0, 255, 255],
				[255, 255, 255, 255],
			]
			const targetPath = join(tmpRoot, 'target.png')
			const currentPath = join(tmpRoot, 'current.png')
			writePng(targetPath, pixels, 2, 2)
			writePng(currentPath, pixels, 2, 2)

			const result = computeScore(targetPath, currentPath)
			expect(result.score).toBe(1)
			expect(result.diffPixels).toBe(0)
			expect(result.totalPixels).toBe(4)
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})

	test('a fully different 2x2 PNG scores 0 and writes a non-empty delta PNG', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'fidelity-score-'))
		try {
			const targetPath = join(tmpRoot, 'target.png')
			const currentPath = join(tmpRoot, 'current.png')
			const deltaPath = join(tmpRoot, 'delta.png')
			writePng(
				targetPath,
				[
					[0, 0, 0, 255],
					[0, 0, 0, 255],
					[0, 0, 0, 255],
					[0, 0, 0, 255],
				],
				2,
				2,
			)
			writePng(
				currentPath,
				[
					[255, 255, 255, 255],
					[255, 255, 255, 255],
					[255, 255, 255, 255],
					[255, 255, 255, 255],
				],
				2,
				2,
			)

			const result = computeScore(targetPath, currentPath, deltaPath)
			expect(result.score).toBe(0)
			expect(result.diffPixels).toBe(4)
			expect(existsSync(deltaPath)).toBe(true)
			expect(readFileSync(deltaPath).length).toBeGreaterThan(0)
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})

	test('a partial diff scores strictly between 0 and 1', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'fidelity-score-'))
		try {
			const targetPath = join(tmpRoot, 'target.png')
			const currentPath = join(tmpRoot, 'current.png')
			writePng(
				targetPath,
				[
					[0, 0, 0, 255],
					[0, 0, 0, 255],
					[0, 0, 0, 255],
					[0, 0, 0, 255],
				],
				2,
				2,
			)
			// Only the last pixel differs.
			writePng(
				currentPath,
				[
					[0, 0, 0, 255],
					[0, 0, 0, 255],
					[0, 0, 0, 255],
					[255, 255, 255, 255],
				],
				2,
				2,
			)

			const result = computeScore(targetPath, currentPath)
			expect(result.score).toBeGreaterThan(0)
			expect(result.score).toBeLessThan(1)
			expect(result.diffPixels).toBe(1)
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})

	test('a dimension mismatch is treated as score 0, never a pixelmatch crash', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'fidelity-score-'))
		try {
			const targetPath = join(tmpRoot, 'target.png')
			const currentPath = join(tmpRoot, 'current.png')
			writePng(
				targetPath,
				[
					[0, 0, 0, 255],
					[0, 0, 0, 255],
					[0, 0, 0, 255],
					[0, 0, 0, 255],
				],
				2,
				2,
			)
			// 2×2 vs 1×4: width delta 1 (tolerable) but height delta 2 — past DIMENSION_TOLERANCE_PX,
			// so this is a REAL size mismatch, scored 0 without ever reaching pixelmatch (which throws
			// on unequal dimensions).
			writePng(
				currentPath,
				[
					[0, 0, 0, 255],
					[0, 0, 0, 255],
					[0, 0, 0, 255],
					[0, 0, 0, 255],
				],
				1,
				4,
			)

			expect(() => computeScore(targetPath, currentPath)).not.toThrow()
			expect(computeScore(targetPath, currentPath).score).toBe(0)
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})

	test('a 1px dimension mismatch scores over the overlapping crop, not 0 (rounding tolerance)', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'fidelity-score-'))
		try {
			const targetPath = join(tmpRoot, 'target.png')
			const currentPath = join(tmpRoot, 'current.png')
			const black: [number, number, number, number] = [0, 0, 0, 255]
			// 2×2 target vs 2×3 current, identical in the 2×2 overlap — the exact shape W1a measured
			// (badge: computed height matches, Playwright floor/ceil rounding steals 1px).
			writePng(targetPath, [black, black, black, black], 2, 2)
			writePng(currentPath, [black, black, black, black, black, black], 2, 3)

			const result = computeScore(targetPath, currentPath)
			expect(result.score).toBe(1)
			expect(result.totalPixels).toBe(4)
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})

	test('calibração: badge errado DILUI na média global mas falha o tile (a pior região manda)', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'fidelity-score-'))
		try {
			const W = 240
			const H = 240
			const bg: [number, number, number, number] = [19, 19, 19, 255]
			const badgeTarget: [number, number, number, number] = [87, 255, 172, 255] // accent
			const badgeCurrent: [number, number, number, number] = [255, 87, 87, 255] // cor errada
			const make = (badge: [number, number, number, number]) => {
				const px: [number, number, number, number][] = []
				for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px.push(x >= 10 && x < 40 && y >= 10 && y < 25 ? badge : bg)
				return px
			}
			const targetPath = join(tmpRoot, 'target.png')
			const currentPath = join(tmpRoot, 'current.png')
			writePng(targetPath, make(badgeTarget), W, H)
			writePng(currentPath, make(badgeCurrent), W, H)

			const result = computeScore(targetPath, currentPath)
			// A média global perdoa (30×15 = 0.78% do canvas)…
			expect(result.score).toBeGreaterThan(0.99)
			// …mas o tile da região do badge falha — é o caso exato dos exemplos do founder
			// (badge do ext-07, foto do ext-06): sem a lane de região, isso passava.
			expect(result.tiles.failing.length).toBeGreaterThan(0)
			expect(result.tiles.failing[0]?.x).toBe(0)
			expect(result.tiles.failing[0]?.y).toBe(0)
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})

	test('calibração: até onde a régua é cega a deslocamento — e o que ela ANOTA quando enxerga', () => {
		// Duas coisas, e a ordem importa.
		//
		// (1) O LIMITE, medido: as lanes de estrutura e cor só acusam deslocamento a partir de ~16px.
		//     Abaixo disso a régua é cega — e isso é DELIBERADO, não defeito: 4px numa tela de 1040
		//     é 0,4%, imperceptível, e transformar isso em débito produz listas que ninguém paga.
		//     Uma tentativa de fechar essa faixa com uma lane própria acendeu 105 tiles de 3-8px em
		//     18 telas e foi cortada no mesmo dia. O registro fica porque saber ONDE a régua não vê
		//     é o que mantém a revisão visual por amostragem e a sonda (`bun probe`) no processo.
		//
		// (2) O que ela FAZ com a informação: num tile que já falhou, o deslocamento vira anotação
		//     (`shiftY`) — separa "conteúdo no lugar errado" (causa: altura de um ancestral) de
		//     "conteúdo errado" (causa: propriedade do spec). Duas investigações diferentes.
		const W = 240
		const H = 240
		const bg: [number, number, number, number] = [19, 19, 19, 255]
		const ink: [number, number, number, number] = [240, 240, 240, 255]
		const render = (offset: number) => {
			const px: [number, number, number, number][] = []
			const rows = [40, 90, 140].map(r => r + offset)
			for (let y = 0; y < H; y++) {
				for (let x = 0; x < W; x++) px.push(rows.some(r => y >= r && y < r + 14) && x >= 20 && x < 200 ? ink : bg)
			}
			return px
		}
		const measure = (offset: number) => {
			const tmpRoot = mkdtempSync(join(tmpdir(), 'fidelity-score-'))
			try {
				const targetPath = join(tmpRoot, 'target.png')
				const currentPath = join(tmpRoot, 'current.png')
				writePng(targetPath, render(0), W, H)
				writePng(currentPath, render(offset), W, H)
				return computeScore(targetPath, currentPath)
			} finally {
				rmSync(tmpRoot, { recursive: true, force: true })
			}
		}

		// (1) a faixa cega — imperceptível não vira débito
		expect(measure(4).tiles.failing).toHaveLength(0)
		expect(measure(10).tiles.failing).toHaveLength(0)

		// (2) deslocamento grande falha E chega anotado com o offset medido. A busca varre até
		//     SHIFT_MAX_PX (20) — além disso a anotação satura, o que é irrelevante na prática:
		//     deslocamento maior que 20px é visível a olho nu e a causa já salta no crop.
		const grande = measure(16)
		expect(grande.tiles.failing.length).toBeGreaterThan(0)
		const anotados = grande.tiles.failing.filter(t => t.shiftY !== undefined)
		expect(anotados.length, 'tile deslocado precisa chegar com a causa provável anotada').toBeGreaterThan(0)
		expect(Math.abs(anotados[0]?.shiftY ?? 0)).toBe(16)
	})

	test('calibração: tom de fundo sutilmente errado nem conta como diff pixel — a lane de COR pega', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'fidelity-score-'))
		try {
			const W = 120
			const H = 120
			const fill = (c: [number, number, number, number]) => Array.from({ length: W * H }, () => c) as [number, number, number, number][]
			const targetPath = join(tmpRoot, 'target.png')
			const currentPath = join(tmpRoot, 'current.png')
			writePng(targetPath, fill([19, 19, 19, 255]), W, H)
			writePng(currentPath, fill([26, 26, 26, 255]), W, H) // shift de tom pequeno, área grande

			const result = computeScore(targetPath, currentPath)
			// pixelmatch não conta NADA (delta YIQ abaixo do threshold por-pixel)…
			expect(result.diffPixels).toBe(0)
			expect(result.score).toBe(1)
			// …mas o desvio de cor média do tile dispara — "coloração é algo importante também".
			expect(result.tiles.failing.length).toBeGreaterThan(0)
			expect(result.tiles.failing[0]?.reason).toBe('color')
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})

	test('a 2px dimension mismatch is past the tolerance and stays a hard 0', () => {
		const tmpRoot = mkdtempSync(join(tmpdir(), 'fidelity-score-'))
		try {
			const targetPath = join(tmpRoot, 'target.png')
			const currentPath = join(tmpRoot, 'current.png')
			const black: [number, number, number, number] = [0, 0, 0, 255]
			writePng(targetPath, [black, black, black, black], 2, 2)
			writePng(currentPath, [black, black, black, black, black, black, black, black], 2, 4)

			expect(computeScore(targetPath, currentPath).score).toBe(0)
		} finally {
			rmSync(tmpRoot, { recursive: true, force: true })
		}
	})
})

describe('fidelity — resolveItemPass (congelamento do founder, "PASS até segunda ordem", F3 2026-08-24)', () => {
	test('item fora de ITEM_PASS mantém o comportamento atual: passing segue o gate já calculado', () => {
		expect(resolveItemPass(undefined, true)).toEqual({ passing: true })
		expect(resolveItemPass(undefined, false)).toEqual({ passing: false })
	})

	test('item presente em ITEM_PASS vira passing:true mesmo com o gate normal reprovado, marcado frozen + why', () => {
		const frozen = { why: 'congelado pelo founder em 2026-08-24 — tela não deve ser alterada até segunda ordem' }

		const result = resolveItemPass(frozen, false)

		expect(result).toEqual({ passing: true, frozen: true, frozenWhy: frozen.why })
	})

	test('congelamento não esconde o que já foi medido: score/tiles/rawInteractive continuam no entry ao lado de passing:true (uma tela de kind screens, gate reprovado)', () => {
		// Simula a construção do scoreboard entry como main() faz: score, tiles e rawInteractive são
		// medidos ANTES do gate decidir `passing` — resolveItemPass só decide `passing`/`frozen`/
		// `frozenWhy`, nunca os campos já medidos. Um item de kind 'screens' presente em ITEM_PASS
		// com 3 tiles falhando e 1 controle interativo cru continua reportando os três junto do PASS.
		const measured = {
			kind: 'screens' as const,
			score: 0.42,
			failingTiles: 3,
			tileFails: [{ x: 0, y: 0, score: 0.1, colorDelta: 40, reason: 'diff' as const }],
			rawInteractive: ['button: Enviar'],
		}
		const frozen = { why: 'congelado pelo founder — tela de threads não deve mudar até segunda ordem' }
		const gateWouldFail = false // score 0.42 < threshold, tiles falhando, audit cru

		const { passing, frozen: isFrozen, frozenWhy } = resolveItemPass(frozen, gateWouldFail)
		const entry = { ...measured, passing, ...(isFrozen ? { frozen: isFrozen, frozenWhy } : {}) }

		expect(entry.passing).toBe(true)
		expect(entry.frozen).toBe(true)
		expect(entry.frozenWhy).toBe(frozen.why)
		expect(entry.score).toBe(0.42)
		expect(entry.failingTiles).toBe(3)
		expect(entry.tileFails).toHaveLength(1)
		expect(entry.rawInteractive).toEqual(['button: Enviar'])
	})
})
