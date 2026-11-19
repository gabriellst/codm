// Vocabulário de forma que `shared` publica. `SessionSchema` mudou-se de `auth/` em 2026-08-14
// (W3 Task 4b): com `auth` indo para a nuvem, o daemon local precisa LER uma sessão mesmo sem poder
// EMITI-LA — e o middleware que a carimba vive aqui.
export { SessionSchema, type Session } from './SessionSchema'
export {
	IssueTimelineItemSchema,
	NudgeMarkSchema,
	PublishRunSchema,
	RegretWindowSchema,
	RetryScheduledSchema,
	SupervisorReviewSchema,
	type IssueTimelineItem,
} from './IssueTimelineItemSchema'
// Uma pergunta aberta da issue (fase 3) como quem responde a vê — no console e no painel.
export { AskReplySchema, AskViewSchema, type AskReply, type AskView } from './AskViewSchema'
export {
	PANEL_STEER_MAX,
	PanelActionBodySchema,
	PanelActionDeliverySchema,
	PanelActionOutcomeSchema,
	PanelOpenStopSchema,
	type PanelActionBody,
	type PanelActionDelivery,
	type PanelActionOutcome,
	type PanelOpenStop,
} from './PanelActionSchema'
