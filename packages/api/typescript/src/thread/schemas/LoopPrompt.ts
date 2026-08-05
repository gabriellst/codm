import { z } from '@codm/core-typescript'
import type { DomainErrors } from '../errors'

/**
 * How long one loop's whisper may be.
 *
 * Shorter than `CUSTOM_PROMPT_MAX_LENGTH` on purpose, and the difference is what each text IS. The
 * custom prompt is a BRIEF — voice, vocabulary, standing rules — and it rides in every turn forever.
 * A loop is an ERRAND: "pergunte ao time como está o deploy e resuma em três linhas". 2000 characters
 * is several paragraphs of errand and nowhere near a document, which keeps a scheduled prompt from
 * quietly becoming a second, unlabelled system prompt that fires three times a week.
 *
 * Declared as a NUMBER, not as a literal inside `.max()`, because the console counts down against it
 * as the operator types — the wire carries this exact value, so the counter cannot disagree with the
 * validator (same rule, and same reason, as the custom prompt's cap next door).
 */
export const LOOP_PROMPT_MAX_LENGTH = 2000

/** What a loop whispers — always non-empty. An empty loop is a loop that wastes a turn saying nothing. */
export const LoopPromptSchema = z
	.string()
	.trim()
	.min(1)
	.max(LOOP_PROMPT_MAX_LENGTH, { error: 'LOOP_PROMPT_TOO_LONG' as DomainErrors })
