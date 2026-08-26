// Middlewares do contexto `shared` — os que valem para qualquer deployment.
//
// Nasceu em 2026-08-14 (W3 Task 4b) com o `CloudSessionMiddleware`, que substitui o
// `CloudSessionMiddleware` do `auth`. Vive aqui, e não em `auth`, porque o ADR 0001 leva `auth` inteiro
// para a nuvem e o daemon LOCAL continua precisando carimbar identidade em toda requisição.
export { CloudSessionMiddleware } from './CloudSessionMiddleware'
