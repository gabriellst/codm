import type { Page, Locator, CDPSession } from 'playwright'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── Cursor assets ──────────────────────────────────────────

type CursorType = 'default' | 'pointer' | 'text' | 'notAllowed'

const CURSOR_FILES: Record<CursorType, string> = {
	default: 'default',
	pointer: 'handpointing',
	text: 'textcursor',
	notAllowed: 'notallowed',
}

const CURSOR_ORIGINS: Record<CursorType, [number, number]> = {
	default: [4, 2],
	pointer: [12, 4],
	text: [14, 14],
	notAllowed: [14, 14],
}

const CURSOR_SELECTORS: Record<CursorType, string> = {
	text: 'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, [role="textbox"], [role="searchbox"], [contenteditable="true"]',
	notAllowed: '[disabled], [aria-disabled="true"]',
	pointer:
		'a, button, [role="button"], [role="option"], [role="combobox"], [role="tab"], [role="link"], [role="menuitem"], [role="listitem"], [role="gridcell"], [data-slot="select-trigger"], label[for]',
	default: '',
}

function loadSvg(name: string): string {
	const dir = new URL('.', import.meta.url).pathname
	return `data:image/svg+xml,${encodeURIComponent(readFileSync(join(dir, '..', 'assets', 'cursors', `${name}.svg`), 'utf-8'))}`
}

// ── Humanization helpers ───────────────────────────────────

/** Random jitter in range [-amount, +amount] */
function jitter(amount: number): number {
	return (Math.random() - 0.5) * 2 * amount
}

/** Random value between min and max */
function rand(min: number, max: number): number {
	return min + Math.random() * (max - min)
}

/** Smooth ease-in-out — no discontinuities, no jitter in the easing itself */
function humanEase(t: number): number {
	// Quadratic ease-in-out: smooth acceleration and deceleration
	return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
}

// ── Bezier movement ────────────────────────────────────────

function generatePath(fromX: number, fromY: number, toX: number, toY: number, steps: number): [number, number][] {
	const dist = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2)

	// Arc: perpendicular offset scales with distance, max ~15deg deflection
	// tan(15deg) ≈ 0.27 — control point offset perpendicular to the line
	const maxArc = dist * 0.27
	const arcAmount = Math.min(dist * rand(0.08, 0.2), maxArc)
	const side = Math.random() > 0.5 ? 1 : -1
	// Perpendicular direction to the movement vector
	const dx = toX - fromX
	const dy = toY - fromY
	const perpX = -dy / (dist || 1)
	const perpY = dx / (dist || 1)
	// Skew the control point off-center (30-70% along the line)
	const along = rand(0.3, 0.7)
	const ctrlX = fromX + dx * along + perpX * arcAmount * side
	const ctrlY = fromY + dy * along + perpY * arcAmount * side

	// Pre-compute raw bezier points to derive velocity.
	//
	// `t` é UNIFORME aqui de propósito: o easing saiu da distribuição dos pontos e foi para o RELÓGIO
	// (ver `cdpMoveTo`). Quando ele morava aqui, as pontas da curva tinham dezenas de pontos
	// sub-pixel — e como cada ponto era um evento CDP aguardado, o fim de todo movimento rastejava
	// pagando um round-trip por 1-2px. Geometria descreve ONDE o cursor passa; QUANDO ele passa é do
	// laço de tempo.
	const raw: [number, number][] = []
	for (let i = 1; i <= steps; i++) {
		const t = i / steps
		const x = (1 - t) ** 2 * fromX + 2 * (1 - t) * t * ctrlX + t ** 2 * toX
		const y = (1 - t) ** 2 * fromY + 2 * (1 - t) * t * ctrlY + t ** 2 * toY
		raw.push([x, y])
	}

	// Add velocity-proportional wobble (no twitching at start/end)
	const points: [number, number][] = []
	for (let i = 0; i < raw.length; i++) {
		const [x, y] = raw[i]
		const prev = i > 0 ? raw[i - 1] : [fromX, fromY]
		const velocity = Math.sqrt((x - prev[0]) ** 2 + (y - prev[1]) ** 2)
		// Subtle wobble — proportional to velocity but capped low
		const wobble = Math.min(velocity * 0.06, 0.8)
		points.push([x + jitter(wobble), y + jitter(wobble)])
	}
	return points
}

// ── Circulate animation ────────────────────────────────────

/** Strategy 6: Circle around element, blending from current position onto the orbit */
async function circulate(
	cdp: CDPSession,
	centerX: number,
	centerY: number,
	startX: number,
	startY: number,
	radius: number,
	durationMs = 900,
) {
	const startAngle = Math.atan2(startY - centerY, startX - centerX)
	const steps = Math.round(durationMs / 8)
	const blendSteps = Math.round(steps * 0.2) // first 20% blends onto the circle

	for (let i = 0; i <= steps; i++) {
		const t = i / steps
		// Ease-in-out angular progress
		const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
		const angle = startAngle + eased * Math.PI * 2
		const r = radius + Math.sin(eased * Math.PI * 4) * 2

		// Target point on the circle
		const circleX = centerX + Math.cos(angle) * r
		const circleY = centerY + Math.sin(angle) * r

		// Blend: lerp from actual start position onto the circle over first 20%
		let x: number, y: number
		if (i < blendSteps) {
			const blend = i / blendSteps // 0→1 over blend phase
			const smoothBlend = blend * blend * (3 - 2 * blend) // smoothstep
			x = startX + (circleX - startX) * smoothBlend
			y = startY + (circleY - startY) * smoothBlend
		} else {
			x = circleX
			y = circleY
		}

		// Fire-and-forget pela mesma razão do `cdpMoveTo`: um `await` por passo somava o round-trip do
		// canal (compartilhado com os snapshots) aos 8ms, e a órbita de 900ms declarados levava 2-3×
		// isso em página pesada. O flush aguardado abaixo cobre a ordem.
		cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) }).catch(() => undefined)
		await new Promise(resolve => setTimeout(resolve, 8))
	}
	// Ack em ordem por conexão: aguardar o último evento garante que a órbita inteira foi processada.
	await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(startX), y: Math.round(startY) })
}

// ── CDP helpers ────────────────────────────────────────────

/**
 * O RITMO DE UMA DEMO, como PARÂMETRO — cada jornada escolhe o seu.
 *
 * Um smoke de PR quer ser rápido; um tour de produto quer respirar entre as batidas. O ritmo era sete
 * literais `rand(…)` espalhados por três funções, e o custo só apareceu quando a trilha foi medida.
 *
 * Os defaults abaixo são os MEDIDOS pela família: 16ms/tecla ainda LÊ como digitação (um caractere por
 * quadro a 60fps); ~70ms de pausa ainda lê como intenção; 1,6 px/ms é mão decidida — e o que a máquina
 * entrega de fato aparece na trilha (`cursor.json`), nunca só no número pedido. Os `rand(…)` derivam
 * destes três para o vídeo não ficar metronômico — a ESCALA mora num lugar só, e uma jornada que
 * queira outra passa `createDemoCursor(page, { pace: { … } })` em vez de esperar que alguém recalibre
 * constantes de módulo para todos.
 */
export interface CursorPace {
	/** Velocidade de deslocamento entre alvos, em px/ms. */
	speedPxPerMs: number
	/** Pausa-base dos gestos (antes/depois de clique, pós-digitação) — os `rand(…)` derivam dela. */
	gesturePauseMs: number
	/** Atraso por tecla na digitação. */
	typingMsPerChar: number
}

export const DEFAULT_PACE: CursorPace = {
	speedPxPerMs: 1.6,
	gesturePauseMs: 70,
	typingMsPerChar: 16,
}

/**
 * Um evento de mouse por QUADRO CAPTURADO (60fps ⇒ 16ms). Emitir mais denso que a captura é
 * literalmente invisível — não existe quadro entre dois ticks para registrar o ponto intermediário.
 */
const MOVE_TICK_MS = 16
/** Piso de duração: um empurrãozinho ainda ANIMA (alguns quadros) em vez de teleportar. */
const MIN_MOVE_MS = 120

/**
 * O MOVIMENTO É UMA ANIMAÇÃO: posição amostrada pelo TEMPO, não uma rajada de eventos por distância.
 *
 * A forma anterior emitia um evento AGUARDADO a cada N pixels do caminho, e degradava com o peso da
 * página — MEDIDO na trilha gravada pela família: o MESMO gesto fazia 1,36 px/ms na tela de login e
 * 0,26 px/ms na tela de conta, 5× mais lento, com a captura uniforme (não era o gravador). A causa é o
 * TRANSPORTE: todas as sessões CDP dividem um websocket, e a 60fps de captura o recorder despeja
 * ~34 MB/s de DOMSnapshot nesse canal. O ack de cada `Input.dispatchMouseEvent` esperava atrás dos
 * snapshots — ~9ms/passo na página leve, ~47ms/passo na pesada — e o easing na densidade dos pontos
 * punha DEZENAS de passos sub-pixel nas pontas de cada gesto, cada um pagando o round-trip inteiro. O
 * rastejo final era o produto dos dois.
 *
 * Medido NESTE repositório antes do porte: 258 px/s de mediana no filme, com 39% dos quadros gastos
 * em deslocamento — 27 dos 71 segundos eram o ponteiro rastejando entre alvos.
 *
 * Três decisões, um desenho:
 *   · UM evento por tick de quadro — o teto de eventos vem da captura, não da distância, então uma
 *     página pesada não multiplica idas ao browser;
 *   · o easing vive no RELÓGIO (`humanEase` sobre o progresso no tempo), não na densidade de pontos —
 *     a desaceleração humana fica, o enxame de eventos sub-pixel morre;
 *   · FIRE-AND-FORGET nos eventos intermediários: o CDP processa em ordem por conexão, então aguardar
 *     só o ÚLTIMO evento garante que todos os anteriores chegaram — o trânsito do canal sai do caminho
 *     crítico, e a velocidade declarada vira realidade em vez de aspiração.
 */
async function cdpMoveTo(cdp: CDPSession, fromX: number, fromY: number, toX: number, toY: number, speedPxPerMs: number) {
	const dist = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2)
	if (dist < 1) return
	const durationMs = Math.max(MIN_MOVE_MS, dist / speedPxPerMs)
	// Geometria densa e barata (nenhum I/O por ponto): o laço de tempo amostra dela.
	const points = generatePath(fromX, fromY, toX, toY, Math.max(32, Math.round(dist / 8)))

	const startedAt = performance.now()
	let lastIndex = -1
	while (true) {
		const progress = Math.min(1, (performance.now() - startedAt) / durationMs)
		const index = Math.min(points.length - 1, Math.round(humanEase(progress) * (points.length - 1)))
		if (index > lastIndex) {
			const [x, y] = points[index] as [number, number]
			cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) }).catch(() => undefined)
			lastIndex = index
		}
		if (progress >= 1) break
		await new Promise(r => setTimeout(r, MOVE_TICK_MS))
	}
	// O flush: aguardado, e pousando EXATAMENTE no destino (os pontos carregam wobble; o clique que
	// vem em seguida precisa do cursor onde a mira calculou). O ack deste implica os anteriores.
	await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(toX), y: Math.round(toY) })
}

async function cdpClick(cdp: CDPSession, x: number, y: number) {
	await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 })
	await new Promise(r => setTimeout(r, rand(60, 100)))
	await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 })
}

// ── Click target positioning ───────────────────────────────

interface ClickTarget {
	x: number
	y: number
}

/** Click target for pointer-style elements (buttons, options, links).
 *  Offsets by pointer cursor origin so the visual finger tip lands on target.
 *
 *  CLAMPED to the box, minus a small margin. The bias/origin/jitter arithmetic below was tuned
 *  against ordinary text buttons (100px+ wide), where subtracting `originX` (the pointer hotspot
 *  offset) and adding up to ±10px of jitter still lands comfortably inside. On a ~40px-wide target,
 *  `horizontalBias` (10-18px) minus `originX` (12px) plus jitter can go NEGATIVE — the computed point
 *  lands to the LEFT of the element and the click silently hits whatever is behind it (no error: it
 *  still lands on *something*, just not the target). Found independently twice in this family: an
 *  icon-only `IconButton` in bk-products, and this repo's own "Chat" tab, whose demo never navigated.
 *  The clamp keeps the human-like spread for wide elements (where it never engages) while guaranteeing
 *  the point stays on narrow ones. */
function getClickPoint(box: { x: number; y: number; width: number; height: number }): ClickTarget {
	const [originX, originY] = CURSOR_ORIGINS.pointer
	const horizontalBias = Math.min(box.width * rand(0.25, 0.45), 80)
	const margin = Math.min(4, box.width / 4)
	const rawX = box.x + horizontalBias - originX + jitter(10)
	const x = Math.min(Math.max(rawX, box.x + margin), box.x + box.width - margin)
	return {
		x: Math.round(x),
		y: Math.round(box.y + box.height / 2 - originY + jitter(2)),
	}
}

/** Click target for text-style elements (inputs, textareas, comboboxes).
 *  Horizontal range adapts to input width so the cursor doesn't cover text:
 *  - Wide inputs (400px+): 10-45%, skewed left
 *  - Narrow inputs (~100px): 60-80%, centered */
function getInputClickPoint(box: { x: number; y: number; width: number; height: number }): ClickTarget {
	const [originX, originY] = CURSOR_ORIGINS.text
	// Lerp distribution range based on width: wide (400+) → [0.10, 0.45], narrow (100-) → [0.60, 0.80]
	const t = Math.min(Math.max((box.width - 100) / 300, 0), 1) // 0 at 100px, 1 at 400px
	const minPct = 0.6 + (0.2 - 0.6) * t // narrow: 0.60, wide: 0.20
	const maxPct = 0.8 + (0.45 - 0.8) * t // narrow: 0.80, wide: 0.45
	const skewed = minPct + Math.random() ** 2 * (maxPct - minPct)
	return {
		x: Math.round(box.x + box.width * skewed - originX),
		y: Math.round(box.y + box.height / 2 - originY + jitter(1)),
	}
}

// ── Public API ─────────────────────────────────────────────

export interface ClickOptions {
	/** Strategy 6: circulate around the element before clicking */
	circulate?: boolean
	/** Circulate radius in px (default: element width * 0.4) */
	circulateRadius?: number
}

export async function createDemoCursor(page: Page, options?: { pace?: Partial<CursorPace> }) {
	const pace: CursorPace = { ...DEFAULT_PACE, ...options?.pace }
	await installOverlay(page)
	page.on('load', async () => {
		try {
			await installOverlay(page)
		} catch {}
	})

	const cdp = await page.context().newCDPSession(page)
	let lastX = 960
	let lastY = 540

	page.on('console', msg => {
		const text = msg.text()
		if (text.startsWith('[cursor-pos]')) {
			const parts = text.split(' ')
			lastX = Number.parseFloat(parts[1])
			lastY = Number.parseFloat(parts[2])
		}
	})

	return {
		/** Smoothly move to element and click */
		async click(locator: Locator, options?: ClickOptions) {
			await locator.scrollIntoViewIfNeeded()
			const box = await locator.boundingBox()
			if (!box) {
				await locator.click()
				return
			}

			// Detect if target is input-like (combobox, text input, etc.)
			const isInputLike = await locator.evaluate((el, sel) => el.matches(sel), CURSOR_SELECTORS.text).catch(() => false)

			const target = isInputLike ? getInputClickPoint(box) : getClickPoint(box)

			await cdpMoveTo(cdp, lastX, lastY, target.x, target.y, pace.speedPxPerMs)
			lastX = target.x
			lastY = target.y

			// Strategy 6: optional circulate — starts from where cursor already is
			if (options?.circulate) {
				const radius = options.circulateRadius ?? Math.min(box.width * 0.4, 40)
				await circulate(cdp, box.x + box.width / 2, box.y + box.height / 2, lastX, lastY, radius)
				// Return to click point after circling
				await cdpMoveTo(cdp, lastX, lastY, target.x, target.y, pace.speedPxPerMs)
			}

			// Strategy 2: buttons get longer hover (they trigger actions)
			const isButton = !isInputLike && (await locator.evaluate(el => el.matches('button, [role="button"]')).catch(() => false))
			await new Promise(r =>
				setTimeout(
					r,
					isButton ? rand(pace.gesturePauseMs, pace.gesturePauseMs * 1.6) : rand(pace.gesturePauseMs * 0.6, pace.gesturePauseMs),
				),
			)

			await cdpClick(cdp, target.x, target.y)
			await new Promise(r => setTimeout(r, rand(pace.gesturePauseMs * 0.8, pace.gesturePauseMs * 1.3)))
		},

		/** Smoothly move to input, click, then fill */
		async fill(locator: Locator, text: string) {
			await locator.scrollIntoViewIfNeeded()
			const box = await locator.boundingBox()
			if (box) {
				const target = getInputClickPoint(box)
				await cdpMoveTo(cdp, lastX, lastY, target.x, target.y, pace.speedPxPerMs)
				lastX = target.x
				lastY = target.y
				await new Promise(r => setTimeout(r, rand(pace.gesturePauseMs * 0.6, pace.gesturePauseMs)))
				await cdpClick(cdp, target.x, target.y)
				await new Promise(r => setTimeout(r, rand(pace.gesturePauseMs * 0.8, pace.gesturePauseMs * 1.3)))
			}
			await locator.pressSequentially(text, { delay: rand(pace.typingMsPerChar * 0.8, pace.typingMsPerChar * 1.4) })
			await new Promise(r => setTimeout(r, rand(pace.gesturePauseMs * 0.8, pace.gesturePauseMs * 1.3)))
		},

		/** Smoothly move to input, click, then type char by char */
		async type(locator: Locator, text: string, delay?: number) {
			await locator.scrollIntoViewIfNeeded()
			const box = await locator.boundingBox()
			if (box) {
				const target = getInputClickPoint(box)
				await cdpMoveTo(cdp, lastX, lastY, target.x, target.y, pace.speedPxPerMs)
				lastX = target.x
				lastY = target.y
				await new Promise(r => setTimeout(r, rand(pace.gesturePauseMs * 0.6, pace.gesturePauseMs)))
				await cdpClick(cdp, target.x, target.y)
				await new Promise(r => setTimeout(r, rand(pace.gesturePauseMs * 0.8, pace.gesturePauseMs * 1.3)))
			}
			await locator.pressSequentially(text, { delay: (delay ?? pace.typingMsPerChar) + jitter(6) })
			await new Promise(r => setTimeout(r, rand(pace.gesturePauseMs * 0.8, pace.gesturePauseMs * 1.3)))
		},
	}
}

// ── Overlay ────────────────────────────────────────────────

async function installOverlay(page: Page) {
	const cursors = Object.fromEntries(
		Object.entries(CURSOR_FILES).map(([type, file]) => [
			type,
			{ svg: loadSvg(file), originX: CURSOR_ORIGINS[type as CursorType][0], originY: CURSOR_ORIGINS[type as CursorType][1] },
		]),
	)

	await page.evaluate(
		({ cursors, selectors }) => {
			if (document.getElementById('demo-cursor')) return

			const el = document.createElement('img')
			el.id = 'demo-cursor'
			el.src = cursors.default.svg
			el.style.cssText = `
      position:fixed; top:-50px; left:-50px; z-index:999999;
      pointer-events:none; width:32px; height:32px;
      filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3));
    `
			el.style.transformOrigin = `${cursors.default.originX}px ${cursors.default.originY}px`
			document.body.appendChild(el)
			document.head.appendChild(Object.assign(document.createElement('style'), { textContent: '* { cursor: none !important; }' }))

			const priority: string[] = ['notAllowed', 'text', 'pointer']
			let currentType = 'default'

			document.addEventListener('mousemove', e => {
				el.style.left = `${e.clientX}px`
				el.style.top = `${e.clientY}px`
				console.log(`[cursor-pos] ${e.clientX} ${e.clientY}`)

				const target = document.elementFromPoint(e.clientX, e.clientY)
				if (!target) return
				let newType = 'default'
				for (const type of priority) {
					const sel = selectors[type as keyof typeof selectors]
					if (sel && target.closest(sel)) {
						newType = type
						break
					}
				}
				if (newType !== currentType) {
					currentType = newType
					const c = cursors[newType as keyof typeof cursors]
					el.src = c.svg
					el.style.transformOrigin = `${c.originX}px ${c.originY}px`
				}
			})

			document.addEventListener('mousedown', () => {
				el.style.transform = 'scale(0.85)'
			})
			document.addEventListener('mouseup', () => {
				el.style.transform = 'scale(1)'
			})
		},
		{ cursors, selectors: CURSOR_SELECTORS },
	)
}
