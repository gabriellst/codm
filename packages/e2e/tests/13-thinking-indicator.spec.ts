import { test, expect } from '../utils/test'
import { givenFreshUser, givenAttachedThread, injectInboundMessage, readChannelSender, type ChannelSenderSnapshot } from '../utils/given'

/** `Array.prototype.at` needs a newer lib target than this workspace's `tsconfig.json` declares. */
function lastOf<T>(items: readonly T[]): T | undefined {
	return items.length > 0 ? items[items.length - 1] : undefined
}

/** The most recent edit on one messageId, in this conversation's snapshot — undefined if never edited. */
function lastEditOf(snapshot: ChannelSenderSnapshot, messageId: string): string | undefined {
	return lastOf(snapshot.edits.filter(edit => edit.messageId === messageId))?.text
}

/**
 * Any "✻ {verb}…" or "✻ {verb}… · {detail}" line — glyph-agnostic, and with NO "Pensando —" prefix
 * (bug fix, founder: só a palavra de fato). `ThinkingCues.thinkingLine` opens on `✻` but a PHASE edit
 * advances `thinkingGlyphIndex` through the full `THINKING_GLYPHS` cycle (`RunOrchestratorTurn`), so a
 * phase edit reads e.g. "✼ Formulando…" — a literal `✻` in the pattern would only ever match the
 * OPENING line, never a phase transition. The optional " · {detail}" tail is the tool activity
 * (`describeToolActivity`, thinking-indicator-with-detail spec) — present when the tool's input
 * resolved a sanitized target, absent (falls back to the plain "…$" shape) otherwise.
 */
const THINKING_LINE = /^\S .+…(?: · .+)?$/u
/** The opening line specifically — the one shape guaranteed to start on `✻` (`thinkingLine`'s default). */
const OPENING_THINKING_LINE = /^✻ .+…$/u

/**
 * Canonical flow (h) — the "Pensando" placeholder: presence cuts, phases edit, one message survives.
 *
 * Drives the REAL stack end to end, same seam as flow (b) (`04-inbound-issue.spec.ts`): the gateway
 * ingress seam publishes a normalized inbound message, `ConsumeInboundMessage` queues an orchestrator
 * turn, `RunOrchestratorTurn` runs the (stubbed) agent. What THIS spec proves is the machinery T2/T4
 * built around that same run — the "✻ {verb}…" placeholder T2 opens BEFORE the model has said
 * anything, the phase edits it drives off the stub's tool_use frames, and the presence loop T4 audited.
 *
 * ### The observability gap this spec's own seam closes
 * `thread/registry.ts` binds `ChannelSender` to `MockChannelSender` under `e2e` (the column is
 * OMITTED, so `expandBindings` mirrors `integration`) — there is no Go gateway behind the daemon's
 * outbound send/edit/presence calls in this harness, so they never reach `overlay.go`. They stay
 * IN-PROCESS, in the daemon's own singleton `MockChannelSender`. `readChannelSender` (backed by
 * `thread/controllers/TestReadChannelSender.ts`, mounted only under `CODM_ENV=e2e`) is the read door
 * onto that same instance — the counterpart of `injectInboundMessage`'s write door.
 *
 * ### Why the stub's frames give TWO distinct "Pensando" phases
 * `E2eStubAgentRunner` yields a SYNTHETIC `tool_use`/`tool_result` pair (no side effect, no real MCP
 * call) ahead of its real `ForkIssue` declaration, orchestrator-turns only — two distinct tool names
 * before the run ends, so `RunOrchestratorTurn`'s phase-edit tracking (`lastPhaseTool`) fires twice.
 *
 * ### Why this conversation ends up with TWO bot messages, not one, and why that is correct
 * The forked issue does not just sit there: it gets WORKED (`RunIssueTurn`, `declareIssueWorkComplete`)
 * and, on completion, queues an `ISSUE_RESULT` item BACK to the orchestrator's own mailbox — a SECOND
 * `RunOrchestratorTurn` run that reports the outcome (§7.3's issue-resume pivot, the same mechanism
 * `04-inbound-issue.spec.ts` exercises to watch the issue settle at COMPLETED). That second turn opens
 * its OWN "Pensando" placeholder on the SAME conversation — measured: both placeholders can appear
 * within ~1-2s of the inbound message. So "one messageId for the whole reply" (T2's own docblock,
 * `ReplyStreamer.opened`) is a property of ONE TURN, never of the whole multi-turn encounter — this
 * spec's invariant is the plan's literal AC-3 wording instead: the channel history ends with NO message
 * still reading a "Pensando" line, scoped per messageId, not a count of how many turns a
 * fork-and-report exchange produces.
 */
test('inbound message opens a "Pensando" placeholder that phases and settles into the final reply, and presence cuts after the whole encounter', async () => {
	test.setTimeout(60_000)

	const user = await givenFreshUser({})
	const thread = await givenAttachedThread(user.session)

	await injectInboundMessage(user.session, {
		channelId: thread.channelId,
		contactExternalId: thread.contactExternalId,
		senderExternalId: 'stranger-e2e',
		// No sentence-ending punctuation anywhere in the stub's canned lines, so the streaming cut
		// never fires mid-run (`decideCut`'s FIRST_SENTENCE trigger needs one) — the placeholder is
		// therefore untouched by a live cut, and the ONLY edits that land are the phase edits and the
		// final delivery's. That is what makes the phase-count assertion below unambiguous.
		text: `${thread.mentionTag} fix the login bug please`,
	})
	const conversation = { channelId: thread.channelId, remoteId: thread.contactExternalId }

	// AC-1 — "digitando…" (composing) observed promptly after the inbound message. `beginTypingPresence`
	// enqueues the first beat with NO delay, so this measures the run actually starting, not a race —
	// budgeted generously past the plan's "≤2s" because THIS harness stacks three independent polling
	// subsystems ahead of the beat (the outbox dispatcher's own cold-start backoff up to 2s, the mailbox
	// dispatcher's 250ms floor, the command queue's 1s floor) that a real production gateway does not.
	await expect
		.poll(async () => (await readChannelSender(user.session, conversation)).typingBeatCount, {
			timeout: 5_000,
			message: 'no composing beat observed shortly after the inbound message (AC-1)',
		})
		.toBeGreaterThan(0)

	// AC-3 (part 1) — the FIRST placeholder opens with the "✻ {verb}…" line. It is
	// unambiguously turn 1's: turn 2 (the ISSUE_RESULT report) cannot exist before the fork it reports
	// on, so `sent[0]` is always turn 1's placeholder regardless of how fast turn 2 follows.
	await expect
		.poll(async () => (await readChannelSender(user.session, conversation)).sent.length, {
			timeout: 10_000,
			message: 'the "Pensando" placeholder was never sent',
		})
		.toBeGreaterThan(0)

	const opened = await readChannelSender(user.session, conversation)
	expect(opened.sent[0]?.text).toMatch(OPENING_THINKING_LINE)
	const placeholderId = opened.sent[0]?.messageId as string

	// AC-3 (part 2) — the SAME messageId passes through ≥2 distinct "Pensando" phase edits (the
	// stub's synthetic tool phase, then its real ForkIssue declaration) before the final reply lands.
	// Each phase edit ADVANCES the glyph (`thinkingGlyphIndex`), so only the verb/glyph LINE SHAPE is
	// matched here, never the specific `✻` the opening line always carries.
	await expect
		.poll(
			async () => {
				const snap = await readChannelSender(user.session, conversation)
				return snap.edits.filter(edit => edit.messageId === placeholderId && THINKING_LINE.test(edit.text)).length
			},
			{ timeout: 15_000, message: 'fewer than 2 distinct "Pensando" phase edits landed on the placeholder (AC-3)' },
		)
		.toBeGreaterThanOrEqual(2)

	// AC-3 (part 3) — the reply eventually settles somewhere visible to the contact.
	//
	// ### A CONFIRMED GAP this spec's investigation surfaced, OUT OF T5's production-code fence
	// `ReplyStreamer.begin()` unconditionally `this.streams.delete(key)`s the conversation's slot —
	// including a slot turn 1's OWN stream still holds OPEN, not just a closed straggler. In THIS
	// harness turn 2 (the ISSUE_RESULT report, see the docblock above) can call `begin()` for the SAME
	// (channelId, remoteId) key before turn 1's own queued `deliver_channel_message` command has run.
	// When that command finally calls `claimFinal`, it finds no stream (`{ action: 'NONE' }`) and
	// `DeliverChannelMessage` falls back to `today's behaviour` — a PLAIN SEND — exactly the branch
	// documented for "nobody streamed this reply" (a channel that cannot edit, a turn too short for a
	// first cut). That fallback was never designed for "a LATER turn's `begin()` reclaimed the slot out
	// from under an EARLIER turn's still-pending delivery", so turn 1's OWN placeholder can be
	// permanently abandoned mid-phase while a NEW message (never edited from it) carries its answer.
	// Measured: reproduces because the e2e stub completes a turn in milliseconds, letting turn 2 start
	// before turn 1's async delivery command is even claimed — a gap real production traffic is very
	// unlikely to hit (turn 2 cannot exist before a real agent finishes WORKING the forked issue, which
	// dwarfs one command-queue poll tick). Reported rather than silently patched: fixing
	// `ReplyStreamer`/`DeliverChannelMessage` is production code, frozen and out of this task's fence
	// (`RunOrchestratorTurn`, `ReplyStreamer` are T2-owned). What THIS assertion proves instead is the
	// property that DOES hold regardless of which branch wins the race: the contact is never left with
	// no answer at all — the canonical reply text lands on SOME message in the conversation.
	await expect
		.poll(
			async () => {
				const snap = await readChannelSender(user.session, conversation)
				const finalTexts = snap.sent.map(message => lastEditOf(snap, message.messageId) ?? message.text)
				return finalTexts.some(text => text.includes('e2e-agent: acknowledged — working on it'))
			},
			{ timeout: 20_000, message: 'the reply text never landed on any message in the conversation' },
		)
		.toBe(true)

	// AC-1 (cessation) — once turn 1's own answer is visible, its composing loop has already been cut
	// (`DeliverChannelMessage.stopTypingPresence`, called right after ITS OWN send/edit lands): no new
	// beat shows up across a window wider than one heartbeat (`TYPING_BEAT_INTERVAL_MS` = 6s,
	// thread/utils/ChannelCues.ts). Read once more, right after the reply-text poll above resolved, so
	// this measures the SAME settled point the previous assertion just observed.
	const settled = await readChannelSender(user.session, conversation)
	const beatCountAtSettle = settled.typingBeatCount
	await new Promise(resolve => setTimeout(resolve, 8_000))
	const beatCountAfterWindow = (await readChannelSender(user.session, conversation)).typingBeatCount
	expect(beatCountAfterWindow, 'no new composing beat once the encounter settled — the presence loop was cut, not merely idle').toBe(
		beatCountAtSettle,
	)
})

/**
 * AC-6 — the error path: a run that fails before delivering anything edits the placeholder to the
 * friendly copy instead of leaving "✻ {verb}…" standing.
 *
 * `E2eStubAgentRunner.THINKING_ERROR_SENTINEL` in the inbound text makes the ORCHESTRATOR run throw
 * before yielding any frame — `RunOrchestratorTurn`'s placeholder is already open and the typing loop
 * already armed by then, so the throw reaches `closeCuesOnNoDelivery` exactly like a real provider
 * crash would.
 *
 * ### Why this does not also assert a long-window "no more beats" like the happy path above
 * `LibSqlMailboxDispatcher` retries a failed THREAD turn up to `MAX_ATTEMPTS = 3`, and the sentinel
 * still sits in the mailbox item's own payload on every retry — so a SECOND and THIRD attempt each
 * legitimately open their OWN placeholder and re-arm presence for THEIR OWN attempt, on a ~250ms poll
 * floor. That is correct behaviour, not a dangling indicator, and asserting a flat beat count across a
 * multi-second window would fail on a passing system. What is scoped to THIS spec is the FIRST
 * attempt's own placeholder — its edit to the error copy happens SYNCHRONOUSLY inside the failing call,
 * before the dispatcher's retry logic ever runs, so it is deterministic regardless of what the
 * dispatcher does afterwards. The exhaustive "never dangles even after every retry is spent" property
 * is `SustainTypingPresence.test.ts`'s own falseador (T4) — AC-2, not this spec's job (plan T5 scope).
 */
test('a run that fails edits the "Pensando" placeholder to the friendly error copy', async () => {
	test.setTimeout(60_000)

	const user = await givenFreshUser({})
	const thread = await givenAttachedThread(user.session)

	await injectInboundMessage(user.session, {
		channelId: thread.channelId,
		contactExternalId: thread.contactExternalId,
		senderExternalId: 'stranger-e2e',
		text: `${thread.mentionTag} e2e-thinking-error-trigger please help`,
	})
	const conversation = { channelId: thread.channelId, remoteId: thread.contactExternalId }

	// The FIRST attempt's placeholder still opens — the throw happens only once the run has already
	// started (typing armed, placeholder sent), never before.
	await expect
		.poll(async () => (await readChannelSender(user.session, conversation)).sent.length, {
			timeout: 10_000,
			message: 'the "Pensando" placeholder was never sent on the error path',
		})
		.toBeGreaterThan(0)

	const opened = await readChannelSender(user.session, conversation)
	const firstPlaceholderId = opened.sent[0]?.messageId as string
	expect(opened.sent[0]?.text).toMatch(OPENING_THINKING_LINE)

	// AC-6 — the friendly error copy replaces the placeholder, on the FIRST attempt's own messageId.
	await expect
		.poll(
			async () => {
				const snap = await readChannelSender(user.session, conversation)
				return lastEditOf(snap, firstPlaceholderId)
			},
			{ timeout: 20_000, message: 'the placeholder was never edited to the friendly error copy (AC-6)' },
		)
		.toBe('Tive um problema para terminar essa tarefa. Pode tentar de novo?')
})
