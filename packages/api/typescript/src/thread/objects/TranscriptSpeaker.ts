/**
 * WHAT THE AGENT'S OWN LINES ARE CALLED when a transcript is rendered for a model to read.
 *
 * Declared once because two contexts write it. The conversation window labels every `SYSTEM` row with
 * it (`RunOrchestratorTurn`), and the ingest labels a quoted `SYSTEM` row with it when a message
 * replies to the agent (`IngestChannelMessage`) — and the two MUST agree, or the same reply arrives
 * attributed to `you` in the history and to somebody else in the quote, which is precisely the state
 * that makes a model answer its own words as if a human had said them.
 *
 * Second person, not a name: it is the model reading its own past turns, and a third-person label is
 * how a model starts replying to itself.
 */
export const AGENT_SPEAKER = 'you'

/**
 * The roster id the OWNER always occupies — seeded by `AttachThread`, always `canInvoke: true` — and,
 * because it is a word rather than a JID, the label their lines carry in a rendered transcript too.
 *
 * The roster is about OTHER PEOPLE: it exists so the operator can mute specific participants, and
 * muting yourself is meaningless. So a message the owner typed is attributed to THIS id whichever
 * device it came from — the phone, another web client, or the console — rather than to their own
 * phone-number JID, which the gateway snapshot also puts in the roster with `canInvoke: false` (it
 * enumerates every group participant with no self filter). Without this, the owner's own message is
 * denied by the participant check BEFORE the mention gate is ever consulted.
 *
 * It lives HERE rather than on the entity so the agent context can read it without importing a
 * write-model (`CROSS_CONTEXT_POLICY` forbids `entities`, allows `objects`). `Thread.ts` re-exports it,
 * so its long-standing importers are untouched.
 */
export const OPERATOR_PARTICIPANT_ID = 'operator'
