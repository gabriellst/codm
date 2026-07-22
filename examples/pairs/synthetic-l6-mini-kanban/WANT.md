# Task: synthetic-l6-mini-kanban

BUILD A MINIMAL KANBAN APP, end to end, in this monorepo, from this one-line idea:
"Workspaces of boards; each board has ordered lists (columns); cards move between lists; everyone
viewing a board sees moves live. Auth is handled by the template."
You are the ORCHESTRATOR (you have the Task tool) — model, lock the contract, plan with handoffs,
then DISPATCH worker subagents per Task. Follow the full pipeline in the preamble. Scope it to the
CORE only (no labels/comments/attachments/due-dates): just boards, ordered lists as part of the
board, cards, and card moves with realtime.
ARCHITECTURE (non-negotiable, it is the grading rubric): DDD + Clean + CQRS + Event-Driven per the
root CLAUDE.md and docs/BACKEND.md / docs/FRONTEND.md. Decompose into SOUND bounded contexts —
the Board aggregate owns its lists as ordered VALUE OBJECTS/columns (do NOT make List its own
aggregate or context), Card is its own aggregate (identity + moves), membership/collaboration may
be its own context or folded into board. Board + Card MUST own real invariants (an archived board
rejects new cards; a card may only sit on a list that exists on its board). No god-context, no
per-table sprawl.
CONTRACT LOCK (freeze before building any context): author the integration event named exactly
`CardMoved` (TypeSpec model `CardMovedEvent`, event name `integration.shared.card.moved`, payload
carrying `boardId` (REQUIRED — the SSE realtime tenancy filter depends on it), `cardId`,
`fromListId`, `toListId`); add it to the BROWSER_EVENTS union in the ui ListenEvents controller so
it is realtime-subscribable; add the boards/cards tables (Drizzle); run `bun contracts` + `bun sdk`.
READ-SIDE: a BoardView projection (board → ordered lists → ordered cards) driven by a projector
from CardCreated/CardMoved, exposed via a `ui` BFF query.
FRONTEND (react, per packages/app/react/CLAUDE.md): a board route (thin shell, params typed), a
data-owning BoardSection (owns the GetBoard hook + routeApi + exactly one
useServerEvents(CardMoved…) that invalidates the GetBoard query key), a CreateCardDialog via
useDialogStore validating the SDK create-card mutation schema, and a card-move mutation (kept
whole, no try/catch/onError). Any status labels via the typed enums.* i18n catalog in BOTH locales.
E2E (packages/e2e, per .claude/skills/e2e): a Playwright spec at the EXACT path
packages/e2e/tests/kanban-board-realtime.spec.ts that sets up via the API request
context (not UI), uses role/label selectors, no waitForTimeout, and asserts the REALTIME path —
with the board open, move a card via the API and assert the row appears in the new column WITHOUT
reload. CRITICAL: this spec is graded by READING it (static analysis + a judge), NOT by running
Playwright — you CANNOT and need NOT run it here. So write the spec COMPLETE, with the real
assertions ACTIVE: actual `request.post/patch` calls, actual `await expect(...).toBeVisible()` on
the moved card. Do NOT comment out the body, do NOT leave `expect(true).toBe(true)`, do NOT
`.skip`/`.fixme`. A complete-but-unrun spec is CORRECT; a stubbed or commented-out spec is the
single most common failure here and grades as FAIL.
TESTS (TDD — per .claude/skills/test/typescript, NOT optional): the Card aggregate's bounded context
lives at packages/api/typescript/src/card/. Write COLOCATED tests there that PASS: (a) an ENTITY test
asserting a Card invariant (a card may only sit on a list that exists on its board; moving a card on
an archived board is rejected with the named domain error); (b) a USE CASE test in TestBed integration
mode (`TestBed.create('integration', …)`) for CreateCard / MoveCard. Green:
`cd packages/api/typescript && bun test src/card`.
GATES before done: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` AND
`bun test src/card` (green); `cd packages/app/react && bun x tsc --noEmit`; `cd packages/e2e && bun x
tsc --noEmit`; `bun run detect` clean at the repo root. Your final message must name the bounded
contexts you modeled, the frozen contract, the per-wave worker dispatch + gate results, the tests
written, and which core flows are covered.
