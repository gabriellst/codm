// Pausa como comando (fase 2, item 2) — the control words a message can carry.
export * from './IssueControlCommand'
// Entregue/lido no WhatsApp (fase 2, item 5) — how far a routed steer got.
export * from './SteerProgress'
// Steer imediato (fase 2, item 4) — next step (default) or now.
export * from './SteerUrgency'
// Agir pelo painel (fase 2, item 6b) — the verb of the echo line the group gets.
export * from './PanelActionEcho'
// Responder (fase 3, item 3) — a bare "sim"/"não", how a reply answers a stop kind, and who may answer.
export * from './BareAnswer'
export * from './ReplyAnswerWay'
export * from './AnswerGate'
// Relatório como consulta (fase 3, item 4) — a command about the whole conversation, and the board's sections.
export * from './ThreadCommand'
