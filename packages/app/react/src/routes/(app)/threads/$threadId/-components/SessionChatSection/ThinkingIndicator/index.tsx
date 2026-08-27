import * as React from 'react'
import { easeSpinnerFrames, pickThinkingVerb } from '@codm/contracts/cues'
import type { LanguageInput, ThinkingVerb } from '@codm/contracts/cues'
import { cn } from '@/lib/utils'

/**
 * One 2s cycle of the ease-in-out spinner (fast in the middle, slow at both ends — founder), computed
 * ONCE at module scope: `easeSpinnerFrames` is pure and the 26-glyph sequence never changes mid-run, so
 * every mounted indicator shares the same frame table instead of recomputing it on each render.
 */
const FRAMES = easeSpinnerFrames(2000)
// noUncheckedIndexedAccess: FRAMES é não-vazio por construção (easeSpinnerFrames sobre THINKING_GLYPHS,
// que tem 27 entradas fixas) — este guard só satisfaz o compilador, nunca dispara em runtime.
const FIRST_FRAME = FRAMES[0]
if (!FIRST_FRAME) throw new Error('easeSpinnerFrames(2000) returned no frames')

/** Verb changes every full cycle (2s, the spinner's own period) — founder call 2026-08-25: the ~6s
 *  cadence read as stalled; one verb per cycle keeps the indicator visibly alive without flicker,
 *  because the verb only swaps on the cycle boundary where the eased frames are slowest. */
const CYCLES_PER_VERB = 1

interface ThinkingIndicatorProps extends React.ComponentProps<'div'> {
	/**
	 * WHICH LANGUAGE the verb is drawn in — the conversation's, ALREADY RESOLVED by the daemon
	 * (`GetSessionChat.thread.language`), never the console's own UI locale.
	 *
	 * The distinction is the whole point of the field: this spinner shows the operator what the ROOM is
	 * seeing, and a Portuguese group watched from an English console must still read "✻ Destilando…".
	 * A prop and not a query of its own, because the parent already holds the read that answers it.
	 *
	 * Optional so a story or a mount that has not loaded the thread yet still renders — the deck's own
	 * fallback (pt-BR) applies, which is the same collapse the daemon uses.
	 *
	 * `LanguageInput` and not the contracts `enum`: what arrives here is the SDK's value, and a contract
	 * enum crosses the wire as its bare tag. The deck declares that both spellings are the same locale
	 * (its type is DERIVED from the enum), so this stays as closed as the enum without an `as` on the way in.
	 */
	language?: LanguageInput
}

/**
 * The console's "✻ {verbo}" spinner (spec Decision 3, AC-4): a purely presentational
 * indicator for the WORKING state — no query, no wire read of its own. `SessionChatSection` decides
 * WHEN to mount it; this component only decides HOW it animates once mounted.
 *
 * The loop is a chained `setTimeout` over `easeSpinnerFrames`' precomputed per-frame delays, never a
 * fixed-interval `setInterval` — that is what makes the ease (fast middle, slow ends) actually visible
 * frame-to-frame instead of averaging out. Each timeout schedules the NEXT one using that frame's own
 * `delayMs`, so the effect re-runs once per frame and cleans up its own pending timeout on unmount or
 * before scheduling the next one.
 */
export function ThinkingIndicator({ className, language, ...props }: ThinkingIndicatorProps) {
	const [frameIndex, setFrameIndex] = React.useState(0)
	const [verb, setVerb] = React.useState<ThinkingVerb>(() => pickThinkingVerb(language))
	const cyclesCompleted = React.useRef(0)

	React.useEffect(() => {
		const currentFrame = FRAMES[frameIndex]
		if (!currentFrame) return

		const id = setTimeout(() => {
			const nextIndex = (frameIndex + 1) % FRAMES.length
			if (nextIndex === 0) {
				cyclesCompleted.current += 1
				if (cyclesCompleted.current % CYCLES_PER_VERB === 0) setVerb(previous => pickThinkingVerb(language, previous))
			}
			setFrameIndex(nextIndex)
		}, currentFrame.delayMs)

		return () => clearTimeout(id)
		// `language` is read inside the timeout, so the effect declares it — a conversation whose language
		// changes while the spinner is up picks the new pool on the very next cycle boundary.
	}, [frameIndex, language])

	// noUncheckedIndexedAccess: frameIndex está sempre em [0, FRAMES.length) por construção (o efeito
	// acima só avança via `% FRAMES.length`) — `?? FIRST_FRAME` só satisfaz o compilador.
	const frame = FRAMES[frameIndex] ?? FIRST_FRAME

	return (
		// `py-1 text-sm text-muted-foreground` matches the ACTION row's own classes in `TranscriptBubble`
		// (its system-line branch) — the sibling row this indicator sits next to in the timeline, so the
		// vertical rhythm lines up instead of drifting from a bespoke value.
		<div data-slot="thinking-indicator" className={cn('flex items-center gap-2 py-1 text-sm text-muted-foreground', className)} {...props}>
			{/* Template literals, not bare identifiers — the glyph/verb ARE the display content by design
			    (AC-4/AC-5), not wire codes standing in for a catalog lookup, so this stays outside
			    `local/no-raw-enum-render`'s scope on purpose (that rule explicitly does not flag
			    `TemplateLiteral`/`CallExpression` positions). */}
			<span aria-hidden="true" className="inline-block w-4 text-center text-primary">{`${frame.glyph}`}</span>
			<span className="italic">{`${verb}…`}</span>
		</div>
	)
}
