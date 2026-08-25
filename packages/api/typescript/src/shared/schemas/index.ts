// Vocabulário de forma que `shared` publica. `SessionSchema` mudou-se de `auth/` em 2026-08-14
// (W3 Task 4b): com `auth` indo para a nuvem, o daemon local precisa LER uma sessão mesmo sem poder
// EMITI-LA — e o middleware que a carimba vive aqui.
export { SessionSchema, type Session } from './SessionSchema'
