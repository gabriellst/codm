import { injectable } from 'tsyringe-neo'
import { ContactKind, MailboxItemKind } from '@codedm/contracts-typescript/wire/enums'
import type Z from 'zod'
import { TOOLS_IN_SCOPE } from '../../mcp/manifest'
import { AgentRunOutcome } from '../../enums'
import type { AgentInputEnvelope } from '../../types/AgentInput'
import type { OrchestratorInputSchema } from './types'

type OrchestratorInput = Z.output<typeof OrchestratorInputSchema> & AgentInputEnvelope
type MailboxItem = OrchestratorInput['item']
type WindowEntry = OrchestratorInput['window']['entries'][number]

/**
 * The prompt half of `OrchestratorAgent` (§7.1) — and, per the handoff, THE VOICE OF THE PRODUCT.
 * It was deliberately left to a fresh session: this file is the entire personality of the thing the
 * operator talks to, and everything else in the pivot is plumbing around it.
 *
 * ### WHY `system` + `user`, and not `system` alone
 * `IssueWorkPromptBuilder` renders only a system prompt because `RunIssueTurn` already holds the
 * turn's single user message as a string (`input.prompt`, IssueWorkAgent.ts:67). No such string
 * exists here: a turn is a DISCRIMINATED mailbox item plus a window of conversation, and turning
 * those into text is RENDERING. `buildRequest` is not allowed to render — it assembles. So this
 * follows `ClassifyIssuePromptBuilder`'s shape, which split for the same reason.
 *
 * ### WHY THE FILE-EDITING RULE IS A PROHIBITION AND NOT A CLAIM OF INCAPABILITY
 * R6 (§10) asks for "orientação de prompt para o orquestrador não editar arquivos" — the v1
 * mitigation for N agents sharing one cwd. The tempting phrasing is "you have no tools". It would be
 * FALSE, and falsifiable by the model on its first call: `--allowedTools` is pushed only inside
 * `if (mcp)` (ClaudeAgentRunner.ts:247-250) while `--permission-mode auto` is pushed unconditionally
 * (:254), and that method's own MEASURED note (:214-219) records "Write + Read both executed" under
 * `auto`. The orchestrator therefore spawns with the CLI's full native Read/Write/Edit/Bash surface,
 * in a directory that holds real work. A model that catches the prompt lying about its own
 * capabilities has no reason to believe the next sentence either — so the paragraph forbids, names
 * the classes beyond editing, and gives the reason. Reading is explicitly ALLOWED, because the
 * founder's canonical beat 2 ("o código está da maneira tal?" → "está dessa forma: …") is
 * unperformable without it.
 *
 * ### WHY TOOL NAMES ARE NEVER TYPED OUT
 * Same rule as `IssueWorkPromptBuilder`: read from the manifest, so the scope and the sentence that
 * names it cannot drift, and a rename follows the symbol. It also makes the F2+F3 boundary render
 * itself — see `issues()`.
 */
@injectable()
export class OrchestratorPromptBuilder {
	/** Standing instructions: who it is, how it speaks, what it must not touch, and how it may quote. */
	system(input: OrchestratorInput): string {
		return [...this.identity(input), '', ...this.voice(), '', ...this.room(input), '', ...this.issues(), ...this.quoting(input)].join('\n')
	}

	/**
	 * The turn itself: the elapsed conversation, then the one thing being responded to.
	 *
	 * The window comes LAST-but-one and the live item LAST because recency dominates attention: the
	 * message under `THIS TURN` is the one that must be answered, and burying it above forty lines of
	 * transcript is how a model ends up replying to the wrong thing.
	 */
	user(input: OrchestratorInput): string {
		return [...this.window(input), '', ...this.turn(input.item)].join('\n')
	}

	/**
	 * WHO and WHERE. Lands first because every other rule is downstream of it — a model that knows it
	 * is a resident of one conversation infers most of the register without being told.
	 *
	 * `cwd` is named rather than described: it is the repository the conversation is ABOUT, and the
	 * next paragraph forbids writing to it, which is only meaningful once the path is concrete.
	 */
	private identity(input: OrchestratorInput): string[] {
		return [
			`You are the agent who lives in this conversation. One of you per conversation, and you have been here the whole time.`,
			`The repository this conversation is about is at ${input.cwd}.`,
			'',
			'You talk. You may READ that repository to answer a question about it. You change NOTHING there: no edits, ' +
				'no writes, no file moves, no git commands, no generators, no installs. Not because you lack the tools — you ' +
				'have them, and other work runs in this same directory. Reading answers the question; writing breaks somebody ' +
				"else's turn.",
		]
	}

	/**
	 * HOW IT SPEAKS — read off the founder's canonical example (§1), which is the only ratified
	 * artifact describing this product's register. Two words is a complete reply there.
	 *
	 * ### Formatting is WhatsApp's, not markdown's (§7.9, founder 28-jul)
	 * WhatsApp bolds with ONE asterisk. `**bold**` is markdown, is NOT interpreted, and the asterisks
	 * reach the reader literally — which is exactly what happened to the 19:02 reply in the real
	 * group. So this does not ban emphasis, it bans the WRONG SPELLING of it, and states the default
	 * (plain text) separately on voice grounds. A blanket ban was the first instinct and it was wrong:
	 * it would have forbidden a thing the surface genuinely supports.
	 *
	 * ### No length rule, deliberately
	 * An earlier draft capped replies at two sentences. The canonical example's own beat 2 is a code
	 * answer, and the one real reply this product has produced was 596 characters and good. A cap
	 * forbids a turn the ratified example contains. "Earned by content, never by manners" is the
	 * standard that cuts the actual failure — preamble and politeness padding — without cutting
	 * substance.
	 */
	private voice(): string[] {
		return [
			'HOW YOU TALK',
			'Reply in the language the operator wrote in. Match their register, not a house style.',
			'Short. A question worth two words gets two words. Length is earned by content, never by manners.',
			'No preamble, no restating the question, no "claro!" before the answer, no sign-off, no offer of further help. ' +
				'Answer the message and stop.',
			'Plain text by default — this is a chat message, not a document. No headings, no bullet lists, no tables.',
			'If you must emphasise, use WHATSAPP syntax, not markdown: *bold* with ONE asterisk, _italic_, ~strike~. ' +
				'Markdown `**bold**` is NOT rendered here — the asterisks show up literally in the message the human reads.',
			'A command or a path goes on its own line, plainly. That is the only structure you get.',
			'One message per turn. Never say you did something you did not do.',
			'',
			'This is the register, not something that was said:',
			'',
			'  operator: pode me tirar uma dúvida?',
			'  you: sim, claro',
			'  operator: o código está da maneira tal?',
			'  you: está dessa forma: xxxxxxxxx',
			'',
			'If the answer is "sim", the reply is "sim".',
		]
	}

	/**
	 * THE ROOM — who else is here, and the D3 rule about them.
	 *
	 * D3 says an un-tagged message is context, transcribed and never answered. The failure that rule
	 * prevents is not the model answering a stranger; it is the model APOLOGISING for the backlog it
	 * can see and did not answer, which reads as a bot catching up. Hence the explicit "never
	 * apologise for not having answered it".
	 *
	 * `contactKind` branches because a 1:1 has no room to speak of, and telling a model to ignore
	 * "everyone else" in a conversation with exactly one other person invites it to invent an
	 * audience. `BROADCAST` folds in with `USER`: the only in-repo grouping treats it as not-a-group
	 * (`GetAttachThreadWizard.ts:30`, "null for 1:1 CONTACT/BROADCAST"). §7.6 writes "(GROUP|USER)"
	 * and simply predates the third member.
	 */
	private room(input: OrchestratorInput): string[] {
		if (input.contactKind !== ContactKind.GROUP) {
			return [
				'THE ROOM',
				'This is a one-to-one conversation with the operator, who owns the repository.',
				'Only the message under THIS TURN is for you.',
			]
		}
		return [
			'THE ROOM',
			'This is a group: other people talk here too. The operator owns the repository and this conversation.',
			'Lines marked "→ you" were addressed to you. Everything else is the room talking. You have read it — it is what ' +
				'lets you follow — but you do not answer it, and you never apologise for not having answered it.',
			'Only the message under THIS TURN is for you.',
			...(input.mentionTag ? [`Never write ${input.mentionTag} in a reply — the room reads that as summoning you again.`] : []),
		]
	}

	/**
	 * ISSUES — D1 (an issue is a DECLARED fork, never inferred) and D4 (the ack is this same turn).
	 *
	 * ### Why there is no "I cannot open one yet" branch
	 * There was one, and D9 deleted it. Under the v2 phasing the orchestrator shipped a phase ahead of
	 * the `orchestration` scope, so this method had to render an honest refusal — the house precedent
	 * being `IssueWorkPromptBuilder.declarationInstruction`, which returns `[]` rather than naming a
	 * tool absent from `--allowedTools` and producing "a turn that narrates a call it cannot make".
	 * D9 merged the phases precisely because that gap left `RunIssueTurn` with no runtime caller at
	 * all, so the scope now lands in this same PR and the refusal branch is unreachable code. Deleted
	 * rather than kept "just in case": a dead branch in the voice of the product is a sentence nobody
	 * will ever read and everybody will keep maintaining.
	 *
	 * The tool NAME is still read from the manifest and never typed out — a rename follows the symbol,
	 * and the scope and the sentence naming it cannot drift apart.
	 */
	private issues(): string[] {
		const [createIssue] = TOOLS_IN_SCOPE.orchestration
		return [
			'ISSUES',
			'Work that changes code happens in an issue, and an issue runs elsewhere while you keep talking.',
			'An issue is something the operator asks for OUT LOUD. You never infer one, never turn a remark into work, and ' +
				'never suggest that something should become an issue unless you were asked.',
			`To open one, call the ${createIssue} tool with the goal the operator gave you, in their words. It answers with ` + 'the issue key.',
			'Acknowledge in that same turn — name the key and say you will report back. One line. Then keep talking; the ' +
				'work runs on its own, and you will be handed the result when it lands.',
			'',
			'  operator: crie uma issue específica para isso e vamos resolver',
			'  you: criei a issue dark-mode-toggle — te aviso quando tiver resultado',
		]
	}

	/**
	 * QUOTING (D6 + §7.6) — a PERMISSION, and the negative half is the hard one.
	 *
	 * D6 grants discretion on WHEN to quote in conversation. The founder was explicit this session
	 * that stacking a quote on immediate ping-pong "reads like a bot", so the discretion is preserved
	 * on the positive side and the negative is stated flatly. The canonical example is the proof: its
	 * conversational beats carry no quote and only the result does.
	 *
	 * ### Why the sentinel is the LAST line, and why it is the only place an id may appear
	 * The orchestrator has no `outputSchema` (a conversational turn is a stream, not an object) and,
	 * in F2+F3, no tool it could report through. §7.6's "o modelo sinaliza citação reutilizando o
	 * entryId do item consumido" therefore needs a text channel, and a trailing sentinel is the only
	 * one that is unambiguous to strip: anchored to the end, it cannot be confused with prose, and a
	 * turn that forgets it degrades to "no quote" rather than to a malformed reply. The prohibition on
	 * ids anywhere else is not tidiness — the operator never sees ids, so one that leaks into prose is
	 * a defect they read.
	 *
	 * OMITTED on an `ISSUE_RESULT` turn: that citation is mandatory and is NOT the model's decision
	 * (§7.6), so `RunOrchestratorTurn` sets `replyToEntryId` itself from `originEntryId`, which the
	 * model is never handed. Rendering a quoting policy here would put a permission and a mandate
	 * about the same mechanism in one prompt.
	 */
	private quoting(input: OrchestratorInput): string[] {
		if (input.item.kind !== MailboxItemKind.OPERATOR_MESSAGE) return []
		return [
			'',
			'QUOTING',
			'Your reply may be attached to one earlier message, so it arrives as a quote. Usually it should not be.',
			'Quote when the message you are answering is no longer the last thing said — when others have spoken since, an ' +
				'unattached answer lands under the wrong message.',
			'Never quote the message you are plainly replying to. Quoting immediate back-and-forth reads like a bot.',
			'To quote, make the LAST line of your reply exactly this, with nothing after it:',
			`  [quote: ${input.item.entryId}]`,
			'No line, no quote. That is the only place an id may ever appear — the operator never sees ids, so one in your ' +
				'prose is a bug they will read.',
		]
	}

	/**
	 * The elapsed conversation (§7.5's provenance: `recentByThread` + `thread.bufferSize`, the window
	 * that would have died orphaned with `ClassifyMessage`).
	 *
	 * `seeded` distinguishes §7.5's two modes: a FRESH session is handed the full window, a RESUMED one
	 * only what it has not seen. It is a field rather than an inference from `session.resumeId`,
	 * because that object is all-optional (IssueWorkAgent/types.ts:41) and "neither key" is
	 * representable — inferring would make a test that omits `session` silently render the wrong mode.
	 *
	 * An earlier draft encoded "window present ⟺ fresh". That contradicts §7.5, which gives a RESUMED
	 * session the un-mentioned messages since the cursor — the common path, which under that encoding
	 * would carry no room chatter at all and leave D3 governing nothing.
	 */
	private window(input: OrchestratorInput): string[] {
		if (!input.window.entries.length) return ['CONVERSATION SO FAR', '(nothing yet)']
		return [
			input.window.seeded ? 'CONVERSATION SO FAR (oldest first)' : 'SINCE YOU LAST SPOKE (oldest first)',
			...input.window.entries.map(entry => this.line(entry)),
		]
	}

	/** One transcript line. `→ you` is what the D3 paragraph in `room()` refers to. */
	private line(entry: WindowEntry): string {
		return `${entry.speaker}${entry.addressed ? ' → you' : ''}: ${entry.text}`
	}

	/**
	 * THE LIVE ITEM — the discriminated half of the turn.
	 *
	 * The `switch` is total by construction: `OrchestratorInputSchema` narrows `item` to the two
	 * THREAD-facing kinds, because `WORK` and `STEER` target an ISSUE and reach `RunIssueTurn`
	 * instead. Making the wrong kind unrepresentable is why there is nothing to throw here — the house
	 * preference, and no prompt builder in this repo throws.
	 */
	private turn(item: MailboxItem): string[] {
		switch (item.kind) {
			case MailboxItemKind.OPERATOR_MESSAGE:
				return [`THIS TURN — ${item.speaker}, id ${item.entryId}`, item.text]
			case MailboxItemKind.ISSUE_RESULT:
				return this.issueResult(item)
			default: {
				const exhaustive: never = item
				return exhaustive
			}
		}
	}

	/**
	 * D2 — the orchestrator COMPOSES the result; it does not forward the worker's voice.
	 *
	 * The framing "written to you, not to the room" is doing the work. The worker's `replyText` was
	 * drafted for a chat message and reads publishable, so a model handed it without that line pastes
	 * it — which is precisely the raw-worker-voice-in-the-channel outcome that killing
	 * `RequestAgentReplyDelivery` (F4) exists to prevent. Saying it is private notes makes composing
	 * the only sensible move.
	 *
	 * The payload mirrors `TerminalOutcome`, which carries `replyText` ONLY on the completed branch
	 * (TerminalOutputAccumulator.ts:10). A flat `replyText` would be a lie on a stop, where the text
	 * is a stop kind plus detail — and a lie in the schema becomes a hallucinated summary in the group.
	 */
	private issueResult(item: Extract<MailboxItem, { kind: typeof MailboxItemKind.ISSUE_RESULT }>): string[] {
		const head = ["THIS TURN — an issue finished. What follows is the worker's notes, written to you, not to the room.", '']
		if (item.outcome.kind === AgentRunOutcome.COMPLETED) {
			return [
				...head,
				`issue: ${item.issueKey}`,
				'outcome: COMPLETED',
				'notes:',
				item.outcome.replyText,
				'',
				'Say what happened YOURSELF, to the person who asked, in this conversation’s voice. Lead with the outcome. ' +
					'Do not paste the notes, do not narrate the work, do not list the files. One or two lines.',
				'This reply is attached to the message that asked for it automatically. Do not write a [quote: …] line.',
			]
		}
		return [
			...head,
			`issue: ${item.issueKey}`,
			`outcome: STOPPED (${item.outcome.stopKind})`,
			'reason:',
			item.outcome.detail,
			'',
			'Say what happened and what you need from them, in this conversation’s voice. Lead with the fact that it is ' +
				'stuck. Do not paste the notes. One or two lines.',
			'This reply is attached to the message that asked for it automatically. Do not write a [quote: …] line.',
		]
	}
}
