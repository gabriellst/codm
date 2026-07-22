# Phase R1 Conventions — Rewrite the kept mocks (READ FIRST, with phase1-conventions.md)

R0 is done: 6 new wire enums exist, all duplicate controllers were deleted. Your job: rewrite the KEPT mock controllers in ONE (or your assigned) context to the real-controller conventions, and build the few new ones. Also read `.plans/phase1-conventions.md` for the base Controller/Usecase templates + faker mock helper (still valid). Read `.plans/2026-06-02-mock-controllers-refactor.md` for the full decisions.

## Environment
- `packages/api/typescript`. Bun at `~/.bun/bin/bun` → `export PATH="$HOME/.bun/bin:$PATH"`. Alias `@*`→`src/*`.

## The rewrite — every kept controller must match the real controllers' shape
Study a REAL controller in your context first (e.g. `GetOrdersListController`, `GetDashboardOverviewController`, `GetIntegrationsListController`, `GetProfileSettingsController`) — copy its conventions exactly:

1. **ctx (item 22)** — store-scoped reads/commands: `ctx: z.object({ user: z.object({ id: z.string() }), membership: z.object({ storeId: z.uuid() }) })` and `override middlewares = [AuthAccountMiddleware, RequireStoreMember]` (import from `@auth/middlewares/...`). The usecase takes `storeId` (and `userId` where needed) and uses it as the query index.
   - **EXCEPTION — global/shell reads** (not store-scoped): `GetUserInfo`, `ListRecommendedApps`, `GetBanners`, `GetAppDownload`, `ListNotifications` → `ctx: { user: { id } }` only + `override middlewares = [AuthAccountMiddleware]` (no RequireStoreMember). Use judgment: if the data is per-store, it's store-scoped; if per-user or global, it's shell.
2. **Enums (items 3, 4a, 13)** — every closed set uses `z.enum(WireEnum)` from `@template/contracts-typescript/wire/enums`. NEVER `z.string()` for an enumerable (currency→`z.enum(CurrencyCode)`, language→`z.enum(Language)`, timezone→`z.enum(Timezone)`, country→`z.enum(Country)`, kit type→`z.enum(ProductCostType)`). NEVER `z.enum(['literal',...])` and NEVER `z.nativeEnum`. Delete inline `KitTypeSchema`/`CostCountrySchema`/etc. and use the wire enum. New enums available: `WarrantyPeriod, Language, Country, Timezone, ProductCostListFilter, AdTreeLevel`.
3. **Dates (item 4b)** — controller `z.stringToDate()`; usecase `z.date()`. `from`/`to`/`startDate`/`endDate` accordingly.
4. **Pagination (item 7)** — list controllers: `query: z.paginatedQuery({ ...filters, sortOrder: z.enum(SortOrder) })`; list usecase output: `z.paginatedResponse(ItemSchema)`. (Grep a real list controller for exact usage.)
5. **sortOrder (item 12)** — use `z.enum(SortOrder)` from `@shared/enums`, never a raw string/asc-desc literal.
6. **ids (item 23)** — any id collection is `ids: z.array(z.uuid())` (controller + usecase). Multi-select filters: `z.stringToArray(z.enum(Enum))`.
7. Keep faker bodies (from `@shared/testing/mock`) — only the schemas/ctx/middlewares change. Usecase still returns deterministic fixtures conforming to OutputSchema.

## Barrels
Append/keep exports in your context's `controllers/index.ts` + `usecases/index.ts`. If you rename a file (e.g. drop a `Bff` suffix), update both the file name and its barrel line.

## Done
`export PATH="$HOME/.bun/bin:$PATH"; cd packages/api/typescript && bun x tsc -p tsconfig.build.json --noEmit 2>&1 | grep 'src/<yourctx>/'` → zero errors in your context. Ignore sibling-context transient errors. Report files changed/created + anything blocked.
