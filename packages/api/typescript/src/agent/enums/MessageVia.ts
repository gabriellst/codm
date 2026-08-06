/**
 * HOW a message reached the conversation, when nobody in the room saw it arrive.
 *
 * The prompt grammar puts one of these in the `via` attribute of a `<msg>` block, and its ABSENCE is
 * the common case: a message typed into the chat carries no `via`, because everyone present read it.
 * So the rule the model is given is a single sentence — *a block with `via` is a line only you can
 * see* — and it holds for both members without a second paragraph.
 *
 * ### Why this exists at all
 * Until it did, a console whisper and a scheduled prompt both arrived as `speaker: 'operator'`,
 * indistinguishable from something the operator had just typed. The agent answered a timer as if a
 * human were waiting, and thanked the room for a message the room never sent.
 *
 * ### Why it is agent-local and not a contracts enum
 * It is neither persisted nor read by Go: what the database stores is `fired_by_loop` (a label), and
 * this is the agent INPUT's vocabulary for rendering it. `MailboxItemKind`, which genuinely crosses to
 * the gateway, lives in contracts; this does not need to.
 */
export enum MessageVia {
	/** The operator whispered it from the console — the agents read it, the room never does. */
	STEER = 'steer',
	/** A scheduled prompt fired. The `de` attribute names WHICH loop. */
	LOOP = 'loop',
}
