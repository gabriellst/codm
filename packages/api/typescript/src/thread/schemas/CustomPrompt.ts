import { z } from '@codm/core-typescript'
import type { DomainErrors } from '../errors'

/**
 * How much operator-written instruction one conversation may carry.
 *
 * A cap exists because this text is not stored and forgotten — it is PREPENDED TO EVERY TURN
 * (`ClaudeAgentRunner.renderStreamJsonStdin` folds `systemPrompt` into the first stdin line on resumed
 * runs too), so it is paid for on each message the thread answers, forever. 8000 characters is roughly
 * two thousand tokens: enough for a genuine brief — voice, domain vocabulary, what to never do — and
 * far short of "the operator pasted a document into the box and every reply got slower".
 *
 * It is a NUMBER here and not a literal in a `.max()` call because the frontend renders the remaining
 * budget as the operator types, and a counter that disagrees with the validator is worse than no
 * counter. The wire schema is the one declaration both sides read.
 */
export const CUSTOM_PROMPT_MAX_LENGTH = 8000

/**
 * The operator's standing instructions for one conversation — the VALUE, always non-empty.
 *
 * "No custom prompt" is modelled as ABSENCE (the field is optional on `Thread`, the column is
 * nullable), never as an empty string: the prompt builder renders its section iff there is text, and a
 * second spelling of the same fact is a normalization every reader would have to remember. `ConfigurePrompt`
 * is what turns a cleared textarea into `undefined`, so the UI can keep sending the empty string it
 * naturally produces.
 */
export const CustomPromptSchema = z
	.string()
	.trim()
	.min(1)
	.max(CUSTOM_PROMPT_MAX_LENGTH, { error: 'PROMPT_TOO_LONG' as DomainErrors })
