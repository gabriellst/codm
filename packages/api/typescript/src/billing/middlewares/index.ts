import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'

// Billing's context-default middleware chain: every controller authenticates the account
// (populates `ctx.user` + `ctx.session.ownerId`) unless it opts out via `skipMiddlewares`
// (the public webhook + sandbox-checkout endpoints). Owner-scoped command controllers add
// `RequireOwner` on top, per-controller. The template models one responsible user per Owner —
// there is no AuthActorMiddleware / member-role axis here (medscall@f04e8a0f divergence dropped).
export default [AuthAccountMiddleware]
