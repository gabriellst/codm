import { injectable } from 'tsyringe-neo'
import type Z from 'zod'
import { SupervisorVerdict, SuspicionReason } from '@codm/contracts-typescript/wire/enums'
import type { SupervisorInputSchema } from './types'

type SupervisorInput = Z.output<typeof SupervisorInputSchema>

/** What each suspicion means, in the model's words — total, so a new reason fails compilation until it is explained. */
const REASON_TEXT: Readonly<Record<SuspicionReason, string>> = {
	[SuspicionReason.STALLED_OPEN]:
		'the task ended its turns without saying where it stands, was nudged twice, and has been shown as blocked since — nobody answered',
	[SuspicionReason.PROVIDER_ERROR_OPEN]:
		'the task stopped because the AI provider kept failing; every retry was spent and nobody has resumed it since',
	[SuspicionReason.NUDGE_LOOP]:
		'the task keeps going quiet: episode after episode it ends a turn without declaring and has to be nudged again',
	[SuspicionReason.SILENT_TURN]: 'a turn of the task has been running for a long time without printing anything',
}

/** What each verdict does — total, and only the admitted ones are shown. */
const VERDICT_TEXT: Readonly<Record<SupervisorVerdict, string>> = {
	[SupervisorVerdict.NUDGE]: 'resume the task once more, asking it to finish the step it was in and declare where it stands',
	[SupervisorVerdict.RESTART_WITH_NOTES]:
		'resume the task in a FRESH session that starts from its handoff notes — when the old session looks confused or stuck in a loop',
	[SupervisorVerdict.ESCALATE]: 'mark the task for a person to look at — when only a person can unblock it',
	[SupervisorVerdict.LEAVE]: 'do nothing — when it is waiting for a reason, or you are unsure',
}

/**
 * Prompt builder for `SupervisorAgent`. A CLASS so a future config read arrives by constructor.
 *
 * Everything it renders is already a name, an age or a redacted, cut text — the caller built `recent` and no id, phone
 * or address reaches the model. Short on purpose: a small model, one question, the admitted verdicts only.
 */
@injectable()
export class SupervisorPromptBuilder {
	system(input: SupervisorInput): string {
		return [
			'You supervise ONE task an AI coding agent is working on for a team. You do not do any work and you write to nobody.',
			'The task was flagged by a rule; decide what should happen to it now. Answer with exactly one of:',
			...input.admitted.map(verdict => `- ${verdict}: ${VERDICT_TEXT[verdict]}.`),
			`When in doubt, choose ${input.admitted.includes(SupervisorVerdict.LEAVE) ? SupervisorVerdict.LEAVE : input.admitted[0]}.`,
			'Nothing you choose may publish, deploy, merge or answer for a person — those stay with people.',
			'confidence is how sure you are of the verdict, from 0 to 1.',
		].join('\n')
	}

	user(input: SupervisorInput): string {
		const recent = input.recent.length > 0 ? input.recent.map(moment => `- ${moment.ago} ago: ${moment.what}`) : ['(nothing recorded)']
		return [
			`Task ${input.issue.key}: ${input.issue.title}`,
			`Why it was flagged: ${REASON_TEXT[input.reason]} (for ${input.suspectFor}).`,
			...(input.lifeState ? [`Where it stands now: ${input.lifeState}.`] : []),
			`First nudges in the last 24 h: ${input.nudgesLastDay}.`,
			'',
			'Its last moments, oldest first:',
			...recent,
		].join('\n')
	}
}
