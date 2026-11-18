import { IssueControlCommand } from '../enums'

/**
 * THE CONTROL WORDS (fase 2, item 2), compared after folding case and accents — so "Pare", "PARE" and
 * "páre" are one word, and "retome" matches whether or not the keyboard added an accent somewhere.
 *
 * A closed map over the command enum: a new command fails compilation here until it has its words.
 */
export const CONTROL_WORDS: Readonly<Record<IssueControlCommand, readonly string[]>> = {
	[IssueControlCommand.PAUSE]: ['pare', 'pausa', 'pause', 'segura', 'stop'],
	[IssueControlCommand.RESUME]: ['continue', 'continua', 'retome', 'retoma', 'segue'],
}

const COMMAND_OF_WORD: ReadonlyMap<string, IssueControlCommand> = new Map(
	Object.values(IssueControlCommand).flatMap(command => CONTROL_WORDS[command].map(word => [word, command] as const)),
)

/** Leading @mentions (`@codm`, `@<número>`) and the whitespace around them — addressing, not content. */
export const LEADING_MENTIONS = /^(?:\s*@\S+)*\s*/u
/** The FIRST WORD, whole: letters up to the first non-letter. "parabéns" is not "pare", "seguem" is not "segue". "para" is left out on purpose: it is also the preposition ("Para quando fica pronto?"). */
const FIRST_WORD = /^(\p{L}+)(?![\p{L}\p{N}])/u

export const fold = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Does this message START with a control word? `undefined` when it does not — and only then is the
 * message anything but a command candidate. Whether it becomes a command also needs a TARGET (a quoted
 * issue message, or exactly one issue key), which the caller resolves: a bare "para" with nothing to
 * point at is ordinary conversation and takes the usual path.
 */
export function parseControlCommand(text: string): IssueControlCommand | undefined {
	const first = FIRST_WORD.exec(fold(text).replace(LEADING_MENTIONS, ''))?.[1]
	return first === undefined ? undefined : COMMAND_OF_WORD.get(first)
}
