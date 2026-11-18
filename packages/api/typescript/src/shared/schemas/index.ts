// Vocabulário de forma que `shared` publica. `SessionSchema` mudou-se de `auth/` em 2026-08-14
// (W3 Task 4b): com `auth` indo para a nuvem, o daemon local precisa LER uma sessão mesmo sem poder
// EMITI-LA — e o middleware que a carimba vive aqui.
export { SessionSchema, type Session } from './SessionSchema'
export { IssueTimelineItemSchema, RegretWindowSchema, type IssueTimelineItem } from './IssueTimelineItemSchema'
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
