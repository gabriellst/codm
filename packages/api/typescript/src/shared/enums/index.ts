// API-internal shared enums only. Cross-boundary enums live in packages/contracts — import from
// '@template/contracts-typescript/wire/enums'. QuotaKey validates inline via z.enum(QuotaKey);
// Language is now the single contracts wire enum (pt-BR/en-US), consumed directly from the binding.
export { IdempotencyScope } from './IdempotencyScope'
