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

	// Pre-compute raw bezier points to derive velocity
	const raw: [number, number][] = []
	for (let i = 1; i <= steps; i++) {
		const t = i / steps
		const ease = humanEase(t)
		const x = (1 - ease) ** 2 * fromX + 2 * (1 - ease) * ease * ctrlX + ease ** 2 * toX
		const y = (1 - ease) ** 2 * fromY + 2 * (1 - ease) * ease * ctrlY + ease ** 2 * toY
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

		await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) })
		await new Promise(resolve => setTimeout(resolve, 8))
	}
}

// ── CDP helpers ────────────────────────────────────────────

async function cdpMoveTo(cdp: CDPSession, fromX: number, fromY: number, toX: number, toY: number) {
	const dist = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2)
	// Enough steps so each jump is ~3-5px max — smooth even on long moves
	const steps = Math.max(50, Math.round(dist / 4))
	const points = generatePath(fromX, fromY, toX, toY, steps)
	for (const [x, y] of points) {
		await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) })
		await new Promise(r => setTimeout(r, rand(8, 14)))
	}
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
 *  Offsets by pointer cursor origin so the visual finger tip lands on target. */
function getClickPoint(box: { x: number; y: number; width: number; height: number }): ClickTarget {
	const [originX, originY] = CURSOR_ORIGINS.pointer
	const horizontalBias = Math.min(box.width * rand(0.25, 0.45), 80)
	return {
		x: Math.round(box.x + horizontalBias - originX + jitter(10)),
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

export async function createDemoCursor(page: Page) {
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

			await cdpMoveTo(cdp, lastX, lastY, target.x, target.y)
			lastX = target.x
			lastY = target.y

			// Strategy 6: optional circulate — starts from where cursor already is
			if (options?.circulate) {
				const radius = options.circulateRadius ?? Math.min(box.width * 0.4, 40)
				await circulate(cdp, box.x + box.width / 2, box.y + box.height / 2, lastX, lastY, radius)
				// Return to click point after circling
				await cdpMoveTo(cdp, lastX, lastY, target.x, target.y)
			}

			// Strategy 2: buttons get longer hover (they trigger actions)
			const isButton = !isInputLike && (await locator.evaluate(el => el.matches('button, [role="button"]')).catch(() => false))
			await new Promise(r => setTimeout(r, isButton ? rand(150, 250) : rand(80, 140)))

			await cdpClick(cdp, target.x, target.y)
			await new Promise(r => setTimeout(r, rand(150, 250)))
		},

		/** Smoothly move to input, click, then fill */
		async fill(locator: Locator, text: string) {
			await locator.scrollIntoViewIfNeeded()
			const box = await locator.boundingBox()
			if (box) {
				const target = getInputClickPoint(box)
				await cdpMoveTo(cdp, lastX, lastY, target.x, target.y)
				lastX = target.x
				lastY = target.y
				await new Promise(r => setTimeout(r, rand(80, 130)))
				await cdpClick(cdp, target.x, target.y)
				await new Promise(r => setTimeout(r, rand(120, 200)))
			}
			await locator.pressSequentially(text, { delay: rand(30, 55) })
			await new Promise(r => setTimeout(r, rand(150, 250)))
		},

		/** Smoothly move to input, click, then type char by char */
		async type(locator: Locator, text: string, delay = 40) {
			await locator.scrollIntoViewIfNeeded()
			const box = await locator.boundingBox()
			if (box) {
				const target = getInputClickPoint(box)
				await cdpMoveTo(cdp, lastX, lastY, target.x, target.y)
				lastX = target.x
				lastY = target.y
				await new Promise(r => setTimeout(r, rand(80, 130)))
				await cdpClick(cdp, target.x, target.y)
				await new Promise(r => setTimeout(r, rand(120, 180)))
			}
			await locator.pressSequentially(text, { delay: delay + jitter(15) })
			await new Promise(r => setTimeout(r, rand(150, 250)))
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
