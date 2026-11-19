/**
 * The discriminant of `ModelChoice` (fase 4, item 6d — `agent/utils/ModelByWorkKind.ts`): what a kind of work runs on.
 *  - `CONVERSATION` — the conversation's model, read when the task is forked;
 *  - `MODEL` — the model the table names.
 * Context-private: never on the wire.
 */
export enum ModelChoiceKind {
	CONVERSATION = 'CONVERSATION',
	MODEL = 'MODEL',
}
