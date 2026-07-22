# Session store-context refactor (2026-05-25)

Now that the session carries an active store (`ctx.session.storeId`, from SPEC-07
in `2026-05-25-refactor-batch-2`), store-scoped controllers should read it from
the session instead of `/stores/:storeId` path params + per-request membership
lookups.

| Spec | Title | Wave | Status |
|---|---|---|---|
| SPEC-01 | Store-scoped controllers read the active `storeId` from the session, not path params | 1 | todo |

**Depends on:** SPEC-07 (storeId on session) — its code has landed, but its spec
status still reads `todo`; flip/confirm that before executing this batch.
