/**
 * Who authored a consolidated message inside one agent turn (GOAL-agent-abstraction §4.3,
 * `AgentMessageEvent`).
 *
 * Exists because the alternative is `role: string` on a domain event — the exact stringly-typed
 * shape §8 rule 4 rejects for `model` and `stopReason`. The set is closed by the stream-json
 * transport itself: the bidirectional protocol has a `user` line written to stdin and `assistant`
 * frames read from stdout, and nothing else reaches the transcript.
 *
 * Context-private (not a contracts enum): the consolidated transcript never crosses a service
 * boundary as this vocabulary — a thread transcript entry crosses as `TranscriptKind`, which is a
 * DIFFERENT concept (who spoke in the human conversation, not who spoke inside one agent turn).
 * Aliasing the two would be exactly the "second truth about the same value-set" the canon forbids.
 */
export enum AgentMessageRole {
	USER = 'USER',
	ASSISTANT = 'ASSISTANT',
}
