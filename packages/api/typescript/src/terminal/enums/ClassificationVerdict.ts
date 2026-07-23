/**
 * The classifier LLM's structured VERDICT (the raw enum the LLM must answer with) for an inbound message (IssueClassifier). Context-private:
 * the routed DECISION crosses contexts on `integration.message.classified` as method/issueId, never
 * as this raw value.
 */
export enum ClassificationVerdict {
	MATCH_ISSUE = 'MATCH_ISSUE',
	NEW_ISSUE = 'NEW_ISSUE',
	CLARIFY = 'CLARIFY',
}
