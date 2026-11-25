import { CommandMatch, ThreadCommand } from '../enums'
import { fold } from './controlCommand'

/**
 * THE CONVERSATION COMMANDS (fase 3, item 4) — their words and how they must appear. A closed map over the
 * command enum: a new command fails compilation here until it has its words and its match. Words are
 * compared folded (case and accents), so "Boletim" is "boletim".
 *
 * `relatorio`/`relatório`/`report` are NOT here (revisão 25/11, spec 2026-11-17 item 4): the group asked for the
 * report the orchestrator writes — by stage, with what is live and what is missing — back, so those words take
 * the usual path and wake it, as before fase 3. Only `boletim` keeps the board-by-rule answer.
 */
export const THREAD_COMMANDS: Readonly<Record<ThreadCommand, { words: readonly string[]; match: CommandMatch }>> = {
	[ThreadCommand.REPORT]: { words: ['boletim'], match: CommandMatch.WHOLE_MESSAGE },
}

/** Every @mention, wherever it is — addressing, not content. */
const MENTIONS = /@\S+/gu
/** What may close the word without changing it: "boletim?", "boletim!!", "boletim." */
const TRAILING_PUNCTUATION = /[\p{P}\s]+$/u

/** How each match mode reads a message already folded and stripped of mentions. */
const MATCHES: Readonly<Record<CommandMatch, (message: string, words: readonly string[]) => boolean>> = {
	[CommandMatch.WHOLE_MESSAGE]: (message, words) => words.includes(message),
}

/**
 * Is this message a conversation command? `undefined` when it is not — compared after folding case and
 * accents, without mentions and trailing punctuation.
 */
export function parseThreadCommand(text: string): ThreadCommand | undefined {
	const message = fold(text).replace(MENTIONS, ' ').replace(TRAILING_PUNCTUATION, '').trim()
	return Object.values(ThreadCommand).find(command => MATCHES[THREAD_COMMANDS[command].match](message, THREAD_COMMANDS[command].words))
}
