// packages/app/react/scripts/design-lint.ts — o design auditado CONTRA SI MESMO, antes do código pagar.
//
// Por que existe (retro de 2026-08-22, docs/UI-FIDELITY.md "Como começar num projeto novo"): os
// retrabalhos mais caros desta fase não vieram de código errado — vieram de código correto contra
// um design que ainda não tinha decidido. A linguagem de borda teve TRÊS implementações; o fundo de
// campo acumulou QUATRO dialetos equivalentes (o gradiente do componente a 100%, o mesmo com
// `opacity:0.6`, um radial de raio menor, e até o linear do Card) e o código replicou dois deles
// antes de alguém notar. Nada apontava a divergência: ela só apareceu quando a lane de cor da régua
// mediu 33 onde o alvo pintava 26 — semanas depois.
//
// Este lint fecha essa janela. Roda sobre os specs JSON COMMITADOS (`design/system/pen/**`), então
// não precisa do Pen aberto nem do MCP: entra na bateria como qualquer outro gate.
//
// O que ele NÃO é: um juiz de gosto. Cada detector abaixo existe porque a divergência que ele acha
// JÁ custou retrabalho medido, e cada um aponta um lugar onde o design contradiz o próprio design —
// nunca onde o design contradiz a opinião de quem lê.
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DESIGN_ROOT = join(import.meta.dir, '..', '..', '..', '..', 'design', 'system', 'pen')

export interface Finding {
	rule: string
	severity: 'error' | 'warn'
	where: string
	detail: string
}

type PenNode = Record<string, unknown> & { children?: PenNode[] }

/** Percorre a árvore de um spec, entregando cada nó com o caminho de nomes até ele. */
function walk(node: PenNode, path: string, visit: (n: PenNode, where: string) => void): void {
	const name = typeof node.name === 'string' ? node.name : ((node.type as string) ?? '?')
	const here = path ? `${path} › ${name}` : name
	visit(node, here)
	for (const child of node.children ?? []) walk(child, here, visit)
}

function loadSpecs(dir: string, designRoot: string = DESIGN_ROOT): { slug: string; root: PenNode }[] {
	const full = join(designRoot, dir)
	if (!existsSync(full)) return []
	return readdirSync(full)
		.filter(f => f.endsWith('.json'))
		.map(f => ({ slug: `${dir}/${f.replace(/\.json$/, '')}`, root: JSON.parse(readFileSync(join(full, f), 'utf8')) as PenNode }))
}

/** Assinatura canônica de um gradiente: o que o distingue VISUALMENTE, sem ruído de ordem. */
function gradientSignature(fill: Record<string, unknown>): string {
	const colors = ((fill.colors as { color?: string }[] | undefined) ?? []).map(c => c.color ?? '?').join('→')
	const size = JSON.stringify(fill.size ?? {})
	const center = JSON.stringify(fill.center ?? {})
	return `${fill.gradientType as string}|${colors}|${size}|${center}|rot=${fill.rotation ?? 0}`
}

function isGradient(fill: unknown): fill is Record<string, unknown> {
	return typeof fill === 'object' && fill !== null && (fill as { type?: string }).type === 'gradient'
}

/**
 * R1 — `opacity` no NÓ em vez de alpha no fill.
 *
 * O CSS não tem equivalente direto: `opacity` numa caixa afeta o conteúdo inteiro, não só o fundo,
 * então quem implementa ou ignora (fundo claro demais — o caso medido) ou embrulha num pseudo-
 * elemento que ninguém pediu. A forma canônica é o alpha pré-multiplicado nas cores do próprio
 * gradiente, com o nó opaco.
 */
function ruleOpacityOnFill(specs: { slug: string; root: PenNode }[]): Finding[] {
	const out: Finding[] = []
	for (const { slug, root } of specs) {
		walk(root, '', (node, where) => {
			const fill = node.fill
			if (!isGradient(fill)) return
			const opacity = fill.opacity
			if (typeof opacity === 'number' && opacity !== 1) {
				out.push({
					rule: 'opacity-no-no',
					severity: 'error',
					where: `${slug} › ${where}`,
					detail: `fill com opacity=${opacity} — pré-multiplique no alpha das cores e deixe o nó opaco (cânon 29)`,
				})
			}
		})
	}
	return out
}

/**
 * R2 — dialetos: a MESMA superfície do MESMO componente pintada de formas diferentes.
 *
 * Esta regra levou duas correções, e as duas foram informativas — ficam registradas porque são o
 * que separa detector de ruído:
 *
 * 1ª versão, agrupando por PALETA em todo o design: falso positivo estruturado. O `size` de um
 *    radial no Pencil é RELATIVO à caixa, então um botão de 45px e uma tabela de 800px PRECISAM de
 *    multiplicadores diferentes para o mesmo raio absoluto. Mesma paleta ≠ mesma superfície.
 * 2ª versão, agrupando por COMPONENTE: falso positivo semântico. Badge tem variante neutra, accent,
 *    danger e sobre-foto; Checkbox tem marcado e desmarcado. Cor diferente é INTENÇÃO, não dialeto.
 *
 * O discriminador que sobrou é exato, e descreve o defeito real: dentro do mesmo componente, a
 * mesma PALETA aparecendo com geometrias ou opacidades diferentes. Foi assim que o campo acumulou o
 * gradiente cheio, o mesmo a 0.6 e um radial de raio menor — mesma intenção visual, três execuções.
 * Cor diferente passa livre; cor igual pintada diferente é o que se cobra.
 */
function ruleGradientDialects(specs: { slug: string; root: PenNode }[]): Finding[] {
	const byRefPalette = new Map<string, Map<string, string[]>>()
	for (const { slug, root } of specs) {
		walk(root, '', (node, where) => {
			const ref = node.ref
			const fill = node.fill
			if (typeof ref !== 'string' || !isGradient(fill)) return
			const palette = ((fill.colors as { color?: string }[] | undefined) ?? []).map(c => c.color ?? '?').join('→')
			const geometry = `${gradientSignature(fill)}|op=${fill.opacity ?? 1}`
			const key = `${ref} · ${palette}`
			const forKey = byRefPalette.get(key) ?? new Map<string, string[]>()
			forKey.set(geometry, [...(forKey.get(geometry) ?? []), `${slug} › ${where}`])
			byRefPalette.set(key, forKey)
		})
	}
	const out: Finding[] = []
	for (const [key, geometries] of byRefPalette) {
		if (geometries.size <= 1) continue
		const variants = [...geometries.entries()]
			.sort((a, b) => b[1].length - a[1].length)
			.map(([geo, sites]) => `\n      · ${geo}  (${sites.length}×, ex.: ${sites[0]})`)
			.join('')
		out.push({
			rule: 'instancias-divergentes',
			severity: 'error',
			where: key,
			detail: `mesma paleta com ${geometries.size} execuções — colapse numa forma única:${variants}`,
		})
	}
	return out
}

/**
 * R3 — cor literal onde existe token equivalente.
 *
 * Literal não é proibido (o spec às vezes dá valor cru de propósito), mas literal que JÁ TEM token
 * é dialeto: o dia em que o token mudar, o literal fica para trás em silêncio.
 */
function ruleLiteralWithToken(specs: { slug: string; root: PenNode }[], tokens: Record<string, string>): Finding[] {
	const byValue = new Map<string, string>()
	for (const [name, value] of Object.entries(tokens)) if (!byValue.has(value.toUpperCase())) byValue.set(value.toUpperCase(), name)
	const out: Finding[] = []
	for (const { slug, root } of specs) {
		walk(root, '', (node, where) => {
			const fill = node.fill
			if (typeof fill !== 'string' || fill.startsWith('$')) return
			const token = byValue.get(fill.toUpperCase())
			if (token) {
				out.push({
					rule: 'literal-com-token',
					severity: 'warn',
					where: `${slug} › ${where}`,
					detail: `fill literal ${fill} — existe o token $${token} com o mesmo valor`,
				})
			}
		})
	}
	return out
}

/**
 * R4 — ícone de biblioteca estranha, ou nome que o pack renomeou.
 *
 * Medido: `icon:"home"` sobreviveu num pack lucide que já o havia renomeado para `house`, e TODAS as
 * telas web exportaram um círculo com "?" no lugar do glifo — por semanas, sem ninguém notar, porque
 * o defeito estava no ALVO. A lista de renomeados cresce conforme aparecem.
 */
const RENAMED_ICONS: Record<string, string> = { home: 'house' }

function ruleIcons(specs: { slug: string; root: PenNode }[]): Finding[] {
	const out: Finding[] = []
	for (const { slug, root } of specs) {
		walk(root, '', (node, where) => {
			const icon = node.icon
			if (typeof icon !== 'string') return
			const library = node.library
			if (typeof library === 'string' && library !== 'lucide') {
				out.push({
					rule: 'icone-fora-do-pack',
					severity: 'error',
					where: `${slug} › ${where}`,
					detail: `library="${library}" — lucide é a biblioteca canônica`,
				})
			}
			const renamed = RENAMED_ICONS[icon]
			if (renamed) {
				out.push({
					rule: 'icone-renomeado',
					severity: 'error',
					where: `${slug} › ${where}`,
					detail: `icon="${icon}" não existe mais no pack (virou "${renamed}") — exporta como "?" sem avisar`,
				})
			}
		})
	}
	return out
}

/**
 * R5 — stroke divergente: cor de borda fora do vocabulário decidido.
 *
 * A linguagem de borda é chapada e tem UM vocabulário (`$stroke-inset` / `$stroke-inset-low`, mais
 * as cores semânticas de estado). Qualquer outra coisa é a era anterior sobrevivendo — foi assim
 * que 485 strokes precisaram de normalização em massa depois que o código já os replicava.
 */
/** Só o branco-com-alpha é vocabulário de borda de CAIXA; cor de estado (danger/warning/accent
 *  com tint) é semântica e legítima como literal. */
const STROKE_BOX_TOKEN = /^\$(q:)?stroke-inset(-low)?$/
const STROKE_WHITE_LITERAL = /^#FFFFFF[0-9A-F]{2}$/i

function ruleStrokeVocabulary(specs: { slug: string; root: PenNode }[]): Finding[] {
	const out: Finding[] = []
	for (const { slug, root } of specs) {
		walk(root, '', (node, where) => {
			const stroke = node.stroke
			if (stroke == null) return
			if (isGradient(stroke)) {
				out.push({
					rule: 'stroke-gradiente',
					severity: 'error',
					where: `${slug} › ${where}`,
					detail: 'borda em gradiente foi ABOLIDA — use $stroke-inset (ver docs/UI-FIDELITY.md)',
				})
				return
			}
			if (typeof stroke !== 'string' || STROKE_BOX_TOKEN.test(stroke)) return
			// `strokeWidth` por LADO (`{top:1}`) é divisória, não borda de caixa — vocabulário próprio.
			if (typeof node.strokeWidth === 'object' && node.strokeWidth !== null) return
			// Branco com alpha É borda de caixa: se não é o token, é a era pré-flat sobrevivendo.
			// (`#FFFFFF00` é transparente deliberado — remover borda sem remover o nó.)
			if (STROKE_WHITE_LITERAL.test(stroke) && !/00$/i.test(stroke)) {
				out.push({
					rule: 'stroke-branco-fora-do-token',
					severity: 'warn',
					where: `${slug} › ${where}`,
					detail: `stroke="${stroke}" — borda de caixa usa $stroke-inset / $stroke-inset-low`,
				})
			}
			if (stroke.startsWith('$') && /white-a\d+/.test(stroke)) {
				out.push({
					rule: 'stroke-branco-fora-do-token',
					severity: 'warn',
					where: `${slug} › ${where}`,
					detail: `stroke="${stroke}" — borda de caixa usa $stroke-inset / $stroke-inset-low`,
				})
			}
		})
	}
	return out
}

/** `designRoot` existe para o falseador: o teste aponta para uma árvore sintética com os defeitos
 *  conhecidos e exige que cada regra os PEGUE — régua que ninguém falseou não vale como gate. */
export function runDesignLint(designRoot: string = DESIGN_ROOT): Finding[] {
	const specs = [...loadSpecs('components', designRoot), ...loadSpecs('screens', designRoot)]
	if (specs.length === 0) return []
	const tokensPath = join(designRoot, 'tokens.json')
	const raw = existsSync(tokensPath)
		? (JSON.parse(readFileSync(tokensPath, 'utf8')) as { variables?: Record<string, { value?: string }> })
		: {}
	const tokens: Record<string, string> = {}
	for (const [name, def] of Object.entries(raw.variables ?? {}))
		if (typeof def?.value === 'string' && def.value.startsWith('#')) tokens[name] = def.value
	return [
		...ruleOpacityOnFill(specs),
		...ruleGradientDialects(specs),
		...ruleLiteralWithToken(specs, tokens),
		...ruleIcons(specs),
		...ruleStrokeVocabulary(specs),
	]
}

if (import.meta.main) {
	const findings = runDesignLint()
	const errors = findings.filter(f => f.severity === 'error')
	const warns = findings.filter(f => f.severity === 'warn')
	const byRule = new Map<string, Finding[]>()
	for (const f of findings) byRule.set(f.rule, [...(byRule.get(f.rule) ?? []), f])

	for (const [rule, list] of byRule) {
		const mark = list[0]?.severity === 'error' ? '✗' : '!'
		console.log(`\n${mark} ${rule} (${list.length})`)
		for (const f of list.slice(0, 12)) console.log(`    ${f.where}\n      ${f.detail}`)
		if (list.length > 12) console.log(`    … e mais ${list.length - 12}`)
	}
	console.log(`\ndesign-lint: ${errors.length} erro(s), ${warns.length} aviso(s)`)
	if (errors.length > 0) process.exit(1)
}
