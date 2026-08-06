import { injectable } from 'tsyringe-neo'
import { ContactKind, MailboxItemKind } from '@codm/contracts-typescript/wire/enums'
import type Z from 'zod'
import {
	toolNameOf,
	ForkIssueController,
	ResolveStopController,
	SteerIssueTurnController,
	ConfigurePromptController,
	ConfigureModelController,
	ListThreadLoopsController,
	CreateThreadLoopController,
	UpdateThreadLoopController,
	SetThreadLoopEnabledController,
	DeleteThreadLoopController,
} from '../../mcp/exposure'
import { AgentRunOutcome } from '../../enums'
import type { AgentInputEnvelope } from '../../types/AgentInput'
import type { OrchestratorInputSchema } from './types'

type OrchestratorInput = Z.output<typeof OrchestratorInputSchema> & AgentInputEnvelope
type MailboxItem = OrchestratorInput['item']
type WindowEntry = OrchestratorInput['window']['entries'][number]
type OpenStop = OrchestratorInput['openStops'][number]

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
 * ### FILE EDITING: ALLOWED, WITH A STRONG PREFERENCE FOR FORKING (B4, founder 29-jul)
 * The first version FORBADE writing outright — R6's v1 mitigation for N agents sharing one cwd. The
 * founder rejected that after using it: the orchestrator refused a trivial edit with a flat "No.", and
 * being unable to touch the repository at all is worse than the contention it was avoiding.
 *
 * What replaces it is not permission-plus-silence but permission-plus-a-reason. The real cost of the
 * orchestrator doing work is not the write — it is that a thread's turns are SERIALIZED (one lease per
 * target, §3), so while it edits, nobody in that conversation is answered. Forking is how the work
 * happens without the conversation going quiet, and that is what the paragraph tells it.
 *
 * The prohibition it does keep is narrow and about blast radius rather than busyness: no `git` history
 * rewriting, no dependency installs. Those are not "work", they are changes to the ground everyone
 * else is standing on, and a subagent in its own turn is the right place for them too.
 *
 * (The structural fix remains R6's worktree-per-issue. This is the instruction; that is the isolation.
 * Recorded as a follow-up rather than built here — it changes how concurrent work is isolated, which
 * is the founder's call, not a side effect of a prompt edit.)
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
		return [
			...this.identity(input),
			'',
			...this.voice(),
			'',
			...this.room(input),
			'',
			...this.issues(),
			...this.redirectingWork(),
			...this.standingInstructions(input),
			...this.modelChoice(input),
			...this.recurringPrompts(input),
			...this.stops(input),
			...this.quoting(input),
			...this.operatorInstructions(input),
		].join('\n')
	}

	/**
	 * The turn itself: the elapsed conversation, what the live message is answering, then the message.
	 *
	 * The window comes FIRST and the live item LAST because recency dominates attention: the message
	 * under `THIS TURN` is the one that must be answered, and burying it above forty lines of transcript
	 * is how a model ends up replying to the wrong thing.
	 *
	 * `repliedTo` sits BETWEEN them, and the position is the argument: it is not conversation (it is one
	 * specific line, singled out) and it is not the message (it is what the message is about). Reading
	 * order becomes what a human's is — the room, then the line being answered, then the answer — and
	 * `THIS TURN` still lands last, so the quote informs the live message instead of competing with it.
	 */
	user(input: OrchestratorInput): string {
		return [...this.window(input), '', ...this.repliedTo(input.item), ...this.turn(input.item)].join('\n')
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
			'You talk, and you can read and edit that repository. But this conversation is SERIALIZED: while you ' +
				'work, nobody here gets an answer — so the default for anything beyond a trivial edit is to FORK AN ISSUE ' +
				'and keep talking. Prefer forking whenever the work has more than one step, needs to be verified, or would ' +
				'take you more than a moment.',
			'Do it yourself when it is genuinely small and the operator is plainly asking YOU to: a one-line fix, a file ' +
				'they want written now, a quick correction. Say what you changed, in one line.',
			'Two things stay off-limits whoever asks, because they change the ground everyone else is standing on: ' +
				'rewriting git history, and installing dependencies. Fork an issue for those.',
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
	 * The tool NAME is still DERIVED and never typed out — a rename follows the symbol, and the class
	 * and the sentence naming it cannot drift apart. It is named NOMINALLY (`toolNameOf(<class>)`)
	 * rather than taken positionally off a scope list: the list used to be hand-ordered, the scan
	 * orders alphabetically, and `[0]` would have changed meaning SILENTLY.
	 */
	private issues(): string[] {
		const createIssue = toolNameOf(ForkIssueController)
		return [
			'ISSUES',
			'Work that changes code happens in an issue, and an issue runs elsewhere while you keep talking.',
			'An issue is something the operator asks for OUT LOUD. You never infer one, never turn a remark into work, and ' +
				'never suggest that something should become an issue unless you were asked.',
			`To open one, call the ${createIssue} tool with the goal the operator gave you, in their words. It answers with the issue key.`,
			'Acknowledge in that same turn — name the key and say you will report back. One line. Then keep talking; the ' +
				'work runs on its own, and you will be handed the result when it lands.',
			'',
			'  operator: crie uma issue específica para isso e vamos resolver',
			'  you: criei a issue dark-mode-toggle — te aviso quando tiver resultado',
		]
	}

	/**
	 * REDIRECIONAR TRABALHO QUE JÁ EXISTE — a situação que faltava, e que custou caro.
	 *
	 * O steer aparecia só dentro do fluxo de stops ("resolva o stop, depois steere"), então quando o
	 * operador pedia algo sobre uma issue que não estava perguntando nada — inclusive uma já concluída
	 * — não havia situação sancionada que casasse com o pedido. O modelo tinha a ferramenta, improvisou,
	 * e respondeu "repassei isso pra ela" sem ter chamado nada. Duas vezes, contando a vez em que o
	 * operador desconfiou e perguntou de novo.
	 *
	 * A regra de honestidade fica aqui e não numa seção própria de propósito: ela nasce desta situação,
	 * e uma regra geral sobre "não minta" longe do caso que a motiva é uma frase que o modelo lê e não
	 * aplica.
	 */
	private redirectingWork(): string[] {
		const steerIssue = toolNameOf(SteerIssueTurnController)
		return [
			'',
			'REDIRECTING WORK THAT ALREADY EXISTS',
			'When the operator says something about work you already opened — a correction, an addition, "now do X too" ' +
				`— that belongs to the issue that is already carrying it. Call ${steerIssue} with that issue id and WHAT ` +
				'THEY SAID, in their words. Do not open a second issue for it, and do not answer as if the instruction ' +
				'reached anyone on its own.',
			'This works on an issue that already finished. Finishing is not a door closing — the issue picks the work ' +
				'back up with everything it already knew.',
			'And the rule that makes any of this trustworthy: never say you did something you did not do. If you did ' +
				`not call ${steerIssue}, do not tell the operator you passed it along. If a call failed, say it failed. ` +
				'A turn that narrates an action it never took is worse than a turn that does nothing, because the ' +
				'operator stops watching.',
		]
	}

	/**
	 * INSTRUÇÕES PERMANENTES — a situação que faltava do outro lado do custom prompt.
	 *
	 * `operatorInstructions()` RENDERS the field; this paragraph is what lets the operator WRITE it from
	 * inside the conversation. Without it, "de agora em diante responde sempre em inglês" had three
	 * endings and all three were bad: obey for one turn and let the rule die with the context window,
	 * send the operator to the console to record a preference about the conversation they are already
	 * having, or claim to have registered it. The third is not hypothetical here — it is exactly what
	 * `redirectingWork()` was written for, one situation over.
	 *
	 * ### The rule that keeps the tool from being an autonomy
	 * "Never infer" is `issues()`'s rule, restated verbatim in shape because it is the same rule: a
	 * standing instruction is something the operator says OUT LOUD. Without it, a model that reads a
	 * passing complaint as a standing rule would be rewriting its own instructions from a remark — which
	 * is the objection `ConfigurePrompt.ts`'s doc block answers, and this paragraph is one third of that
	 * answer (the other two are the identity confinement and the frame it cannot reach).
	 *
	 * ### Why REPLACES is stated, and why the "resend it" line is conditional
	 * The operation writes the whole field; there is no append in the contract and inventing one would
	 * be a second mechanism for the same column. Telling a model to preserve text it was never shown is
	 * an instruction it cannot follow — so the line renders only when there IS text, which is exactly
	 * when the model can see it (`operatorInstructions()` prints it verbatim at the end of this same
	 * prompt).
	 *
	 * ### Why the delay is stated
	 * `systemPrompt` is folded into the FIRST stdin line of every run, resumed ones included, and
	 * `RunOrchestratorTurn` reads `thread.customPrompt` off the aggregate when the turn STARTS. So a
	 * write landing mid-turn cannot change the turn making it. Unsaid, the model reports "pronto, já
	 * estou falando inglês" while still running under the old text — a small lie of the same family the
	 * honesty rule above exists to kill.
	 */
	private standingInstructions(input: OrchestratorInput): string[] {
		const configurePrompt = toolNameOf(ConfigurePromptController)
		return [
			'',
			'STANDING INSTRUCTIONS FOR THIS CONVERSATION',
			'The operator can give you rules that outlive one message — how to talk, which language, what to always do ' +
				`or never do here. Those live in a field of THIS conversation, and ${configurePrompt} is how you write it.`,
			'Only when they ask for it out loud. You never infer one, and you never turn a passing remark into a ' +
				'standing rule — same rule as issues.',
			`${configurePrompt} REPLACES the whole text with what you send.`,
			...(input.customPrompt
				? [
						'There is already text there — it is at the end of these instructions. If the operator is ADDING to ' +
							'it, send the existing text back together with the new part, or you have just deleted what they ' +
							'wrote before.',
					]
				: []),
			'To erase it, call it with no text at all.',
			'It takes effect on the NEXT message, not on this turn: you are still running under the instructions you ' +
				'were given when this turn started. Say what you recorded, in one line, and do not claim you are already ' +
				'behaving differently. And if you did not call it, do not say you did.',
		]
	}

	/**
	 * O MODELO DESTA CONVERSA — a mesma situação que `standingInstructions()`, um eixo ao lado.
	 *
	 * O operador percebe que o modelo está errado para a conversa ESTANDO nela: uma thread de triagem
	 * queimando o modelo caro em dezenas de mensagens curtas, uma de arquitetura respondendo com o
	 * fraco. Mandá-lo ao console para trocar é a mesma falha que o custom prompt tinha — a instrução
	 * chega a quem não pode executá-la.
	 *
	 * ### A LISTA é renderizada, e é isso que torna a ferramenta usável
	 * O schema de `ConfigureModel` aceita qualquer `AgentModelId` — é um enum plano, e quem diz de quem
	 * é cada membro é a relação declarada em contracts, que o modelo não vê. Sem a lista aqui, ele chuta
	 * um membro do enum, o domínio recusa com `MODEL_NOT_AVAILABLE`, e a ferramenta só sabe errar. Com
	 * ela, o catálogo do CLI deste turno chega como fato (`availableModels`), resolvido por
	 * `RunOrchestratorTurn`, que é a camada que conhece o provider.
	 *
	 * ### A seção some quando não há o que escolher
	 * Um CLI que este build nunca dirigiu tem catálogo vazio, e uma seção oferecendo uma escolha
	 * inexistente é pior que nenhuma: convida o modelo a tentar e a errar.
	 *
	 * ### As duas consequências são ditas em voz alta, e a segunda é a que parece bug
	 * (1) Vale a partir da próxima mensagem, pelo mesmo motivo do custom prompt — o `systemPrompt` e o
	 * modelo são fixados quando o turno começa. (2) Trocar o modelo DERRUBA a sessão do CLI:
	 * `AgentSession.resumeDecision` recusa retomar sob outro modelo (`MODEL_CHANGED`), porque o CLI fixa
	 * o modelo na sessão que retoma e ignoraria o pedido em silêncio. Isso é o comportamento correto, e
	 * não dizê-lo é o que faz o operador ver o agente "esquecer" a conversa e concluir que quebrou.
	 */
	private modelChoice(input: OrchestratorInput): string[] {
		if (input.availableModels.length === 0) return []
		const configureModel = toolNameOf(ConfigureModelController)
		return [
			'',
			'WHICH MODEL THIS CONVERSATION RUNS ON',
			`This conversation asks its agent CLI for a specific model, and ${configureModel} is how you change it. ` +
				`The ones it offers: ${input.availableModels.join(', ')}. DEFAULT means let the CLI decide.`,
			'Only when the operator asks out loud — same rule as standing instructions and issues. A remark about ' +
				'cost or speed is not a request to switch.',
			'Two things happen, and you say both in the one line you reply with: it applies from the NEXT message, ' +
				'not this turn; and it RESTARTS this conversation on the CLI, so the working context you have right now ' +
				'is gone from the next message on. Never claim you are already answering on the new model. And if you ' +
				'did not call it, do not say you did.',
		]
	}

	/**
	 * PROMPTS RECORRENTES — o operador falando no timer, de dentro da conversa em que o timer vai bater.
	 *
	 * `standingInstructions()` acima é o irmão desta seção, e a diferença entre as duas é o custo do
	 * erro. Uma instrução permanente escrita por engano é uma frase que o operador reescreve; um loop
	 * criado por engano é uma conversa que passa a se interromper sozinha, a cada quinze minutos, até
	 * alguém abrir o console e notar. Por isso a regra de nunca inferir aparece aqui com o motivo colado
	 * nela em vez de por referência: uma regra geral longe do caso que a motiva é uma frase que o modelo
	 * lê e não aplica.
	 *
	 * ### Por que CINCO ferramentas e não uma
	 * A primeira frase do operador cria um loop. Todas as seguintes são sobre um que já existe — "muda
	 * para as 8", "para com isso uns dias", "pode apagar". Expor só a criação produziria um agente capaz
	 * de armar alarmes e incapaz de desarmá-los, e o operador voltaria ao console exatamente para a parte
	 * chata. A LEITURA é o que torna as outras alcançáveis: a identidade do run carrega `threadId` e nada
	 * com forma de loop, e nenhuma seção deste prompt imprime a lista, então sem ela "aquele do deploy" é
	 * uma frase que o modelo não tem como transformar numa linha endereçável.
	 *
	 * ### Por que os limites de `everyMinutes` NÃO estão escritos aqui
	 * `LoopIntervalMinutesSchema` já carrega `.min()`/`.max()`, e eles são emitidos como `minimum` e
	 * `maximum` no schema JSON da ferramenta gerada — o modelo os lê na própria definição da tool.
	 * Repetir os números nesta prosa criaria uma segunda fonte de verdade que só sabe derivar, e a
	 * primeira delas mora em outro contexto, que este arquivo não tem licença para importar.
	 *
	 * ### Por que o fuso é IMPRESSO
	 * O membro por relógio exige uma zona IANA e o modelo não tem de onde tirar uma: adivinhar pelo
	 * idioma da conversa é escrever um horário errado com cara de certo. `input.timezone` é o fuso da
	 * máquina, que é o mesmo que o console lê do browser para preencher esse mesmo campo.
	 */
	private recurringPrompts(input: OrchestratorInput): string[] {
		const listLoops = toolNameOf(ListThreadLoopsController)
		const createLoop = toolNameOf(CreateThreadLoopController)
		const updateLoop = toolNameOf(UpdateThreadLoopController)
		const pauseLoop = toolNameOf(SetThreadLoopEnabledController)
		const deleteLoop = toolNameOf(DeleteThreadLoopController)
		return [
			'',
			'RECURRING PROMPTS IN THIS CONVERSATION',
			'The operator can put a prompt on a timer here: a message this conversation whispers to itself on a ' +
				`schedule, which you then answer as an ordinary turn. ${createLoop} is how you schedule one, and it ` +
				'belongs to THIS conversation and no other.',
			'Only when they ask for it out loud. You never infer one, and you never turn a passing remark into a ' +
				'schedule. Getting a standing instruction wrong costs a sentence; getting a schedule wrong costs a ' +
				'conversation that interrupts itself until somebody notices.',
			'A schedule is ONE of two shapes, and never a mixture of the two:',
			`  - by the clock — a time of day, the weekdays it runs on, and the timezone, which is ${input.timezone} ` +
				'unless the operator names another;',
			'  - by cadence — every N minutes, a whole number within the bounds the tool declares. The first run is ' +
				'N minutes from now, never immediately.',
			`You hold no loop ids. To change, pause or remove something already scheduled, call ${listLoops} first, ` +
				'find the one the operator means by its text, and use the id it hands you.',
			`${updateLoop} replaces BOTH the prompt and the schedule of one loop, so send the whole of both — the ` +
				'half you leave out is the half you erase.',
			`When the operator just wants it to stop, PAUSE it with ${pauseLoop}; it keeps its place and the same ` +
				`call brings it back. ${deleteLoop} is for when they ask you to remove it, and there is no undo.`,
			'Say what you scheduled in one line, in your own voice, and never put a loop id in a reply. And if you ' +
				'did not call the tool, do not say you did.',
		]
	}

	/**
	 * THE UNANSWERED QUESTIONS (issue-resume spec, AC-4 + decision 1).
	 *
	 * ### The decision this paragraph implements
	 * Decision 1 puts the JUDGEMENT here, in the model, deliberately: no deterministic rule anywhere
	 * tries to read "pode seguir" or "usa a opção 2" out of a chat message, because that rule would be
	 * wrong in both directions — resuming work nobody approved, and leaving an approved issue stopped.
	 * The agent already reads the conversation; what it could not do was SEE the questions. This is the
	 * whole of what the system owes it in exchange for taking the judgement.
	 *
	 * ### Why the ids are printed, in a prompt whose quoting rule bans ids
	 * That rule bans ids in the REPLY — the operator never sees ids, so one in prose is a defect they
	 * read. These are tool ARGUMENTS: `ResolveStop` is reached by `stopId` and `SteerIssueTurn` by
	 * `issueId`, and a question the model cannot name is a question it cannot close. So they are given,
	 * and the prohibition on repeating them to a human is restated on the spot rather than left to be
	 * inferred from a paragraph three sections down that only renders on some turns.
	 *
	 * ### Why the ORDER of the two calls is stated
	 * Resolving first is what makes the console stop showing a question that has been answered; steering
	 * second is what puts the operator's own words into the resumed turn. Reversed, a steer can land and
	 * the stop stay open — the exact half-finished state decision 1 exists to remove.
	 *
	 * ### A stop with no issue is not an oversight
	 * Since B4 the Stop is a child of the THREAD, so the orchestrator's own needs-approval is raised
	 * before any issue exists. There is nothing to steer for those, and saying so is load-bearing: a
	 * model told to "resolve and steer" with no issue id will either invent one or call the tool without
	 * it and narrate a failure to somebody's chat.
	 *
	 * NOTHING RENDERS when the list is empty — the same rule `operatorInstructions` follows. A heading
	 * announcing pending questions and then listing none is how a model starts asking the operator to
	 * confirm things nobody ever asked about.
	 */
	private stops(input: OrchestratorInput): string[] {
		if (input.openStops.length === 0) return []
		const resolveStop = toolNameOf(ResolveStopController)
		const steerIssue = toolNameOf(SteerIssueTurnController)
		return [
			'',
			'UNANSWERED QUESTIONS',
			'Work of yours is STOPPED, waiting on an answer from this conversation. Oldest first:',
			'',
			...input.openStops.flatMap(stop => this.stopLines(stop)),
			'If the operator’s message answers one of these, do it in THIS turn, in this order:',
			`  1. call ${resolveStop} with that stop id and the resolution their answer amounts to;`,
			`  2. call ${steerIssue} with that issue id and WHAT THEY SAID, in their words — not "the operator approved". ` +
				'The worker resumes with that text as its instruction, so a steer that carries no content resumes it blind.',
			'A stop with no issue is your own: resolve it and answer here. There is nothing to steer.',
			'If the message does not answer any of them, leave them alone. Never resolve a question on a guess, and never ' +
				'chase the operator for one they did not bring up.',
			'Then say what you did, in one line, in your own voice — and never put a stop id or an issue id in a reply.',
		]
	}

	/**
	 * ONE unanswered question. `title` and `detail` ARE "what was asked" — the two columns a stop has
	 * for it — so both are rendered: the title alone is a headline written for a card, and the detail is
	 * where the agent actually stated the choice it needs made. `detail` may legitimately be empty.
	 */
	private stopLines(stop: OpenStop): string[] {
		const head = stop.issueId
			? `- stop ${stop.stopId} — issue ${stop.issueId} — ${stop.kind}`
			: `- stop ${stop.stopId} — no issue — ${stop.kind}`
		return [head, `  ${stop.title}`, ...(stop.detail ? [`  ${stop.detail}`] : []), '']
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
	 * THE OPERATOR'S OWN INSTRUCTIONS for this conversation — everything above is the default they are
	 * allowed to overrule.
	 *
	 * ### Why it is LAST, and why it says it WINS
	 * Both halves are the same decision. Everything before it is a house default: a register read off
	 * the founder's canonical example, a formatting rule for WhatsApp, a policy on issues. Defaults are
	 * what you get when nobody said otherwise — and this is the operator saying otherwise, about their
	 * own conversation. A custom prompt that loses every conflict with the built-in voice is a text box
	 * that does nothing, which is worse than not having one, because the operator cannot tell.
	 *
	 * Position carries the same weight the runner already relies on for `structuredOutputDirective`
	 * ("appended LAST, after the turn body, because instruction recency is what the model actually
	 * obeys"). Saying it wins AND putting it last means the sentence and the mechanism agree.
	 *
	 * ### The two carve-outs, and why only two
	 * The off-limits pair (git history, dependency installs) survives because it is not about voice or
	 * task at all — it is about blast radius on a machine other people are standing on, and `identity()`
	 * already says it holds "whoever asks". The quote sentinel survives because it is TRANSPORT:
	 * `parseReply` parses that line, so an instruction that changed its spelling would not restyle the
	 * reply, it would leak a raw id into someone's chat.
	 *
	 * Nothing else is fenced off, deliberately. A longer list of things the operator may not touch would
	 * be this file guessing which of its own paragraphs are load-bearing, and the honest answer is that
	 * the rest are preferences.
	 *
	 * Rendered only when there IS text (`customPrompt` is absent, never `''` — `Thread.configurePrompt`
	 * collapses blank into absence at the write). An empty heading in the system prompt would tell the
	 * model an instruction exists and then not supply it, which is how a model starts inventing one.
	 */
	private operatorInstructions(input: OrchestratorInput): string[] {
		if (!input.customPrompt) return []
		return [
			'',
			'INSTRUCTIONS FROM THE OPERATOR',
			'The person who owns this repository wrote the following for THIS conversation. Everything above is the ' +
				'default; this is them saying otherwise. Where the two disagree — voice, length, language, what to do ' +
				'and what to leave alone — follow this.',
			'Two things it does not repeal, because neither is a matter of style: you still never rewrite git history ' +
				'or install dependencies, and the [quote: …] line keeps its exact shape — that line is parsed by this ' +
				'system, so changing it puts a raw id in front of a human.',
			'',
			input.customPrompt,
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
	 * WHAT THE LIVE MESSAGE IS ANSWERING — the other half of the reply-invocation rule.
	 *
	 * Quoting the agent already lowers the mention gate: `IngestChannelMessage` computes `repliesToAgent`
	 * and `Thread.addressedToAgent` stands the tag down for it, because demanding a prefix on the natural
	 * answer to the agent's own question is how that answer fell on the floor. But the gate was the whole
	 * of it — the turn was summoned and handed the reply with no antecedent, and a reply is usually a
	 * FRAGMENT. "depois" is not an answer to anything until you know the question was "agora ou depois do
	 * deploy?".
	 *
	 * ### Why the window is not enough, and this is not a duplicate of it
	 * Three reasons, and any one is sufficient. The window is capped by `bufferSize`, so the quoted line
	 * may be older than it. A RESUMED session gets only the tail since the cursor, so on the common path
	 * the line is not in this prompt at all. And even when it IS present, nothing marks WHICH of forty
	 * lines was answered — that is precisely the information a quote carries and a transcript does not.
	 *
	 * ### Why it says "besides what they just said" out loud
	 * The founder's ask, and it is not decoration. A model handed two texts will answer the LAST one and
	 * treat the other as scenery — the same recency pull `user()` exploits for `THIS TURN`. Here that
	 * default is wrong: the quoted line is half the question. So the instruction names the failure
	 * instead of trusting the arrangement.
	 *
	 * NOTHING RENDERS on an ordinary message — the rule `stops()` and `operatorInstructions()` follow. A
	 * heading announcing a quoted message and then showing none is how a model starts inventing one.
	 */
	private repliedTo(item: MailboxItem): string[] {
		if (item.kind !== MailboxItemKind.OPERATOR_MESSAGE || !item.quotedAgentText) return []
		return [
			'THE MESSAGE THEY REPLIED TO',
			'The message under THIS TURN is a REPLY, and this is the line it was attached to — your own ' +
				'words, earlier in this conversation:',
			'',
			// Labelled `you`, exactly as the window labels the agent's own lines: an unattributed line
			// reads as somebody else's and gets answered as one.
			`  you: ${item.quotedAgentText}`,
			'',
			'Answer with BOTH in view. What they just said may be a fragment — "depois", "o segundo", "pode" ' +
				'— that means nothing except against that line, so read it as the second half of one message ' +
				'rather than as a new subject.',
			'',
		]
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
	 * killing the old raw-delivery handler (B3) exists to prevent. Saying it is private notes makes composing
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
