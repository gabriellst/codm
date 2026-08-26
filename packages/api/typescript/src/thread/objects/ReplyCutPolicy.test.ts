import { describe, expect, it } from 'bun:test'
import {
	INITIAL_CUT_STATE,
	STREAM_CUT_INTERVAL_MS,
	advanceCutState,
	decideCut,
	visibleReplyText,
	type ReplyCutState,
} from './ReplyCutPolicy'

/**
 * THE CADENCE, on a clock this suite owns (streaming spec, AC-2).
 *
 * Every instant here is a NUMBER passed in, never a wall-clock read and never a `sleep`. That is the
 * whole reason the policy is a pure function: the spec asks for "~1,5s OU parágrafo, o que vier
 * primeiro", and the only honest way to assert an interval is to move time by hand.
 */
describe('the reply cut policy — when a growing answer is worth pushing to the channel', () => {
	const T0 = 1_000_000

	/** Feed a whole generation through the policy and report every cut it decided. */
	const run = (frames: Array<{ text: string; atMs: number }>, intervalMs = STREAM_CUT_INTERVAL_MS) => {
		let state: ReplyCutState = INITIAL_CUT_STATE
		const cuts: Array<{ reason: string; text: string; atMs: number }> = []
		for (const frame of frames) {
			const decision = decideCut({ text: frame.text, nowMs: frame.atMs, state, intervalMs })
			if (decision.cut) {
				cuts.push({ reason: decision.reason, text: decision.text, atMs: frame.atMs })
				state = advanceCutState(decision, frame.atMs)
			}
		}
		return cuts
	}

	// ── AC-1 — the first send is what kills the apparent wait ──────────────────────────────────

	describe('the FIRST send fires on the first complete sentence, and not before', () => {
		it('holds while the sentence is still being typed', () => {
			expect(decideCut({ text: 'Vou olhar o', nowMs: T0, state: INITIAL_CUT_STATE }).cut).toBe(false)
			expect(decideCut({ text: 'Vou olhar o log de deploy', nowMs: T0, state: INITIAL_CUT_STATE }).cut).toBe(false)
		})

		it('fires the moment the period lands — even with no token after it', () => {
			const decision = decideCut({ text: 'Vou olhar o log de deploy.', nowMs: T0, state: INITIAL_CUT_STATE })

			// The end-anchored half of SENTENCE_END. Requiring whitespace after the period would hold the
			// first message until the NEXT token — spending the 1-2s this whole frente exists to buy.
			expect(decision).toEqual({ cut: true, reason: 'FIRST_SENTENCE', text: 'Vou olhar o log de deploy.' })
		})

		it('treats ? and ! as sentence ends too', () => {
			expect(decideCut({ text: 'Qual repo?', nowMs: T0, state: INITIAL_CUT_STATE }).cut).toBe(true)
			expect(decideCut({ text: 'Achei!', nowMs: T0, state: INITIAL_CUT_STATE }).cut).toBe(true)
		})

		/** Time alone must never open a stream — there would be nothing worth showing. */
		it('does NOT fire on the interval when no sentence has closed yet', () => {
			const decision = decideCut({ text: 'estou olhando o log', nowMs: T0 + 60_000, state: INITIAL_CUT_STATE })
			expect(decision.cut).toBe(false)
		})
	})

	// ── AC-2 — the hybrid cadence, and the explosion it is defined against ─────────────────────

	describe('after the first send: the interval OR a paragraph, whichever comes first', () => {
		const opened: ReplyCutState = { lastCutAtMs: T0, deliveredLength: 'Primeira frase.'.length }

		/**
		 * A FRONTEIRA É RELATIVA AO CONST, e isso é deliberado. Este caso já quebrou uma vez: ele
		 * cravava `T0 + 900`, que era "antes do intervalo" com 1500ms e virou "depois" quando o founder
		 * baixou para 750 (31/07). O teste falhou pelo motivo CERTO — estava medindo o intervalo de
		 * verdade —, mas afinar um número ratificado não deveria custar uma caçada a literais.
		 *
		 * Ancorar em `STREAM_CUT_INTERVAL_MS ± 1` NÃO torna o teste vácuo: ele continua reprovando quem
		 * remover a comparação de tempo (aí o `-1` corta) ou inverter o sinal (aí o `-1` corta e o
		 * exato não). O que ele deixa de reprovar é a MUDANÇA DO VALOR — que é justamente a coisa que
		 * se quer poder mudar sem quebrar nada.
		 */
		it('does not cut one millisecond before the interval, whatever the interval is', () => {
			const decision = decideCut({
				text: 'Primeira frase. Ainda escrevendo',
				nowMs: T0 + STREAM_CUT_INTERVAL_MS - 1,
				state: opened,
			})
			expect(decision.cut).toBe(false)
		})

		it('cuts once the interval elapses', () => {
			const decision = decideCut({ text: 'Primeira frase. Ainda escrevendo', nowMs: T0 + STREAM_CUT_INTERVAL_MS, state: opened })
			expect(decision).toMatchObject({ cut: true, reason: 'INTERVAL' })
		})

		it('cuts EARLY when a paragraph closes before the interval', () => {
			const decision = decideCut({ text: 'Primeira frase.\n\nSegundo parágrafo', nowMs: T0 + 200, state: opened })
			expect(decision).toMatchObject({ cut: true, reason: 'PARAGRAPH' })
		})

		/**
		 * THE FALSEADOR'S TARGET (AC-8c). A single newline is NOT a paragraph — swap `\n\n` for `\n` in
		 * the policy and this list-shaped reply alone goes from 1 cut to one per line.
		 */
		it('a single newline is NOT a trigger — list output does not shimmer', () => {
			const listy = 'Primeira frase.\n- um\n- dois\n- três\n- quatro\n- cinco'
			const decision = decideCut({ text: listy, nowMs: T0 + 100, state: opened })
			expect(decision.cut).toBe(false)
		})

		/**
		 * THE EXPLOSION, COUNTED. A model emitting a 12-item list does it in a burst — twelve newlines
		 * well inside one 1.5s window. The hybrid cadence answers with ZERO edits (nothing structural
		 * closed, the interval has not elapsed); a per-line cadence answers with one per item, which is
		 * the message visibly redrawing twelve times and twelve calls at the rate limiter.
		 */
		it('a 12-line burst inside one interval window costs ZERO edits', () => {
			let state = opened
			let text = 'Primeira frase.'
			let cuts = 0
			for (let i = 0; i < 12; i++) {
				text += `\n- item ${i}`
				// 40ms apart: the whole burst lands in under half a second.
				const decision = decideCut({ text, nowMs: T0 + i * 40, state })
				if (decision.cut) {
					cuts += 1
					state = advanceCutState(decision, T0 + i * 40)
				}
			}
			expect(cuts).toBe(0)
		})

		it('the same paragraph cannot re-trigger on every later token', () => {
			const afterParagraph: ReplyCutState = { lastCutAtMs: T0, deliveredLength: 'Um.\n\nDois'.length }
			const decision = decideCut({ text: 'Um.\n\nDois e mais um pouco', nowMs: T0 + 100, state: afterParagraph })
			expect(decision.cut).toBe(false)
		})

		it('a stalled generation produces NO edits, however long it stalls', () => {
			const idle = 'Primeira frase.'
			const state: ReplyCutState = { lastCutAtMs: T0, deliveredLength: idle.length }
			for (const elapsed of [2_000, 10_000, 60_000]) {
				expect(decideCut({ text: idle, nowMs: T0 + elapsed, state }).cut).toBe(false)
			}
		})
	})

	/**
	 * THE NUMBER AC-2 IS ABOUT — a 20s generation, as story 2 frames it.
	 *
	 * 40 frames over 20 seconds (one every 500ms), text growing steadily with a paragraph every ~5s.
	 * The hybrid cadence must land in the "one per ~1.5s or per paragraph" order of magnitude, NOT one
	 * per frame and not one per line.
	 */
	it('a 20-second answer produces edits in the order of one per 1.5s — not one per frame', () => {
		const frames: Array<{ text: string; atMs: number }> = []
		let text = 'Vou verificar isso agora.'
		for (let i = 0; i < 40; i++) {
			// A newline every other frame — the shape that makes a per-line cadence catastrophic.
			text += i % 2 === 0 ? `\n- item ${i}` : ` mais contexto ${i}`
			if (i > 0 && i % 10 === 0) text += '\n\nNovo parágrafo.'
			frames.push({ text, atMs: T0 + i * 500 })
		}

		const cuts = run(frames)

		// 20s at ~1.5s plus 3 paragraph breaks ⇒ well under 20. A per-line policy would produce ~20+
		// (one per frame carrying a newline), and a per-frame policy 40.
		expect(cuts.length).toBeGreaterThanOrEqual(3)
		expect(cuts.length).toBeLessThanOrEqual(20)
		expect(cuts.filter(c => c.reason === 'PARAGRAPH').length).toBeGreaterThan(0)
		expect(cuts.filter(c => c.reason === 'INTERVAL').length).toBeGreaterThan(0)

		// AND THE PROPERTY THAT MATTERS ON SCREEN: the text never shrinks between cuts.
		const lengths = cuts.map(c => c.text.length)
		expect(lengths).toEqual([...lengths].sort((a, b) => a - b))
	})

	// ── The citation sentinel must never be visible mid-flight ─────────────────────────────────

	describe('the citation sentinel is never shown to the contact, even half-typed', () => {
		it('strips a complete sentinel', () => {
			expect(visibleReplyText('Feito.\n[quote: 019fb7ee-f9c8-7956-9175-808f0fbd28be]')).toBe('Feito.')
		})

		it('strips one that is still arriving, token by token', () => {
			for (const partial of ['Feito.\n[', 'Feito.\n[qu', 'Feito.\n[quote:', 'Feito.\n[quote: 019fb7ee-f9c8']) {
				expect(visibleReplyText(partial)).toBe('Feito.')
			}
		})

		it('leaves ordinary brackets alone', () => {
			expect(visibleReplyText('Olha o array [1, 2, 3]')).toBe('Olha o array [1, 2, 3]')
			expect(visibleReplyText('Veja o TODO [pendente]')).toBe('Veja o TODO [pendente]')
		})

		it('a cut taken while the sentinel is arriving carries the clean text', () => {
			const state: ReplyCutState = { lastCutAtMs: T0, deliveredLength: 5 }
			const decision = decideCut({ text: 'Feito, subi o fix.\n[quote: 019fb', nowMs: T0 + 2_000, state })
			expect(decision).toMatchObject({ cut: true, text: 'Feito, subi o fix.' })
		})
	})
})
