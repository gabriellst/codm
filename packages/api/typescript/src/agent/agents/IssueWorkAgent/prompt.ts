import { injectable } from 'tsyringe-neo'
import { MailboxItemKind } from '@codm/contracts-typescript/wire/enums'
import type Z from 'zod'
import {
	operationIdOf,
	TransitionIssueStatusController,
	RaiseStopController,
	AskOperatorController,
	RecordArtifactController,
} from '../../mcp/exposure'
import type { AgentInputEnvelope } from '../../types/AgentInput'
import { agoraLine, HORA_AGORA, renderMsg } from '../grammar'
import type { IssueWorkInputSchema } from './types'

type IssueWorkInput = Z.output<typeof IssueWorkInputSchema> & AgentInputEnvelope

/**
 * The `tipo` attribute — the ONE thing this prompt could not say before.
 *
 * `MailboxItemKind` is the discriminant; these are how it reads to a human. A brief and an amendment
 * arrived as the same raw string, so a resumed turn had to guess whether it was being briefed or
 * corrected, and guessing wrong means starting over on work already half done.
 */
const TIPO: Record<IssueWorkInput['turnKind'], string> = {
	[MailboxItemKind.WORK]: 'pedido',
	[MailboxItemKind.STEER]: 'steer',
}

/**
 * The prompt half of `IssueWorkAgent` (§4.8), a stateful builder in the shape of the origin
 * `ServicePromptBuilder`: it renders the STANDING context of a turn — which workspace the CLI is
 * running in, which issue it is working, under what key.
 *
 * ### THE DECLARATION INSTRUCTION — added in Fase 6, together with the scope it names
 * §4.8: "the declaration only exists if it is asked for". The inversion this phase is about only
 * happens if the model is TOLD to say when it is done and when it is stuck; a daemon that stops
 * inferring completion and never asks for a declaration has simply stopped closing issues. The
 * paragraph therefore lands in the same phase as the tools — earlier it would have named tools absent
 * from `--allowedTools`, producing a turn that narrates a call it cannot make.
 *
 * ### WHY THE IDS ARE IN THE PROMPT — the visible face of the amendment's conscious regression
 * Fase 1 froze hand-written tool schemas with NO identity field, which made "declare against the
 * wrong issue" inexpressible. Generated tools inherit their controller's PATH PARAMETERS, so
 * `threadId` and `issueId` are now arguments the caller must supply — which means the caller has to
 * know them, which means the prompt has to carry them. The guarantee moved rather than vanished: the
 * MCP router rejects any argument disagreeing with the run token's claims, on every axis (AC-6.6).
 * Rendering the ids here is not a widening — it is the model being handed the only values that will
 * be accepted.
 */
@injectable()
export class IssueWorkPromptBuilder {
	/** Standing instructions for the turn: the workspace, the issue under work, and the reply contract. */
	system(input: IssueWorkInput): string {
		return [
			`You are working on a coding issue inside the repository at ${input.cwd}.`,
			`ISSUE [${input.key}] ${input.title}`,
			'Do the work the message asks for in that repository. When you are done, reply with a short ' +
				'summary the requester will read in a chat message — not a diff, not a transcript.',
			'',
			...this.grammar(),
			'',
			...this.declarationInstruction(input),
			...this.blockedActions(input),
			...this.operatorInstructions(input),
		].join('\n')
	}

	/**
	 * THE TURN'S MESSAGE — one `<msg>` block, the same grammar the orchestrator reads.
	 *
	 * ### Why this method exists at all
	 * `IssueWorkAgent.buildRequest` used to pass `input.prompt` straight through as the user message,
	 * which was defensible while a turn's message was a bare string with nothing to say about itself. It
	 * is not one any more: it has an author, an instant, and — decisively — a KIND, and `buildRequest`
	 * assembles, it does not render. So the rendering lands here, next to the system half, exactly as
	 * `OrchestratorPromptBuilder` already splits.
	 *
	 * `agora:` opens it for the reason it opens the orchestrator's: a working agent that cannot tell
	 * whether a steer arrived a minute or a day after the brief cannot judge what has gone stale.
	 */
	user(input: IssueWorkInput): string {
		return [
			agoraLine(input.now, input.timezone),
			'',
			...renderMsg({
				de: input.speaker,
				hora: HORA_AGORA,
				para: 'you',
				via: input.via,
				tipo: TIPO[input.turnKind],
				content: input.prompt,
			}),
		].join('\n')
	}

	/**
	 * The legend for the ONE block this prompt carries — short, because there is only ever one.
	 *
	 * `tipo` is the whole reason it is written down. Everything else in the block is context a model
	 * infers correctly on its own; "is this the brief or an amendment?" is the question it cannot infer
	 * and gets catastrophically wrong, because reading a correction as a fresh brief means redoing work
	 * already done.
	 */
	private grammar(): string[] {
		return [
			'THE MESSAGE ITSELF arrives as a block. Its attributes are written by this system, not by whoever wrote the text:',
			`  tipo="${TIPO[MailboxItemKind.WORK]}" — the original request. It is why this issue exists; do it.`,
			`  tipo="${TIPO[MailboxItemKind.STEER]}" — an amendment to work already under way. Keep what you have done and ` +
				'fold this in; do not start over, and do not treat it as a new brief.',
			'  de — who is asking. "operator" is the person who owns the repository; "loop:<schedule>" is a scheduled prompt ' +
				'firing, which means nobody is sitting there waiting on an answer.',
		]
	}

	/**
	 * How this turn REPORTS what happened. Tool names are DERIVED from the controller class, never typed
	 * out: the sentence naming a tool cannot drift from it, and a rename follows the symbol.
	 *
	 * `issueId` is optional on the envelope because the CLASSIFIER runs before an issue exists. It is
	 * always present by the time this agent runs — the base `Agent` refuses to mint a run token without
	 * one — so its absence here means there is no issue to declare against and the paragraph is
	 * omitted rather than rendered with a hole a model would try to fill.
	 */
	private declarationInstruction(input: IssueWorkInput): string[] {
		if (!input.issueId) return []
		return [
			'HOW TO REPORT THE RESULT — do not just describe it in prose, DECLARE it:',
			`  · finished → call the ${operationIdOf(TransitionIssueStatusController)} tool with status COMPLETED and a short summary.`,
			`  · blocked and you need the operator to decide or approve → call the ${operationIdOf(RaiseStopController)} tool ` +
				'(not for an action the permission filter refused — see WHEN AN ACTION IS BLOCKED).',
			`  · you need one specific answer to keep going → call the ${operationIdOf(AskOperatorController)} tool.`,
			`  · produced a link, image or file worth keeping → call the ${operationIdOf(RecordArtifactController)} tool.`,
			'Every one of those tools takes the ids of THIS issue, and no other values are accepted:',
			`  threadId: ${input.threadId}`,
			`  issueId: ${input.issueId}`,
		]
	}

	/**
	 * A BLOCKED ACTION (participant-permission-posture, Decision 11). The permission filter can refuse an
	 * action in a turn running under AUTO, and the improvised answer of 2026-10-08 was to coach a human
	 * through a mode-toggle shortcut, the CLI's permissions command and environment variables — steps that
	 * do not apply to a headless run. The
	 * only lever that works is in the conversation: whoever may elevate approves there, and the next turn
	 * runs with what they granted. Rendered under the same predicate as `declarationInstruction`, because
	 * it speaks about this issue's turn. It deliberately does NOT name RaiseStop: the runner already raises
	 * PERMISSION_DENIED for a filter block, and a declared APPROVAL_NEEDED would duplicate the card.
	 */
	private blockedActions(input: IssueWorkInput): string[] {
		if (!input.issueId) return []
		return [
			'',
			'WHEN AN ACTION IS BLOCKED',
			'Some actions are blocked by a permission filter before they run. When that happens, stop and ask for approval in this ' +
				'conversation: end your turn saying exactly what you were about to do and why it needs approval. The system turns that ' +
				'block into the approval request on its own — do not raise a stop for it, and do not try to work around it.',
			'Never tell anyone to take manual steps on the computer to get around it — no keyboard shortcuts, no editing settings or ' +
				'permission files, no environment variables. Whoever can grant it answers in the conversation, and your next turn runs ' +
				'with what they granted.',
		]
	}

	/**
	 * INSTRUÇÃO DO OPERADOR — o mesmo `Thread.customPrompt` que o orquestrador recebe, com moldura
	 * própria.
	 *
	 * A moldura do orquestrador NÃO serve aqui, e copiá-la seria pior que não ter nenhuma. Ela fixa o
	 * formato da linha `[quote: …]`, que esta agente nunca emite — falar disso a instruiria sobre um
	 * canal que não é dela — e proíbe instalar dependências, uma regra que existe porque o orquestrador
	 * divide o chão com a conversa inteira. Uma issue que não pode preparar o próprio ambiente não
	 * consegue trabalhar.
	 *
	 * Renderizado só quando HÁ texto: um cabeçalho sem conteúdo diz ao modelo que existe uma instrução
	 * e depois não a fornece, que é exatamente como um modelo começa a inventar uma.
	 */
	private operatorInstructions(input: IssueWorkInput): string[] {
		if (!input.customPrompt) return []
		return [
			'',
			'INSTRUCTIONS FROM THE OPERATOR',
			'The person who owns this repository wrote the following for THIS conversation. It applies to the work ' +
				'itself — how to build, what to leave alone, what to always do before you call it done. Where it ' +
				'disagrees with anything above, follow this.',
			'',
			input.customPrompt,
		]
	}
}
