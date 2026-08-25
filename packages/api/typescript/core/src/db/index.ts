export * from './utils'
export * from './drivers'
// O upsert guardado por versão existe nas DUAS famílias — mesma semântica, genéricas diferentes —
// e cada uma exporta o SEU: `pgSaveWithOptimisticLock` e `libSqlSaveWithOptimisticLock`. Não há
// versão neutra e não deve haver: `PgTable | SQLiteTable` não sobrevive ao uso (D1, prova TS2349).
// Nome prefixado pela mesma razão de `pg/client.ts` → `PgDrizzleClient`: os dois barris caem aqui.
export * from './libsql'
export * from './pg'
export * from './conformance/harness'
export * from './conformance/idempotency-conformance'
export * from './conformance/outbox-conformance'
