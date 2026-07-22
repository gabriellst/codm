# Task: synthetic-l6-notion

> Verbatim `prompt` field from `scripts/skill-evals/tasks/synthetic-l6-notion.yaml`.

BUILD A MINIMAL NOTION APP, end to end, in this monorepo, from this one-line idea:
"A workspace has pages; pages nest inside pages; a page is a TREE of typed blocks (text, heading,
toggle); a toggle block contains child blocks; editing or adding a block shows up live for everyone
viewing the page. Auth is handled by the template."
You are the ORCHESTRATOR (you have the Task tool) — model, lock the contract, plan with handoffs,
then DISPATCH a fresh worker subagent per Task. Follow the full pipeline in the preamble; YOU own all
modeling JUDGMENT, workers execute.
ARCHITECTURE (non-negotiable, it is the grading rubric): DDD + Clean + CQRS + Event-Driven per the
root CLAUDE.md and docs/BACKEND.md / docs/FRONTEND.md.
THE MODELING CHALLENGE IS RECURSION — get it right (read .claude/skills/ddd-modeling): a `page`
context owns the **Page aggregate**, and a Page owns a RECURSIVE TREE of Blocks. A Block is a TYPED
VALUE OBJECT / child entity (type: TEXT|HEADING|TOGGLE, content, order) that can itself hold
`children: Block[]` — the domain Block must be RECURSIVE (self-referential), not a flat list. Blocks
are VALUE OBJECTS OWNED BY the page — NOT their own aggregates (no Block repository/usecase/
controller/event; the Page is the consistency boundary for its whole block tree). Pages also nest:
a Page may have a `parentPageId` (pages form a tree). A `workspace` context owns the page hierarchy.
Page owns an invariant over its block tree (well-formed: children only under container blocks like
toggle; no cycles). Do NOT: make Block its own aggregate (over-model), flatten the tree to a
parentId-only list with no recursive children, or god-context (one `notion` context owning
workspace+page+block). BlockType is an ENUM (TEXT|HEADING|TOGGLE), not a context.
CONTRACT LOCK (freeze before building any context): author the integration event named exactly
`PageContentChanged` (TypeSpec model `PageContentChangedEvent`, event name
`integration.shared.page.content_changed`, payload carrying `workspaceId` (REQUIRED — SSE realtime
tenancy), `pageId`, a change kind); the `BlockType` enum in TypeSpec used by both languages; add it
to the BROWSER_EVENTS union in the ui ListenEvents controller; add the workspaces/pages/blocks tables
(Drizzle — blocks may store the tree adjacency-list style with parent_block_id + order); run `bun
contracts` + `bun sdk`.
READ-SIDE: a PageViewProjection — the page denormalized as its NESTED block tree (+ the page's
child-page list) — driven by a projector from PageCreated/BlockAdded/BlockEdited.
FRONTEND (react, per packages/app/react/CLAUDE.md): a page route (thin shell, params typed) with a
data-owning section that renders the RECURSIVE block tree via a RECURSIVE Block component (a Block
component that renders its children Blocks), owns the GetPageView hook + exactly one
useServerEvents(PageContentChanged…) invalidating the page-view query key; a page-tree nav; a
create-block mutation (kept whole). Block-type labels via the typed enums.BlockType.* catalog in BOTH
locales. EVERY actionable button wired (no dead buttons); NO hardcoded user-facing text (use t()).
E2E (packages/e2e, per .claude/skills/e2e): a Playwright spec at the EXACT path
packages/e2e/tests/notion-page-realtime.spec.ts that sets up via the API request context (not UI),
role/label/text selectors (NEVER getByTestId), no waitForTimeout, and asserts the REALTIME path —
with the page open, add/edit a block via the API and assert it appears WITHOUT reload. Graded by
READING (static + judge), not by running Playwright — write it COMPLETE with ACTIVE assertions;
never comment out the body / expect(true).toBe(true) / .skip.
TESTS (TDD — per .claude/skills/test/typescript, NOT optional): the Page aggregate's bounded context
lives at packages/api/typescript/src/page/. Write COLOCATED tests there that actually PASS: (a) an
ENTITY test asserting the block-tree INVARIANT (e.g. a child block can only be added under a
container/toggle block; a cycle / a block under a non-container is rejected with the named domain
error); (b) a USE CASE test in TestBed integration mode (`TestBed.create('integration', …)`)
asserting AddBlock / EditBlock behavior end to end. The suite must be green:
`cd packages/api/typescript && bun test src/page`.
GATES before done: `cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit` AND
`bun test src/page` (green); `cd packages/app/react && bun x tsc --noEmit`; `cd packages/e2e && bun x
tsc --noEmit`; `bun run detect` clean. Final message: the bounded contexts, the frozen contract,
per-Task worker dispatch + gate results, the tests written, and which core flows are covered.
