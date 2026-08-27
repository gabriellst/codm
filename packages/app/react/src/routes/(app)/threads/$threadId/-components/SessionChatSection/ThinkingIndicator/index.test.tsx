import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { THINKING_GLYPHS, THINKING_VERBS_EN, THINKING_VERBS_PT } from '@codm/contracts/cues'
import type { LanguageInput } from '@codm/contracts/cues'
import { ThinkingIndicator } from './index'

/**
 * FAKE TIMERS BY HAND — `bun:test` has no `jest.advanceTimersByTime` equivalent for `setTimeout`
 * (`setSystemTime` only fakes the clock `Date` reads, not scheduling). So `globalThis.setTimeout` is
 * spied here and turned into a queue this suite drains one entry at a time via `flushNext()` — the same
 * shape the component itself relies on: ONE chained timeout per frame (never `setInterval`), so exactly
 * one entry is ever pending at a time.
 */

/**
 * A minimal, structurally-real `Timer` — `ref`/`unref`/`refresh` return the SAME instance (as the real
 * timer does), `hasRef` reports true, and `[Symbol.toPrimitive]` yields the numeric id `clearTimeout(id)`
 * would compare against.
 */
function createFakeTimer(id: number): Timer {
	const timer: Timer = {
		ref: () => timer,
		unref: () => timer,
		hasRef: () => true,
		refresh: () => timer,
		[Symbol.toPrimitive]: () => id,
	}
	return timer
}

/** The real, unspied `setTimeout.__promisify__` — captured once at module load, before any spy exists. */
const REAL_SET_TIMEOUT_PROMISIFY = setTimeout.__promisify__

/**
 * `globalThis.setTimeout` in this workspace is the MERGE of four ambient overloads that all resolve
 * against the same global name: DOM's (`lib.dom.d.ts`, returns `number`), bun-types' (returns `Timer`),
 * and @types/node's two (return `NodeJS.Timeout`, one of them carrying the `__promisify__` namespace
 * member). `spyOn(globalThis, 'setTimeout').mockImplementation(fn)` requires `fn` to be assignable to
 * that FULL merged `typeof setTimeout` — so `fakeSetTimeoutImpl` declares one overload signature per
 * source library (order doesn't matter, coverage of every target overload does) instead of casting the
 * mismatch away, and `__promisify__` is the REAL implementation grabbed above (a genuine value of the
 * exact required type — these tests never call it, only the type system needs it to exist).
 */
function createFakeSetTimeout(schedule: (fn: () => void) => number): typeof setTimeout {
	function fakeSetTimeoutImpl<TArgs extends unknown[]>(callback: (...args: TArgs) => void, delay?: number, ...args: TArgs): NodeJS.Timeout
	function fakeSetTimeoutImpl(callback: (_: undefined) => void, delay?: number): NodeJS.Timeout
	function fakeSetTimeoutImpl(handler: Bun.TimerHandler, timeout?: number, ...args: unknown[]): Timer
	function fakeSetTimeoutImpl(handler: TimerHandler, timeout?: number, ...args: unknown[]): number
	function fakeSetTimeoutImpl(handler: unknown): unknown {
		const id = schedule(() => {
			if (typeof handler === 'function') handler()
		})
		return createFakeTimer(id)
	}

	return Object.assign(fakeSetTimeoutImpl, { __promisify__: REAL_SET_TIMEOUT_PROMISIFY })
}

describe('ThinkingIndicator', () => {
	let root: Root | null = null
	let host: HTMLElement | null = null
	let timeoutSpy: ReturnType<typeof spyOn<typeof globalThis, 'setTimeout'>>
	let pending: { id: number; fn: () => void }[] = []
	let nextId = 1

	beforeEach(() => {
		pending = []
		nextId = 1
		timeoutSpy = spyOn(globalThis, 'setTimeout').mockImplementation(
			createFakeSetTimeout(fn => {
				const id = nextId++
				pending.push({ id, fn })
				return id
			}),
		)
	})

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host?.remove()
		host = null
		timeoutSpy.mockRestore()
	})

	function mount(language?: LanguageInput): HTMLElement {
		host = document.createElement('div')
		document.body.appendChild(host)
		root = createRoot(host)
		act(() => {
			root!.render(<ThinkingIndicator language={language} />)
		})
		return host
	}

	/** Runs the ONE pending chained timeout, advancing the component exactly one animation frame. */
	function flushNext(): void {
		const next = pending.shift()
		if (!next) throw new Error('nenhum setTimeout pendente — o loop encadeado parou de se re-agendar')
		act(() => next.fn())
	}

	function glyphOf(el: HTMLElement): string | null {
		return el.querySelector('[data-slot="thinking-indicator"] span[aria-hidden="true"]')?.textContent ?? null
	}

	function verbOf(el: HTMLElement): string | null {
		const text = el.querySelector('[data-slot="thinking-indicator"] span.italic')?.textContent ?? null
		return text ? text.replace('…', '') : null
	}

	it('monta mostrando o primeiro glifo do ciclo (✻) e um verbo da lista curada', () => {
		const el = mount()

		expect(glyphOf(el)).toBe(THINKING_GLYPHS[0])
		// Sem `language`, o deck cai no padrão (pt-BR) — o mesmo colapso que o daemon usa.
		expect(THINKING_VERBS_PT).toContain(verbOf(el) as (typeof THINKING_VERBS_PT)[number])
	})

	it('agenda exatamente UM timeout encadeado por frame — nunca setInterval', () => {
		mount()

		expect(pending).toHaveLength(1)
	})

	it('avança para o próximo glifo do ciclo ao disparar o timeout encadeado', () => {
		const el = mount()

		flushNext()

		expect(glyphOf(el)).toBe(THINKING_GLYPHS[1])
		// O loop se re-agenda: ainda há exatamente um timeout pendente após o avanço.
		expect(pending).toHaveLength(1)
	})

	it('reinicia o ciclo em ✻ ao completar as 27 frames', () => {
		const el = mount()

		for (let i = 0; i < THINKING_GLYPHS.length - 1; i++) flushNext()

		expect(glyphOf(el)).toBe(THINKING_GLYPHS[THINKING_GLYPHS.length - 1])
		expect(glyphOf(el)).toBe(THINKING_GLYPHS[0]) // o ciclo é rotacionado: a última frame também é ✻

		flushNext() // fecha o primeiro ciclo completo e reabre em frame 0

		expect(glyphOf(el)).toBe(THINKING_GLYPHS[0])
	})

	/**
	 * O IDIOMA DA SALA, não o do console. `GetSessionChat.thread.language` já vem RESOLVIDO pelo daemon
	 * (declarado na conversa → padrão do dono → padrão do produto), e é ele que o spinner desenha: o
	 * operador que acompanha um grupo em inglês a partir de um console em português vê o verbo em inglês,
	 * porque é o que o grupo está vendo.
	 */
	it('desenha do pool do idioma que a conversa fala, e nunca do outro', () => {
		const el = mount('en-US')

		const verb = verbOf(el) as (typeof THINKING_VERBS_EN)[number]
		expect(THINKING_VERBS_EN).toContain(verb)
		expect(THINKING_VERBS_PT as readonly string[]).not.toContain(verb)
	})

	it('troca de verbo DENTRO do mesmo idioma a cada ciclo — nunca escorrega para o pool vizinho', () => {
		const el = mount('en-US')

		// Um ciclo completo é o que faz o verbo trocar (CYCLES_PER_VERB = 1).
		for (let i = 0; i < THINKING_GLYPHS.length; i++) flushNext()

		expect(THINKING_VERBS_EN).toContain(verbOf(el) as (typeof THINKING_VERBS_EN)[number])
	})
})
