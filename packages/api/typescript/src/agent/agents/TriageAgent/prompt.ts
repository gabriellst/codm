import { injectable } from 'tsyringe-neo'
import type Z from 'zod'
import { TriageDecision } from '../../enums'
import type { TriageInputSchema } from './types'

type TriageInput = Z.output<typeof TriageInputSchema>

/** How much of one line the prompt carries — a triage reads intent, not documents. */
const LINE_CHARS = 400

const clip = (text: string): string => (text.length > LINE_CHARS ? `${text.slice(0, LINE_CHARS)}…` : text)

/** "12 min" / "3 h" / "2 d" — an age the model can weigh without a clock or a timezone. */
function ageOf(at: Date, now: Date): string {
	const minutes = Math.max(0, Math.round((now.getTime() - at.getTime()) / 60_000))
	if (minutes < 60) return `${minutes} min`
	const hours = Math.round(minutes / 60)
	return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`
}

/**
 * Prompt builder for `TriageAgent`. A CLASS so a future repo/config read arrives by constructor.
 *
 * Everything it renders is already a NAME or a text: the caller resolved speakers off the roster and no
 * id, phone or address reaches the model — the only identifiers are the issues' short keys, which are
 * what the model answers with.
 */
@injectable()
export class TriagePromptBuilder {
	/** Standing instructions — what the model is for, and when it must NOT decide. */
	system(_input: TriageInput): string {
		return [
			'You triage ONE message sent to a coding agent in a group chat. You do not answer it and you do not do any work.',
			'Decide where the message goes:',
			`- ${TriageDecision.STEER}: the message is clearly a correction, instruction or reply about exactly ONE of the open issues listed. Answer with that issue's key.`,
			`- ${TriageDecision.NEW_TASK}: the message asks for new work that none of the open issues covers. Answer with a short title for it.`,
			`- ${TriageDecision.NO_ACTION}: the message needs nothing — thanks, an emoji, "ok", small talk that asks for nothing.`,
			`- ${TriageDecision.ORCHESTRATOR}: anything else — a question, a list of requests, a message about several issues, a status request, or whenever you are unsure.`,
			`When in doubt, choose ${TriageDecision.ORCHESTRATOR}. Never guess an issue: a wrong ${TriageDecision.STEER} sends somebody's words to the wrong work.`,
			'confidence is how sure you are of the decision, from 0 to 1.',
		].join('\n')
	}

	/** The single user turn: the open issues, the recent tail, then the message itself. */
	user(input: TriageInput): string {
		const issues =
			input.openIssues.length > 0
				? input.openIssues.map(
						issue => `- ${issue.key} [${issue.status}, last activity ${ageOf(issue.lastActivityAt, input.now)} ago] ${clip(issue.title)}`,
					)
				: ['(none)']
		const recent = input.recent.length > 0 ? input.recent.map(line => `${line.speaker}: ${clip(line.text)}`) : ['(nothing)']
		const quoted = input.message.quoted ? [`(replying to ${input.message.quoted.speaker}: «${clip(input.message.quoted.text)}»)`] : []
		return [
			'Open issues:',
			...issues,
			'',
			'Said just before:',
			...recent,
			'',
			'The message to triage:',
			...quoted,
			`${input.message.speaker}: ${clip(input.message.text)}`,
		].join('\n')
	}
}
