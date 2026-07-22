# P0-FOUNDATION — BK Dash Shared Types & Events — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox (`- [ ]`)
> syntax for tracking. Each Task wraps one observable behavior in an outer
> RED→GREEN cycle. Files land under `packages/api/src/shared/` only —
> NO BC-specific code in this sub-plan.

**Goal:** Land every shared type, enum, Zod schema, integration-event payload, and error-glossary scaffolding declared in spec §7.0 + Integration Events Summary, under `packages/api/src/shared/`, so every BC sub-plan can import them without circular deps.

**Architecture:** One file per coherent group of types (currency, identity, platform, sales-primitives, etc.). Each file exports TypeScript types + Zod schemas, with the Zod schemas attaching `error: '<TYPED_CODE>'` per the existing `packages/api/src/game/entities/Game.ts` convention. Integration events extend `BaseIntegrationEvent` and use the `z.integrationEvent({...})` helper at `packages/api/src/shared/utils/schema`. Error glossary is per-BC typed string unions, mirroring `packages/api/src/game/errors/index.ts`.

**Tech Stack:** TypeScript, Bun, Zod
**Spec:** `.specs/2026-05-21-ddd-modeling-bk-dash.md` (§7.0, §7.13)
**Master plan:** `.plans/2026-05-21-bk-dash-port.md` (sub-plan P0-FOUNDATION)
**Depends on sub-plans:** none
**Tasks:** 18
**Estimated minutes:** ~260

---

## Convention reference (absorbed during planning, NOT to be re-read by /build)

- Enum file shape: `packages/api/src/game/enums/GameGenre.ts` — `export enum X { A = 'A', ... }`.
- Schema/entity shape: `packages/api/src/game/entities/Game.ts` — Zod with `.error` codes, exports `<X>Props = z.infer<typeof XSchema>`.
- Error glossary shape: `packages/api/src/game/errors/index.ts` — typed string unions per layer (Domain / Application / Interface / Infrastructure), composed into `Errors` union.
- Integration event shape: `packages/api/src/shared/events/GameCreatedIntegrationEvent.ts` — `z.integrationEvent({...})` + class extending `BaseIntegrationEvent` + static `name = 'integration.X.Y' as const` + static `schema`.
- Schema helper import: `import { z } from '@shared/utils/schema'` (NOT plain `zod`).
- Test placement: colocated `<File>.test.ts`. `bun:test` runner. No DI container needed for pure type tests — instantiate Zod parse + assert.

---

## Task 1: Currency primitives parse and round-trip

**Files:**
- Create: `packages/api/src/shared/types/CurrencyCode.ts`
- Create: `packages/api/src/shared/types/MonetaryAmount.ts`
- Create: `packages/api/src/shared/types/MonetaryByCurrency.ts`
- Test: `packages/api/src/shared/types/MonetaryAmount.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { CurrencyCodeSchema, type CurrencyCode } from './CurrencyCode'
import { MonetaryAmountSchema, type MonetaryAmount } from './MonetaryAmount'
import { MonetaryByCurrencySchema, type MonetaryByCurrency } from './MonetaryByCurrency'

describe('CurrencyCode', () => {
	it('accepts all 25 spec-listed codes', () => {
		const codes: CurrencyCode[] = ['ARS','AUD','BRL','CAD','CHF','CLP','COP','CZK','DKK','EUR','GBP','GTQ','HKD','HUF','JPY','MXN','NOK','NZD','PLN','RON','RUB','SEK','SGD','USD','ZAR']
		for (const c of codes) expect(CurrencyCodeSchema.safeParse(c).success).toBe(true)
	})

	it('rejects unknown codes', () => {
		expect(CurrencyCodeSchema.safeParse('XYZ').success).toBe(false)
		expect(CurrencyCodeSchema.safeParse('brl').success).toBe(false) // case-sensitive
	})
})

describe('MonetaryAmount', () => {
	it('parses a valid amount', () => {
		const ok: MonetaryAmount = { amountCents: 12999, currency: 'BRL' }
		expect(MonetaryAmountSchema.safeParse(ok).success).toBe(true)
	})

	it('allows negative amounts (refunds/overrides)', () => {
		expect(MonetaryAmountSchema.safeParse({ amountCents: -500, currency: 'USD' }).success).toBe(true)
	})

	it('rejects float amounts', () => {
		expect(MonetaryAmountSchema.safeParse({ amountCents: 12.5, currency: 'BRL' }).success).toBe(false)
	})

	it('rejects bad currency', () => {
		expect(MonetaryAmountSchema.safeParse({ amountCents: 1, currency: 'XYZ' }).success).toBe(false)
	})
})

describe('MonetaryByCurrency', () => {
	it('parses a sparse map', () => {
		const v: MonetaryByCurrency = { BRL: 1249900, USD: -50000, EUR: 80000 }
		expect(MonetaryByCurrencySchema.safeParse(v).success).toBe(true)
	})

	it('parses an empty map', () => {
		expect(MonetaryByCurrencySchema.safeParse({}).success).toBe(true)
	})

	it('rejects float values', () => {
		expect(MonetaryByCurrencySchema.safeParse({ BRL: 1.5 }).success).toBe(false)
	})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/api/src/shared/types/MonetaryAmount.test.ts`
Expected: FAIL with `Cannot find module './CurrencyCode'`.

- [ ] **Step 3: Write implementations**

`packages/api/src/shared/types/CurrencyCode.ts`:
```typescript
import { z } from '@shared/utils/schema'

export const CURRENCY_CODES = [
	'ARS','AUD','BRL','CAD','CHF','CLP','COP','CZK','DKK','EUR','GBP','GTQ','HKD','HUF',
	'JPY','MXN','NOK','NZD','PLN','RON','RUB','SEK','SGD','USD','ZAR',
] as const

export const CurrencyCodeSchema = z.enum(CURRENCY_CODES)
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>
```

`packages/api/src/shared/types/MonetaryAmount.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { CurrencyCodeSchema } from './CurrencyCode'

export const MonetaryAmountSchema = z.object({
	amountCents: z.number().int(),
	currency: CurrencyCodeSchema,
})

export type MonetaryAmount = z.infer<typeof MonetaryAmountSchema>
```

`packages/api/src/shared/types/MonetaryByCurrency.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { CURRENCY_CODES } from './CurrencyCode'

// Sparse map: not every currency has to be present; values are amountCents (int, may be negative).
export const MonetaryByCurrencySchema = z.record(z.enum(CURRENCY_CODES), z.number().int())
export type MonetaryByCurrency = z.infer<typeof MonetaryByCurrencySchema>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test packages/api/src/shared/types/MonetaryAmount.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 5: Type-check + lint**

Run: `bun tsc && bun lint`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/shared/types/CurrencyCode.ts \
        packages/api/src/shared/types/MonetaryAmount.ts \
        packages/api/src/shared/types/MonetaryByCurrency.ts \
        packages/api/src/shared/types/MonetaryAmount.test.ts
git commit -m "feat(shared): currency primitives — CurrencyCode, MonetaryAmount, MonetaryByCurrency (P0 Task 1)"
```

---

## Task 2: FxRate append-only effective-period model

**Files:**
- Create: `packages/api/src/shared/types/FxRate.ts`
- Test: `packages/api/src/shared/types/FxRate.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema
**Depends on:** Task 1

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { FxRateSchema, FxRateSourceSchema, type FxRate } from './FxRate'

describe('FxRate', () => {
	it('accepts a valid rate', () => {
		const r: FxRate = { fromCurrency: 'BRL', toCurrency: 'USD', rate: 0.20, source: 'CURRENCY_API', startDate: '2026-05-21' }
		expect(FxRateSchema.safeParse(r).success).toBe(true)
	})

	it('accepts ISO datetime startDate', () => {
		expect(FxRateSchema.safeParse({ fromCurrency: 'BRL', toCurrency: 'USD', rate: 0.20, source: 'MANUAL', startDate: '2026-05-21T03:00:00Z' }).success).toBe(true)
	})

	it('rejects negative rate', () => {
		expect(FxRateSchema.safeParse({ fromCurrency: 'BRL', toCurrency: 'USD', rate: -1, source: 'CURRENCY_API', startDate: '2026-05-21' }).success).toBe(false)
	})

	it('rejects unknown source', () => {
		expect(FxRateSourceSchema.safeParse('OTHER').success).toBe(false)
	})
})
```

- [ ] **Step 2: Verify failure**

Run: `bun test packages/api/src/shared/types/FxRate.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write implementation**

`packages/api/src/shared/types/FxRate.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { CurrencyCodeSchema } from './CurrencyCode'

export const FxRateSourceSchema = z.enum(['CURRENCY_API', 'MANUAL', 'PROVIDER_REPORTED'])
export type FxRateSource = z.infer<typeof FxRateSourceSchema>

export const FxRateSchema = z.object({
	fromCurrency: CurrencyCodeSchema,
	toCurrency: CurrencyCodeSchema,
	rate: z.number().positive(),
	source: FxRateSourceSchema,
	startDate: z.iso.datetime({ offset: true }).or(z.iso.date()),
})

export type FxRate = z.infer<typeof FxRateSchema>
```

- [ ] **Step 4: Verify pass**

Run: `bun test packages/api/src/shared/types/FxRate.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check + lint**

Run: `bun tsc && bun lint`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/shared/types/FxRate.ts \
        packages/api/src/shared/types/FxRate.test.ts
git commit -m "feat(shared): FxRate + FxRateSource — append-only effective-period model (P0 Task 2)"
```

---

## Task 3: Identity primitives — Role, NotificationCurrencyMode, FcmPlatform

**Files:**
- Create: `packages/api/src/shared/enums/Role.ts`
- Create: `packages/api/src/shared/enums/NotificationCurrencyMode.ts`
- Create: `packages/api/src/shared/enums/FcmPlatform.ts`
- Create: `packages/api/src/shared/enums/index.ts` (barrel — initial)
- Test: `packages/api/src/shared/enums/identity.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { Role, RoleSchema } from './Role'
import { NotificationCurrencyMode, NotificationCurrencyModeSchema } from './NotificationCurrencyMode'
import { FcmPlatform, FcmPlatformSchema } from './FcmPlatform'

describe('Identity enums', () => {
	it('Role exposes OWNER / ADMIN / MEMBER', () => {
		expect(Role.OWNER).toBe('OWNER')
		expect(Role.ADMIN).toBe('ADMIN')
		expect(Role.MEMBER).toBe('MEMBER')
		expect(RoleSchema.safeParse('OWNER').success).toBe(true)
		expect(RoleSchema.safeParse('SUPER_ADMIN').success).toBe(false)
	})

	it('NotificationCurrencyMode exposes the three modes', () => {
		expect(NotificationCurrencyMode.SALE_CURRENCY).toBe('SALE_CURRENCY')
		expect(NotificationCurrencyMode.STORE_CURRENCY).toBe('STORE_CURRENCY')
		expect(NotificationCurrencyMode.CUSTOM_CURRENCY).toBe('CUSTOM_CURRENCY')
		expect(NotificationCurrencyModeSchema.safeParse('STORE_CURRENCY').success).toBe(true)
	})

	it('FcmPlatform exposes IOS / ANDROID / WEB', () => {
		expect(FcmPlatform.IOS).toBe('IOS')
		expect(FcmPlatformSchema.safeParse('WEB').success).toBe(true)
		expect(FcmPlatformSchema.safeParse('windows').success).toBe(false)
	})
})
```

- [ ] **Step 2: Verify failure**

Run: `bun test packages/api/src/shared/enums/identity.test.ts`
Expected: FAIL with module-not-found.

- [ ] **Step 3: Write implementations**

`packages/api/src/shared/enums/Role.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum Role {
	OWNER = 'OWNER',
	ADMIN = 'ADMIN',
	MEMBER = 'MEMBER',
}

export const RoleSchema = z.enum(Role)
```

`packages/api/src/shared/enums/NotificationCurrencyMode.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum NotificationCurrencyMode {
	SALE_CURRENCY = 'SALE_CURRENCY',
	STORE_CURRENCY = 'STORE_CURRENCY',
	CUSTOM_CURRENCY = 'CUSTOM_CURRENCY',
}

export const NotificationCurrencyModeSchema = z.enum(NotificationCurrencyMode)
```

`packages/api/src/shared/enums/FcmPlatform.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum FcmPlatform {
	IOS = 'IOS',
	ANDROID = 'ANDROID',
	WEB = 'WEB',
}

export const FcmPlatformSchema = z.enum(FcmPlatform)
```

`packages/api/src/shared/enums/index.ts`:
```typescript
export { Role, RoleSchema } from './Role'
export { NotificationCurrencyMode, NotificationCurrencyModeSchema } from './NotificationCurrencyMode'
export { FcmPlatform, FcmPlatformSchema } from './FcmPlatform'
```

- [ ] **Step 4: Verify pass + tsc/lint**

Run: `bun test packages/api/src/shared/enums/identity.test.ts && bun tsc && bun lint`
Expected: PASS, 0 tsc errors, 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/enums/Role.ts \
        packages/api/src/shared/enums/NotificationCurrencyMode.ts \
        packages/api/src/shared/enums/FcmPlatform.ts \
        packages/api/src/shared/enums/index.ts \
        packages/api/src/shared/enums/identity.test.ts
git commit -m "feat(shared): identity enums — Role, NotificationCurrencyMode, FcmPlatform (P0 Task 3)"
```

---

## Task 4: Platform discriminator — types + Platform union + IntegrationCredentialField

**Files:**
- Create: `packages/api/src/shared/enums/StoreIntegrationType.ts`
- Create: `packages/api/src/shared/enums/SalesPlatform.ts`
- Create: `packages/api/src/shared/enums/CheckoutPlatform.ts`
- Create: `packages/api/src/shared/enums/PaymentGatewayPlatform.ts`
- Create: `packages/api/src/shared/enums/MarketingPlatform.ts`
- Create: `packages/api/src/shared/types/Platform.ts`
- Create: `packages/api/src/shared/types/IntegrationCredentialField.ts`
- Modify: `packages/api/src/shared/enums/index.ts` — append the 5 new enum exports
- Test: `packages/api/src/shared/types/Platform.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /schema
**Depends on:** Task 3

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { StoreIntegrationType } from '../enums/StoreIntegrationType'
import { SalesPlatform } from '../enums/SalesPlatform'
import { MarketingPlatform } from '../enums/MarketingPlatform'
import { PlatformSchema, type Platform } from './Platform'
import { IntegrationCredentialFieldSchema } from './IntegrationCredentialField'

describe('Platform discriminated union', () => {
	it('parses a SALES_CHANNEL Shopify connection', () => {
		const p: Platform = { type: StoreIntegrationType.SALES_CHANNEL, platform: SalesPlatform.SHOPIFY }
		expect(PlatformSchema.safeParse(p).success).toBe(true)
	})

	it('parses a MARKETING_PLATFORM Meta connection', () => {
		const p: Platform = { type: StoreIntegrationType.MARKETING_PLATFORM, platform: MarketingPlatform.META }
		expect(PlatformSchema.safeParse(p).success).toBe(true)
	})

	it('rejects cross-typed pairing (SALES_CHANNEL + META)', () => {
		expect(PlatformSchema.safeParse({ type: 'SALES_CHANNEL', platform: 'META' }).success).toBe(false)
	})

	it('IntegrationCredentialField rejects unknown field type', () => {
		expect(IntegrationCredentialFieldSchema.safeParse({ key: 'token', label: 'Token', type: 'NUMBER', required: true }).success).toBe(false)
	})

	it('IntegrationCredentialField accepts a PASSWORD field', () => {
		expect(IntegrationCredentialFieldSchema.safeParse({ key: 'apiKey', label: 'API Key', type: 'PASSWORD', required: true }).success).toBe(true)
	})
})
```

- [ ] **Step 2: Verify failure**

Run: `bun test packages/api/src/shared/types/Platform.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write implementations**

`packages/api/src/shared/enums/StoreIntegrationType.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum StoreIntegrationType {
	SALES_CHANNEL = 'SALES_CHANNEL',
	CHECKOUT = 'CHECKOUT',
	PAYMENT_GATEWAY = 'PAYMENT_GATEWAY',
	MARKETING_PLATFORM = 'MARKETING_PLATFORM',
}

export const StoreIntegrationTypeSchema = z.enum(StoreIntegrationType)
```

`packages/api/src/shared/enums/SalesPlatform.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum SalesPlatform {
	SHOPIFY = 'SHOPIFY',
	NUVEM_SHOP = 'NUVEM_SHOP',
	CART_PANDA = 'CART_PANDA',
	YAMPI = 'YAMPI',
	KIWIFY = 'KIWIFY',
}

export const SalesPlatformSchema = z.enum(SalesPlatform)
```

`packages/api/src/shared/enums/CheckoutPlatform.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum CheckoutPlatform {
	CART_PANDA = 'CART_PANDA',
	YAMPI = 'YAMPI',
}

export const CheckoutPlatformSchema = z.enum(CheckoutPlatform)
```

`packages/api/src/shared/enums/PaymentGatewayPlatform.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum PaymentGatewayPlatform {
	STRIPE = 'STRIPE',
}

export const PaymentGatewayPlatformSchema = z.enum(PaymentGatewayPlatform)
```

`packages/api/src/shared/enums/MarketingPlatform.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum MarketingPlatform {
	META = 'META',
	GOOGLE_ADS = 'GOOGLE_ADS',
	TIKTOK = 'TIKTOK',
}

export const MarketingPlatformSchema = z.enum(MarketingPlatform)
```

`packages/api/src/shared/types/Platform.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { SalesPlatformSchema } from '../enums/SalesPlatform'
import { CheckoutPlatformSchema } from '../enums/CheckoutPlatform'
import { PaymentGatewayPlatformSchema } from '../enums/PaymentGatewayPlatform'
import { MarketingPlatformSchema } from '../enums/MarketingPlatform'

export const PlatformSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('SALES_CHANNEL'),      platform: SalesPlatformSchema }),
	z.object({ type: z.literal('CHECKOUT'),           platform: CheckoutPlatformSchema }),
	z.object({ type: z.literal('PAYMENT_GATEWAY'),    platform: PaymentGatewayPlatformSchema }),
	z.object({ type: z.literal('MARKETING_PLATFORM'), platform: MarketingPlatformSchema }),
])

export type Platform = z.infer<typeof PlatformSchema>
```

`packages/api/src/shared/types/IntegrationCredentialField.ts`:
```typescript
import { z } from '@shared/utils/schema'

export const IntegrationCredentialFieldSchema = z.object({
	key: z.string().min(1),
	label: z.string().min(1),
	type: z.enum(['TEXT', 'PASSWORD', 'OAUTH_TOKEN']),
	required: z.boolean(),
})

export type IntegrationCredentialField = z.infer<typeof IntegrationCredentialFieldSchema>
```

Modify `packages/api/src/shared/enums/index.ts`:
- Append five `export ... from './<EnumName>'` lines for the new enums.

- [ ] **Step 4: Verify pass + tsc/lint**

Run: `bun test packages/api/src/shared/types/Platform.test.ts && bun tsc && bun lint`
Expected: PASS, 0 tsc errors, 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/enums/StoreIntegrationType.ts \
        packages/api/src/shared/enums/SalesPlatform.ts \
        packages/api/src/shared/enums/CheckoutPlatform.ts \
        packages/api/src/shared/enums/PaymentGatewayPlatform.ts \
        packages/api/src/shared/enums/MarketingPlatform.ts \
        packages/api/src/shared/enums/index.ts \
        packages/api/src/shared/types/Platform.ts \
        packages/api/src/shared/types/IntegrationCredentialField.ts \
        packages/api/src/shared/types/Platform.test.ts
git commit -m "feat(shared): Platform discriminated union + IntegrationCredentialField (P0 Task 4)"
```

---

## Task 5: Sales primitive enums + PostalAddress + UtmTags

**Files:**
- Create: `packages/api/src/shared/enums/PaymentStatus.ts`
- Create: `packages/api/src/shared/enums/PaymentMethod.ts`
- Create: `packages/api/src/shared/enums/PaymentGateway.ts`
- Create: `packages/api/src/shared/enums/TransactionKind.ts`
- Create: `packages/api/src/shared/enums/TransactionStatus.ts`
- Create: `packages/api/src/shared/enums/DisputeStatus.ts`
- Create: `packages/api/src/shared/enums/OrderTransactionFeeType.ts`
- Create: `packages/api/src/shared/types/PostalAddress.ts`
- Create: `packages/api/src/shared/types/UtmTags.ts`
- Modify: `packages/api/src/shared/enums/index.ts` — append 7 new enum exports
- Test: `packages/api/src/shared/types/PostalAddress.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /schema
**Depends on:** Task 3

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { PaymentStatus, PaymentStatusSchema } from '../enums/PaymentStatus'
import { PaymentMethod } from '../enums/PaymentMethod'
import { PaymentGateway } from '../enums/PaymentGateway'
import { TransactionKind } from '../enums/TransactionKind'
import { TransactionStatus } from '../enums/TransactionStatus'
import { DisputeStatus } from '../enums/DisputeStatus'
import { OrderTransactionFeeType } from '../enums/OrderTransactionFeeType'
import { PostalAddressSchema } from './PostalAddress'
import { UtmTagsSchema } from './UtmTags'

describe('Sales primitives', () => {
	it('PaymentStatus exposes 8 spec values', () => {
		const all = ['PENDING','AUTHORIZED','PAID','PARTIALLY_PAID','UNPAID','REFUNDED','PARTIALLY_REFUNDED','VOIDED']
		for (const v of all) expect(PaymentStatusSchema.safeParse(v).success).toBe(true)
	})

	it('PaymentMethod / PaymentGateway / TransactionKind / TransactionStatus / DisputeStatus / OrderTransactionFeeType exist', () => {
		expect(PaymentMethod.PIX).toBe('PIX')
		expect(PaymentGateway.STRIPE).toBe('STRIPE')
		expect(TransactionKind.REFUND).toBe('REFUND')
		expect(TransactionStatus.SUCCESS).toBe('SUCCESS')
		expect(DisputeStatus.NONE).toBe('NONE')
		expect(OrderTransactionFeeType.PROCESSING).toBe('PROCESSING')
	})

	it('PostalAddress parses minimal + full', () => {
		expect(PostalAddressSchema.safeParse({}).success).toBe(true) // all optional
		expect(PostalAddressSchema.safeParse({ city: 'São Paulo', countryCode: 'BR', zipCode: '01000-000' }).success).toBe(true)
	})

	it('UtmTags accepts subset', () => {
		expect(UtmTagsSchema.safeParse({}).success).toBe(true)
		expect(UtmTagsSchema.safeParse({ source: 'instagram', campaign: 'launch' }).success).toBe(true)
	})
})
```

- [ ] **Step 2: Verify failure**

Run: `bun test packages/api/src/shared/types/PostalAddress.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write enums (each file mirrors Task-3 enum shape — `enum X { A = 'A', ... }` + `export const XSchema = z.enum(X)`)**

`packages/api/src/shared/enums/PaymentStatus.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum PaymentStatus {
	PENDING = 'PENDING',
	AUTHORIZED = 'AUTHORIZED',
	PAID = 'PAID',
	PARTIALLY_PAID = 'PARTIALLY_PAID',
	UNPAID = 'UNPAID',
	REFUNDED = 'REFUNDED',
	PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
	VOIDED = 'VOIDED',
}

export const PaymentStatusSchema = z.enum(PaymentStatus)
```

`packages/api/src/shared/enums/PaymentMethod.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum PaymentMethod {
	CREDIT_CARD = 'CREDIT_CARD',
	DEBIT_CARD = 'DEBIT_CARD',
	PIX = 'PIX',
	BANK_SLIP = 'BANK_SLIP',
	CASH = 'CASH',
	BANK_TRANSFER = 'BANK_TRANSFER',
	DIGITAL_WALLET = 'DIGITAL_WALLET',
	OTHER = 'OTHER',
}

export const PaymentMethodSchema = z.enum(PaymentMethod)
```

`packages/api/src/shared/enums/PaymentGateway.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum PaymentGateway {
	APPMAX = 'APPMAX',
	STRIPE = 'STRIPE',
	PAYPAL = 'PAYPAL',
	SHOPIFY_PAYMENTS = 'SHOPIFY_PAYMENTS',
	MERCADOPAGO = 'MERCADOPAGO',
	PAGAR_ME = 'PAGAR_ME',
	YEVER = 'YEVER',
	UNKNOWN = 'UNKNOWN',
	DEFAULT = 'DEFAULT',
}

export const PaymentGatewaySchema = z.enum(PaymentGateway)
```

`packages/api/src/shared/enums/TransactionKind.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum TransactionKind {
	AUTHORIZATION = 'AUTHORIZATION',
	CAPTURE = 'CAPTURE',
	SALE = 'SALE',
	REFUND = 'REFUND',
	VOID = 'VOID',
	CHARGEBACK = 'CHARGEBACK',
}

export const TransactionKindSchema = z.enum(TransactionKind)
```

`packages/api/src/shared/enums/TransactionStatus.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum TransactionStatus {
	PENDING = 'PENDING',
	SUCCESS = 'SUCCESS',
	FAILURE = 'FAILURE',
	ERROR = 'ERROR',
}

export const TransactionStatusSchema = z.enum(TransactionStatus)
```

`packages/api/src/shared/enums/DisputeStatus.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum DisputeStatus {
	NONE = 'NONE',
	OPEN = 'OPEN',
	UNDER_REVIEW = 'UNDER_REVIEW',
	WON = 'WON',
	LOST = 'LOST',
	ACCEPTED = 'ACCEPTED',
}

export const DisputeStatusSchema = z.enum(DisputeStatus)
```

`packages/api/src/shared/enums/OrderTransactionFeeType.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum OrderTransactionFeeType {
	PROCESSING = 'PROCESSING',
	EXCHANGE = 'EXCHANGE',
	UNKNOWN = 'UNKNOWN',
}

export const OrderTransactionFeeTypeSchema = z.enum(OrderTransactionFeeType)
```

`packages/api/src/shared/types/PostalAddress.ts`:
```typescript
import { z } from '@shared/utils/schema'

export const PostalAddressSchema = z.object({
	line1: z.string().optional(),
	line2: z.string().optional(),
	city: z.string().optional(),
	province: z.string().optional(),
	provinceCode: z.string().optional(),
	zipCode: z.string().optional(),
	country: z.string().optional(),
	countryCode: z.string().length(2).optional(),
	latitude: z.number().optional(),
	longitude: z.number().optional(),
	phoneNumber: z.string().optional(),
})

export type PostalAddress = z.infer<typeof PostalAddressSchema>
```

`packages/api/src/shared/types/UtmTags.ts`:
```typescript
import { z } from '@shared/utils/schema'

export const UtmTagsSchema = z.object({
	source: z.string().optional(),
	medium: z.string().optional(),
	campaign: z.string().optional(),
	term: z.string().optional(),
	content: z.string().optional(),
})

export type UtmTags = z.infer<typeof UtmTagsSchema>
```

Modify `packages/api/src/shared/enums/index.ts`:
- Append `export ... from './<EnumName>'` for all 7 new enums.

- [ ] **Step 4: Verify pass + tsc/lint**

Run: `bun test packages/api/src/shared/types/PostalAddress.test.ts && bun tsc && bun lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/enums/{PaymentStatus,PaymentMethod,PaymentGateway,TransactionKind,TransactionStatus,DisputeStatus,OrderTransactionFeeType}.ts \
        packages/api/src/shared/enums/index.ts \
        packages/api/src/shared/types/PostalAddress.ts \
        packages/api/src/shared/types/UtmTags.ts \
        packages/api/src/shared/types/PostalAddress.test.ts
git commit -m "feat(shared): sales primitive enums + PostalAddress + UtmTags (P0 Task 5)"
```

---

## Task 6: Sales aggregate value-types — OrderLine, OrderTransaction (with typed fees[]), CartLine

**Files:**
- Create: `packages/api/src/shared/types/OrderLine.ts`
- Create: `packages/api/src/shared/types/OrderTransactionFee.ts`
- Create: `packages/api/src/shared/types/OrderTransaction.ts`
- Create: `packages/api/src/shared/types/CartLine.ts`
- Test: `packages/api/src/shared/types/OrderTransaction.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema
**Depends on:** Task 1, Task 5

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { OrderLineSchema } from './OrderLine'
import { OrderTransactionSchema } from './OrderTransaction'
import { CartLineSchema } from './CartLine'

describe('Sales aggregate value-types', () => {
	it('OrderLine sums discount + tax + allocatedTax in totalPrice', () => {
		const r = OrderLineSchema.safeParse({
			id: 'l1', productExternalId: 'p1', variantExternalId: 'v1',
			title: 'T-Shirt', quantity: 2,
			unitPrice: { amountCents: 5000, currency: 'BRL' },
			discount: { amountCents: 100, currency: 'BRL' },
			tax: { amountCents: 90, currency: 'BRL' },
			allocatedTax: { amountCents: 45, currency: 'BRL' },
			totalPrice: { amountCents: 9990, currency: 'BRL' },
		})
		expect(r.success).toBe(true)
	})

	it('OrderTransaction carries typed fees[] with PROCESSING and EXCHANGE entries', () => {
		const r = OrderTransactionSchema.safeParse({
			id: 't1', externalId: '3613255074155',
			kind: 'SALE', status: 'SUCCESS',
			amount: { amountCents: 12999, currency: 'EUR' },
			processedAt: '2026-05-21T03:00:00Z',
			fees: [
				{ externalId: '3613255074155', type: 'PROCESSING', rate: 0.0499,
				  fixed:    { amountCents: 41,  currency: 'EUR' },
				  variable: { amountCents: 174, currency: 'EUR' } },
				{ externalId: '3613255106923', type: 'EXCHANGE', rate: 0.03,
				  fixed:    { amountCents: 0,   currency: 'EUR' },
				  variable: { amountCents: 95,  currency: 'EUR' } },
			],
		})
		expect(r.success).toBe(true)
	})

	it('CartLine parses minimal', () => {
		expect(CartLineSchema.safeParse({
			productExternalId: 'p1', variantExternalId: 'v1', quantity: 1,
			unitPrice: { amountCents: 100, currency: 'USD' },
		}).success).toBe(true)
	})
})
```

- [ ] **Step 2: Verify failure**

Run: `bun test packages/api/src/shared/types/OrderTransaction.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write implementations**

`packages/api/src/shared/types/OrderLine.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { MonetaryAmountSchema } from './MonetaryAmount'

export const OrderLineSchema = z.object({
	id: z.string(),
	productExternalId: z.string(),
	variantExternalId: z.string(),
	productId: z.string().optional(),
	variantId: z.string().optional(),
	title: z.string(),
	variantTitle: z.string().optional(),
	quantity: z.number().int().positive(),
	unitPrice: MonetaryAmountSchema,
	discount: MonetaryAmountSchema,
	tax: MonetaryAmountSchema,
	allocatedTax: MonetaryAmountSchema,
	totalPrice: MonetaryAmountSchema,
})

export type OrderLine = z.infer<typeof OrderLineSchema>
```

`packages/api/src/shared/types/OrderTransactionFee.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { MonetaryAmountSchema } from './MonetaryAmount'
import { OrderTransactionFeeTypeSchema } from '../enums/OrderTransactionFeeType'

export const OrderTransactionFeeSchema = z.object({
	externalId: z.string(),
	type: OrderTransactionFeeTypeSchema,
	rate: z.number(),
	fixed: MonetaryAmountSchema,
	variable: MonetaryAmountSchema,
})

export type OrderTransactionFee = z.infer<typeof OrderTransactionFeeSchema>
```

`packages/api/src/shared/types/OrderTransaction.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { MonetaryAmountSchema } from './MonetaryAmount'
import { TransactionKindSchema } from '../enums/TransactionKind'
import { TransactionStatusSchema } from '../enums/TransactionStatus'
import { DisputeStatusSchema } from '../enums/DisputeStatus'
import { OrderTransactionFeeSchema } from './OrderTransactionFee'

export const OrderTransactionSchema = z.object({
	id: z.string(),
	externalId: z.string(),
	kind: TransactionKindSchema,
	status: TransactionStatusSchema,
	amount: MonetaryAmountSchema,
	processedAt: z.iso.datetime({ offset: true }),
	disputeStatus: DisputeStatusSchema.optional(),
	fees: z.array(OrderTransactionFeeSchema),
})

export type OrderTransaction = z.infer<typeof OrderTransactionSchema>
```

`packages/api/src/shared/types/CartLine.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { MonetaryAmountSchema } from './MonetaryAmount'

export const CartLineSchema = z.object({
	productExternalId: z.string(),
	variantExternalId: z.string(),
	productId: z.string().optional(),
	variantId: z.string().optional(),
	quantity: z.number().int().positive(),
	unitPrice: MonetaryAmountSchema,
})

export type CartLine = z.infer<typeof CartLineSchema>
```

- [ ] **Step 4: Verify pass + tsc/lint**

Run: `bun test packages/api/src/shared/types/OrderTransaction.test.ts && bun tsc && bun lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/types/OrderLine.ts \
        packages/api/src/shared/types/OrderTransactionFee.ts \
        packages/api/src/shared/types/OrderTransaction.ts \
        packages/api/src/shared/types/CartLine.ts \
        packages/api/src/shared/types/OrderTransaction.test.ts
git commit -m "feat(shared): OrderLine, OrderTransaction with typed fees[], CartLine (P0 Task 6)"
```

---

## Task 7: OrderOverrideFields typed value object

**Files:**
- Create: `packages/api/src/shared/types/OrderOverrideFields.ts`
- Test: `packages/api/src/shared/types/OrderOverrideFields.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /schema
**Depends on:** Task 1, Task 5

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { OrderOverrideFieldsSchema, type OrderOverrideFields } from './OrderOverrideFields'

describe('OrderOverrideFields', () => {
	it('accepts an empty object (every field optional)', () => {
		expect(OrderOverrideFieldsSchema.safeParse({}).success).toBe(true)
	})

	it('accepts paymentStatus + paymentMethod override only', () => {
		const v: OrderOverrideFields = { paymentStatus: 'PAID', paymentMethod: 'PIX' }
		expect(OrderOverrideFieldsSchema.safeParse(v).success).toBe(true)
	})

	it('accepts productCostByLine with per-line MonetaryAmount', () => {
		expect(OrderOverrideFieldsSchema.safeParse({
			productCostByLine: [{ lineId: 'l1', cost: { amountCents: 500, currency: 'BRL' } }],
		}).success).toBe(true)
	})

	it('accepts shipping + fees + taxes + revenue overrides', () => {
		const v: OrderOverrideFields = {
			revenue:  { amountCents: 9999, currency: 'BRL' },
			shipping: { amountCents: 1000, currency: 'BRL' },
			fees:     { amountCents:  150, currency: 'BRL' },
			taxes:    { amountCents:  300, currency: 'BRL' },
		}
		expect(OrderOverrideFieldsSchema.safeParse(v).success).toBe(true)
	})
})
```

- [ ] **Step 2: Verify failure**

Run: `bun test packages/api/src/shared/types/OrderOverrideFields.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

`packages/api/src/shared/types/OrderOverrideFields.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { MonetaryAmountSchema } from './MonetaryAmount'
import { PaymentMethodSchema } from '../enums/PaymentMethod'
import { PaymentStatusSchema } from '../enums/PaymentStatus'

export const OrderOverrideFieldsSchema = z.object({
	paymentMethod: PaymentMethodSchema.optional(),
	paymentStatus: PaymentStatusSchema.optional(),
	revenue: MonetaryAmountSchema.optional(),
	productCostByLine: z.array(z.object({ lineId: z.string(), cost: MonetaryAmountSchema })).optional(),
	shipping: MonetaryAmountSchema.optional(),
	fees: MonetaryAmountSchema.optional(),
	taxes: MonetaryAmountSchema.optional(),
})

export type OrderOverrideFields = z.infer<typeof OrderOverrideFieldsSchema>
```

- [ ] **Step 4: Verify pass + tsc/lint**

Run: `bun test packages/api/src/shared/types/OrderOverrideFields.test.ts && bun tsc && bun lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/types/OrderOverrideFields.ts \
        packages/api/src/shared/types/OrderOverrideFields.test.ts
git commit -m "feat(shared): OrderOverrideFields typed value object (P0 Task 7)"
```

---

## Task 8: Catalog primitives — ProductStatus, ProductCostType, QuantityModifier, ProductCostOption family

**Files:**
- Create: `packages/api/src/shared/enums/ProductStatus.ts`
- Create: `packages/api/src/shared/enums/ProductCostType.ts`
- Create: `packages/api/src/shared/enums/QuantityModifier.ts`
- Create: `packages/api/src/shared/types/ProductCostOption.ts`
- Modify: `packages/api/src/shared/enums/index.ts` — append 3 new enum exports
- Test: `packages/api/src/shared/types/ProductCostOption.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /schema
**Depends on:** Task 1

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { ProductStatus } from '../enums/ProductStatus'
import { ProductCostType } from '../enums/ProductCostType'
import { QuantityModifier } from '../enums/QuantityModifier'
import { ProductCostOptionInputSchema, ProductCostOptionSchema } from './ProductCostOption'

describe('Catalog primitives', () => {
	it('enums expose spec values', () => {
		expect(ProductStatus.ACTIVE).toBe('ACTIVE')
		expect(ProductCostType.MULTIPLE).toBe('MULTIPLE')
		expect(QuantityModifier.GTE).toBe('GTE')
	})

	it('ProductCostOptionInput parses a tiered SINGLE rule', () => {
		expect(ProductCostOptionInputSchema.safeParse({
			currency: 'BRL', startDate: '2026-01-01', shipping: { amountCents: 100, currency: 'BRL' },
			items: [
				{ variantIds: ['v1'], quantity: 1, quantityModifier: 'GTE',
				  unitCost: { amountCents: 1000, currency: 'BRL' },
				  shipping: { amountCents: 200, currency: 'BRL' } },
			],
		}).success).toBe(true)
	})

	it('ProductCostOption (full) requires id + variantsHash on items', () => {
		expect(ProductCostOptionSchema.safeParse({
			id: 'o1', currency: 'BRL', startDate: '2026-01-01',
			shipping: { amountCents: 100, currency: 'BRL' },
			items: [{ id: 'i1', variantsHash: 'sha:abc', variantIds: ['v1'], quantity: 1,
			          quantityModifier: 'EQ', unitCost: { amountCents: 1000, currency: 'BRL' },
			          shipping: { amountCents: 0, currency: 'BRL' } }],
		}).success).toBe(true)
	})
})
```

- [ ] **Step 2: Verify failure**

Run: `bun test packages/api/src/shared/types/ProductCostOption.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write implementations**

`packages/api/src/shared/enums/ProductStatus.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum ProductStatus {
	ACTIVE = 'ACTIVE',
	ARCHIVED = 'ARCHIVED',
	DRAFT = 'DRAFT',
}

export const ProductStatusSchema = z.enum(ProductStatus)
```

`packages/api/src/shared/enums/ProductCostType.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum ProductCostType {
	SINGLE = 'SINGLE',
	MULTIPLE = 'MULTIPLE',
}

export const ProductCostTypeSchema = z.enum(ProductCostType)
```

`packages/api/src/shared/enums/QuantityModifier.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum QuantityModifier {
	EQ = 'EQ',
	GT = 'GT',
	GTE = 'GTE',
	LT = 'LT',
	LTE = 'LTE',
}

export const QuantityModifierSchema = z.enum(QuantityModifier)
```

`packages/api/src/shared/types/ProductCostOption.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { CurrencyCodeSchema } from './CurrencyCode'
import { MonetaryAmountSchema } from './MonetaryAmount'
import { QuantityModifierSchema } from '../enums/QuantityModifier'

export const ProductCostOptionItemInputSchema = z.object({
	variantIds: z.array(z.string()),
	quantity: z.number().int().positive(),
	quantityModifier: QuantityModifierSchema,
	unitCost: MonetaryAmountSchema,
	shipping: MonetaryAmountSchema,
})

export type ProductCostOptionItemInput = z.infer<typeof ProductCostOptionItemInputSchema>

export const ProductCostOptionInputSchema = z.object({
	currency: CurrencyCodeSchema,
	country: z.string().length(2).optional(),
	startDate: z.iso.date(),
	endDate: z.iso.date().optional(),
	shipping: MonetaryAmountSchema,
	items: z.array(ProductCostOptionItemInputSchema),
})

export type ProductCostOptionInput = z.infer<typeof ProductCostOptionInputSchema>

export const ProductCostOptionItemSchema = ProductCostOptionItemInputSchema.extend({
	id: z.string(),
	variantsHash: z.string(),
})

export type ProductCostOptionItem = z.infer<typeof ProductCostOptionItemSchema>

export const ProductCostOptionSchema = ProductCostOptionInputSchema.extend({
	id: z.string(),
	items: z.array(ProductCostOptionItemSchema),
})

export type ProductCostOption = z.infer<typeof ProductCostOptionSchema>
```

Modify `packages/api/src/shared/enums/index.ts`:
- Append 3 new enum re-exports.

- [ ] **Step 4: Verify pass + tsc/lint**

Run: `bun test packages/api/src/shared/types/ProductCostOption.test.ts && bun tsc && bun lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/enums/{ProductStatus,ProductCostType,QuantityModifier}.ts \
        packages/api/src/shared/enums/index.ts \
        packages/api/src/shared/types/ProductCostOption.ts \
        packages/api/src/shared/types/ProductCostOption.test.ts
git commit -m "feat(shared): catalog primitives — ProductStatus/ProductCostType/QuantityModifier + ProductCostOption family (P0 Task 8)"
```

---

## Task 9: Marketing primitives

**Files:**
- Create: `packages/api/src/shared/enums/CampaignStatus.ts`
- Create: `packages/api/src/shared/enums/AdSpendType.ts`
- Create: `packages/api/src/shared/enums/AdSpendGroupBy.ts`
- Create: `packages/api/src/shared/types/ManualMarketingExpenseBinding.ts`
- Modify: `packages/api/src/shared/enums/index.ts` — append 3 new exports
- Test: `packages/api/src/shared/types/ManualMarketingExpenseBinding.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /schema
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { CampaignStatus, CampaignStatusSchema } from '../enums/CampaignStatus'
import { AdSpendType } from '../enums/AdSpendType'
import { AdSpendGroupBy } from '../enums/AdSpendGroupBy'
import { ManualMarketingExpenseBindingSchema } from './ManualMarketingExpenseBinding'

describe('Marketing primitives', () => {
	it('enums expose spec values', () => {
		expect(CampaignStatus.PAUSED).toBe('PAUSED')
		expect(AdSpendType.AUTOMATIC).toBe('AUTOMATIC')
		expect(AdSpendGroupBy.DAILY).toBe('DAILY')
	})

	it('CampaignStatusSchema rejects unknown', () => {
		expect(CampaignStatusSchema.safeParse('DELETED').success).toBe(false)
	})

	it('ManualMarketingExpenseBinding allows productId-only / variantId-only / both / neither', () => {
		expect(ManualMarketingExpenseBindingSchema.safeParse({}).success).toBe(true)
		expect(ManualMarketingExpenseBindingSchema.safeParse({ productId: 'p1' }).success).toBe(true)
		expect(ManualMarketingExpenseBindingSchema.safeParse({ variantId: 'v1' }).success).toBe(true)
		expect(ManualMarketingExpenseBindingSchema.safeParse({ productId: 'p1', variantId: 'v1' }).success).toBe(true)
	})
})
```

- [ ] **Step 2: Verify failure**

Run: `bun test packages/api/src/shared/types/ManualMarketingExpenseBinding.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write implementations**

`packages/api/src/shared/enums/CampaignStatus.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum CampaignStatus {
	ACTIVE = 'ACTIVE',
	PAUSED = 'PAUSED',
	ARCHIVED = 'ARCHIVED',
}

export const CampaignStatusSchema = z.enum(CampaignStatus)
```

`packages/api/src/shared/enums/AdSpendType.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum AdSpendType {
	AUTOMATIC = 'AUTOMATIC',
	MANUAL = 'MANUAL',
}

export const AdSpendTypeSchema = z.enum(AdSpendType)
```

`packages/api/src/shared/enums/AdSpendGroupBy.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum AdSpendGroupBy {
	HOURLY = 'HOURLY',
	DAILY = 'DAILY',
}

export const AdSpendGroupBySchema = z.enum(AdSpendGroupBy)
```

`packages/api/src/shared/types/ManualMarketingExpenseBinding.ts`:
```typescript
import { z } from '@shared/utils/schema'

export const ManualMarketingExpenseBindingSchema = z.object({
	productId: z.string().optional(),
	variantId: z.string().optional(),
})

export type ManualMarketingExpenseBinding = z.infer<typeof ManualMarketingExpenseBindingSchema>
```

Modify `packages/api/src/shared/enums/index.ts`:
- Append 3 new exports.

- [ ] **Step 4: Verify pass + tsc/lint**

Run: `bun test packages/api/src/shared/types/ManualMarketingExpenseBinding.test.ts && bun tsc && bun lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/enums/{CampaignStatus,AdSpendType,AdSpendGroupBy}.ts \
        packages/api/src/shared/enums/index.ts \
        packages/api/src/shared/types/ManualMarketingExpenseBinding.ts \
        packages/api/src/shared/types/ManualMarketingExpenseBinding.test.ts
git commit -m "feat(shared): marketing primitives — CampaignStatus, AdSpendType, AdSpendGroupBy, ManualMarketingExpenseBinding (P0 Task 9)"
```

---

## Task 10: PixelEventType enum

**Files:**
- Create: `packages/api/src/shared/enums/PixelEventType.ts`
- Modify: `packages/api/src/shared/enums/index.ts` — append 1 export
- Test: `packages/api/src/shared/enums/PixelEventType.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { PixelEventType, PixelEventTypeSchema } from './PixelEventType'

describe('PixelEventType', () => {
	it('exposes all 8 spec funnel stages', () => {
		const all = ['PAGE_VIEWED','PRODUCT_VIEWED','PRODUCT_ADDED_TO_CART','PRODUCT_REMOVED_FROM_CART','CART_VIEWED','CHECKOUT_STARTED','CHECKOUT_CONTACT_INFO_SUBMITTED','CHECKOUT_COMPLETED']
		for (const t of all) expect(PixelEventTypeSchema.safeParse(t).success).toBe(true)
		expect(PixelEventType.CHECKOUT_COMPLETED).toBe('CHECKOUT_COMPLETED')
	})

	it('rejects unknown stage', () => {
		expect(PixelEventTypeSchema.safeParse('CUSTOM_EVENT').success).toBe(false)
	})
})
```

- [ ] **Step 2: Verify failure → Step 3: Implement**

`packages/api/src/shared/enums/PixelEventType.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum PixelEventType {
	PAGE_VIEWED = 'PAGE_VIEWED',
	PRODUCT_VIEWED = 'PRODUCT_VIEWED',
	PRODUCT_ADDED_TO_CART = 'PRODUCT_ADDED_TO_CART',
	PRODUCT_REMOVED_FROM_CART = 'PRODUCT_REMOVED_FROM_CART',
	CART_VIEWED = 'CART_VIEWED',
	CHECKOUT_STARTED = 'CHECKOUT_STARTED',
	CHECKOUT_CONTACT_INFO_SUBMITTED = 'CHECKOUT_CONTACT_INFO_SUBMITTED',
	CHECKOUT_COMPLETED = 'CHECKOUT_COMPLETED',
}

export const PixelEventTypeSchema = z.enum(PixelEventType)
```

Append 1 export to `packages/api/src/shared/enums/index.ts`.

- [ ] **Step 4: Verify pass + tsc/lint**

Run: `bun test packages/api/src/shared/enums/PixelEventType.test.ts && bun tsc && bun lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/enums/PixelEventType.ts \
        packages/api/src/shared/enums/index.ts \
        packages/api/src/shared/enums/PixelEventType.test.ts
git commit -m "feat(shared): PixelEventType enum (P0 Task 10)"
```

---

## Task 11: Finance taxes + operational + fees value-types

**Files:**
- Create: `packages/api/src/shared/enums/TaxType.ts`
- Create: `packages/api/src/shared/enums/TaxDeductionType.ts`
- Create: `packages/api/src/shared/enums/OperationalCostCategory.ts`
- Create: `packages/api/src/shared/enums/OperationalCostRecurrency.ts`
- Create: `packages/api/src/shared/enums/OperationalCostPaymentStatus.ts`
- Create: `packages/api/src/shared/enums/ShippingCostType.ts`
- Create: `packages/api/src/shared/types/OperationalCostStatusEntry.ts`
- Create: `packages/api/src/shared/types/ShippingCostValue.ts`
- Create: `packages/api/src/shared/types/GatewayFee.ts`
- Create: `packages/api/src/shared/types/CheckoutFee.ts`
- Create: `packages/api/src/shared/types/ShippingFee.ts`
- Modify: `packages/api/src/shared/enums/index.ts` — append 6 new exports
- Test: `packages/api/src/shared/types/finance.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /schema
**Depends on:** Task 1, Task 5

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { TaxType } from '../enums/TaxType'
import { TaxDeductionType } from '../enums/TaxDeductionType'
import { OperationalCostCategory, OperationalCostCategorySchema } from '../enums/OperationalCostCategory'
import { OperationalCostRecurrency } from '../enums/OperationalCostRecurrency'
import { OperationalCostPaymentStatus } from '../enums/OperationalCostPaymentStatus'
import { ShippingCostType } from '../enums/ShippingCostType'
import { OperationalCostStatusEntrySchema } from './OperationalCostStatusEntry'
import { ShippingCostValueSchema } from './ShippingCostValue'
import { GatewayFeeSchema } from './GatewayFee'
import { CheckoutFeeSchema } from './CheckoutFee'
import { ShippingFeeSchema } from './ShippingFee'

describe('Finance value-types', () => {
	it('OperationalCostCategory matches frontend enum (9 values)', () => {
		const all = ['EMPLOYEE','APP','FOOD','RENT','ACCOUNTANT','REFUND','SHIPPING','TAKE_PROFIT','OTHER']
		for (const v of all) expect(OperationalCostCategorySchema.safeParse(v).success).toBe(true)
	})

	it('ShippingCostValue is a discriminated union by type', () => {
		expect(ShippingCostValueSchema.safeParse({ type: 'NONE' }).success).toBe(true)
		expect(ShippingCostValueSchema.safeParse({ type: 'PAID_BY_CUSTOMER' }).success).toBe(true)
		expect(ShippingCostValueSchema.safeParse({ type: 'AVERAGE_PER_ORDER', perOrder: { amountCents: 1500, currency: 'BRL' } }).success).toBe(true)
		expect(ShippingCostValueSchema.safeParse({ type: 'AVERAGE_PER_ITEM',  perItem:  { amountCents: 200,  currency: 'BRL' } }).success).toBe(true)
		expect(ShippingCostValueSchema.safeParse({ type: 'AVERAGE_PER_ORDER' /* missing perOrder */ }).success).toBe(false)
	})

	it('GatewayFee + CheckoutFee + ShippingFee parse spec shapes', () => {
		expect(GatewayFeeSchema.safeParse({
			platform: 'STRIPE', paymentMethod: 'CREDIT_CARD', percentage: 0.029,
			fixed: [{ amountCents: 30, currency: 'USD' }],
		}).success).toBe(true)
		expect(CheckoutFeeSchema.safeParse({ platform: 'YAMPI', rate: 0.05 }).success).toBe(true)
		expect(ShippingFeeSchema.safeParse({ type: 'NONE', value: { type: 'NONE' } }).success).toBe(true)
	})

	it('OperationalCostStatusEntry stores typed status changes', () => {
		expect(OperationalCostStatusEntrySchema.safeParse({ date: '2026-05-21', status: 'PAID' }).success).toBe(true)
	})
})
```

- [ ] **Step 2: Verify failure → Step 3: Implement**

Each enum file follows Task-3 shape — `enum X { A = 'A', ... }` + `export const XSchema = z.enum(X)`. Specifically:

- `TaxType` — `NONE | PRESUMED_PROFIT | REAL_PROFIT`
- `TaxDeductionType` — `NONE | PRODUCT_COST | PRODUCT_COST_AND_MARKETING`
- `OperationalCostCategory` — `EMPLOYEE | APP | FOOD | RENT | ACCOUNTANT | REFUND | SHIPPING | TAKE_PROFIT | OTHER`
- `OperationalCostRecurrency` — `ONCE | DAILY | WEEKLY | MONTHLY | BIMESTER | TRIMESTER | SEMESTER | YEARLY | NONE`
- `OperationalCostPaymentStatus` — `PAID | UNPAID | OVERDUE | CANCELLED`
- `ShippingCostType` — `NONE | PAID_BY_CUSTOMER | AVERAGE_PER_ORDER | AVERAGE_PER_ITEM`

`packages/api/src/shared/types/OperationalCostStatusEntry.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { OperationalCostPaymentStatusSchema } from '../enums/OperationalCostPaymentStatus'

export const OperationalCostStatusEntrySchema = z.object({
	date: z.iso.date(),
	status: OperationalCostPaymentStatusSchema,
})

export type OperationalCostStatusEntry = z.infer<typeof OperationalCostStatusEntrySchema>
```

`packages/api/src/shared/types/ShippingCostValue.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { MonetaryAmountSchema } from './MonetaryAmount'

export const ShippingCostValueSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('NONE') }),
	z.object({ type: z.literal('PAID_BY_CUSTOMER') }),
	z.object({ type: z.literal('AVERAGE_PER_ORDER'), perOrder: MonetaryAmountSchema }),
	z.object({ type: z.literal('AVERAGE_PER_ITEM'),  perItem:  MonetaryAmountSchema }),
])

export type ShippingCostValue = z.infer<typeof ShippingCostValueSchema>
```

`packages/api/src/shared/types/GatewayFee.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { MonetaryAmountSchema } from './MonetaryAmount'
import { PaymentGatewaySchema } from '../enums/PaymentGateway'
import { PaymentMethodSchema } from '../enums/PaymentMethod'

export const GatewayFeeSchema = z.object({
	platform: PaymentGatewaySchema,
	paymentMethod: PaymentMethodSchema,
	percentage: z.number(),
	fixed: z.array(MonetaryAmountSchema),
})

export type GatewayFee = z.infer<typeof GatewayFeeSchema>
```

`packages/api/src/shared/types/CheckoutFee.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { CheckoutPlatformSchema } from '../enums/CheckoutPlatform'

export const CheckoutFeeSchema = z.object({
	platform: CheckoutPlatformSchema,
	rate: z.number(),
})

export type CheckoutFee = z.infer<typeof CheckoutFeeSchema>
```

`packages/api/src/shared/types/ShippingFee.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { ShippingCostTypeSchema } from '../enums/ShippingCostType'
import { ShippingCostValueSchema } from './ShippingCostValue'

export const ShippingFeeSchema = z.object({
	type: ShippingCostTypeSchema,
	value: ShippingCostValueSchema,
})

export type ShippingFee = z.infer<typeof ShippingFeeSchema>
```

Modify `packages/api/src/shared/enums/index.ts`:
- Append 6 new enum re-exports.

- [ ] **Step 4: Verify pass + tsc/lint**

Run: `bun test packages/api/src/shared/types/finance.test.ts && bun tsc && bun lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/enums/{TaxType,TaxDeductionType,OperationalCostCategory,OperationalCostRecurrency,OperationalCostPaymentStatus,ShippingCostType}.ts \
        packages/api/src/shared/enums/index.ts \
        packages/api/src/shared/types/{OperationalCostStatusEntry,ShippingCostValue,GatewayFee,CheckoutFee,ShippingFee}.ts \
        packages/api/src/shared/types/finance.test.ts
git commit -m "feat(shared): finance value-types — taxes, operational, fees with discriminated ShippingCostValue (P0 Task 11)"
```

---

## Task 12: Analytics value-types

**Files:**
- Create: `packages/api/src/shared/enums/GoalType.ts`
- Create: `packages/api/src/shared/enums/AnalyticsFrequency.ts`
- Create: `packages/api/src/shared/enums/ChartType.ts`
- Create: `packages/api/src/shared/enums/TimezoneMode.ts`
- Create: `packages/api/src/shared/types/DayOfWeek.ts`
- Create: `packages/api/src/shared/types/ChartSeriesPoint.ts`
- Create: `packages/api/src/shared/types/RegionBucket.ts`
- Modify: `packages/api/src/shared/enums/index.ts` — append 4 new exports
- Test: `packages/api/src/shared/types/ChartSeriesPoint.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /schema
**Depends on:** Task 1

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { GoalType } from '../enums/GoalType'
import { AnalyticsFrequency, AnalyticsFrequencySchema } from '../enums/AnalyticsFrequency'
import { ChartType, ChartTypeSchema } from '../enums/ChartType'
import { TimezoneMode } from '../enums/TimezoneMode'
import { DayOfWeekSchema } from './DayOfWeek'
import { ChartSeriesPointSchema } from './ChartSeriesPoint'
import { RegionBucketSchema } from './RegionBucket'

describe('Analytics value-types', () => {
	it('enums expose spec values', () => {
		expect(GoalType.REVENUE).toBe('REVENUE')
		expect(AnalyticsFrequency.MONTHLY).toBe('MONTHLY')
		expect(ChartType.SALES_PER_REGION).toBe('SALES_PER_REGION')
		expect(TimezoneMode.PER_STORE).toBe('PER_STORE')
	})

	it('DayOfWeek accepts 0..6 only', () => {
		for (const d of [0,1,2,3,4,5,6]) expect(DayOfWeekSchema.safeParse(d).success).toBe(true)
		expect(DayOfWeekSchema.safeParse(7).success).toBe(false)
		expect(DayOfWeekSchema.safeParse(-1).success).toBe(false)
	})

	it('ChartTypeSchema parses all 5 spec types', () => {
		const all = ['REVENUE','REVENUE_PER_SHIFT','SALES_PER_WEEKDAY','SALES_PER_HOUR','SALES_PER_REGION']
		for (const t of all) expect(ChartTypeSchema.safeParse(t).success).toBe(true)
	})

	it('ChartSeriesPoint requires per-currency money fields + orderCount', () => {
		expect(ChartSeriesPointSchema.safeParse({
			bucketStart: '2026-05-01', bucketEnd: '2026-05-02',
			total: { BRL: 1000 }, profit: { BRL: 300 }, productCost: { BRL: 500 },
			marketingCost: { BRL: 200 }, fees: { BRL: 30 }, orderCount: 5,
		}).success).toBe(true)
	})

	it('RegionBucket parses a Brazilian state row', () => {
		expect(RegionBucketSchema.safeParse({
			countryCode: 'BR', stateCode: 'SP', countryName: 'Brazil', stateName: 'São Paulo',
			orderCount: 10, revenue: { BRL: 100000 },
			revenueInReportingCurrency: { amountCents: 20000, currency: 'USD' },
		}).success).toBe(true)
	})

	it('AnalyticsFrequencySchema rejects unknown', () => {
		expect(AnalyticsFrequencySchema.safeParse('MINUTELY').success).toBe(false)
	})
})
```

- [ ] **Step 2: Verify failure → Step 3: Implement**

Enum files follow Task-3 shape:
- `GoalType` — `REVENUE | PROFIT`
- `AnalyticsFrequency` — `HOURLY | DAILY | WEEKLY | MONTHLY | YEARLY`
- `ChartType` — `REVENUE | REVENUE_PER_SHIFT | SALES_PER_WEEKDAY | SALES_PER_HOUR | SALES_PER_REGION`
- `TimezoneMode` — `PER_STORE | UNIFIED`

`packages/api/src/shared/types/DayOfWeek.ts`:
```typescript
import { z } from '@shared/utils/schema'

export const DayOfWeekSchema = z.number().int().min(0).max(6)
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6
```

`packages/api/src/shared/types/ChartSeriesPoint.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { MonetaryByCurrencySchema } from './MonetaryByCurrency'

export const ChartSeriesPointSchema = z.object({
	bucketStart: z.iso.datetime({ offset: true }).or(z.iso.date()),
	bucketEnd:   z.iso.datetime({ offset: true }).or(z.iso.date()),
	total:         MonetaryByCurrencySchema,
	profit:        MonetaryByCurrencySchema,
	productCost:   MonetaryByCurrencySchema,
	marketingCost: MonetaryByCurrencySchema,
	fees:          MonetaryByCurrencySchema,
	orderCount: z.number().int().nonnegative(),
})

export type ChartSeriesPoint = z.infer<typeof ChartSeriesPointSchema>
```

`packages/api/src/shared/types/RegionBucket.ts`:
```typescript
import { z } from '@shared/utils/schema'
import { MonetaryAmountSchema } from './MonetaryAmount'
import { MonetaryByCurrencySchema } from './MonetaryByCurrency'

export const RegionBucketSchema = z.object({
	countryCode: z.string().length(2),
	stateCode: z.string().optional(),
	countryName: z.string(),
	stateName: z.string().optional(),
	orderCount: z.number().int().nonnegative(),
	revenue: MonetaryByCurrencySchema,
	revenueInReportingCurrency: MonetaryAmountSchema,
})

export type RegionBucket = z.infer<typeof RegionBucketSchema>
```

Append 4 new exports to `packages/api/src/shared/enums/index.ts`.

- [ ] **Step 4: Verify pass + tsc/lint**

Run: `bun test packages/api/src/shared/types/ChartSeriesPoint.test.ts && bun tsc && bun lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/enums/{GoalType,AnalyticsFrequency,ChartType,TimezoneMode}.ts \
        packages/api/src/shared/enums/index.ts \
        packages/api/src/shared/types/{DayOfWeek,ChartSeriesPoint,RegionBucket}.ts \
        packages/api/src/shared/types/ChartSeriesPoint.test.ts
git commit -m "feat(shared): analytics value-types — Chart, Goal, Frequency, Timezone, RegionBucket (P0 Task 12)"
```

---

## Task 13: Notifications enums

**Files:**
- Create: `packages/api/src/shared/enums/NotificationCategory.ts`
- Create: `packages/api/src/shared/enums/NotificationOrigin.ts`
- Create: `packages/api/src/shared/enums/NotificationChannel.ts`
- Modify: `packages/api/src/shared/enums/index.ts` — append 3 new exports
- Test: `packages/api/src/shared/enums/notifications.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { NotificationCategory, NotificationCategorySchema } from './NotificationCategory'
import { NotificationOrigin } from './NotificationOrigin'
import { NotificationChannel } from './NotificationChannel'

describe('Notification enums', () => {
	it('NotificationCategory exposes spec values', () => {
		expect(NotificationCategory.DAILY_DIGEST).toBe('DAILY_DIGEST')
		expect(NotificationCategorySchema.safeParse('ORDER_RECEIVED').success).toBe(true)
		expect(NotificationCategorySchema.safeParse('UNKNOWN').success).toBe(false)
	})

	it('NotificationOrigin / NotificationChannel exist', () => {
		expect(NotificationOrigin.SYSTEM).toBe('SYSTEM')
		expect(NotificationChannel.PUSH).toBe('PUSH')
	})
})
```

- [ ] **Step 2: Verify failure → Step 3: Implement**

`packages/api/src/shared/enums/NotificationCategory.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum NotificationCategory {
	ORDER_RECEIVED = 'ORDER_RECEIVED',
	PAYMENT_PROCESSED = 'PAYMENT_PROCESSED',
	SYNC_ERROR = 'SYNC_ERROR',
	FEATURE_ANNOUNCEMENT = 'FEATURE_ANNOUNCEMENT',
	DAILY_DIGEST = 'DAILY_DIGEST',
	INTEGRATION_DISCONNECTED = 'INTEGRATION_DISCONNECTED',
	INVITATION = 'INVITATION',
	OTHER = 'OTHER',
}

export const NotificationCategorySchema = z.enum(NotificationCategory)
```

`packages/api/src/shared/enums/NotificationOrigin.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum NotificationOrigin {
	SYSTEM = 'SYSTEM',
	ADMIN = 'ADMIN',
	SCHEDULER = 'SCHEDULER',
}

export const NotificationOriginSchema = z.enum(NotificationOrigin)
```

`packages/api/src/shared/enums/NotificationChannel.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum NotificationChannel {
	PUSH = 'PUSH',
	EMAIL = 'EMAIL',
	IN_APP = 'IN_APP',
}

export const NotificationChannelSchema = z.enum(NotificationChannel)
```

Append 3 new exports to `packages/api/src/shared/enums/index.ts`.

- [ ] **Step 4: Verify pass + tsc/lint**

Run: `bun test packages/api/src/shared/enums/notifications.test.ts && bun tsc && bun lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/enums/{NotificationCategory,NotificationOrigin,NotificationChannel}.ts \
        packages/api/src/shared/enums/index.ts \
        packages/api/src/shared/enums/notifications.test.ts
git commit -m "feat(shared): notification enums — Category, Origin, Channel (P0 Task 13)"
```

---

## Task 14: Billing types + PLAN_QUOTAS code constant

**Files:**
- Create: `packages/api/src/shared/enums/PlanTier.ts`
- Create: `packages/api/src/shared/enums/PlanPeriod.ts`
- Create: `packages/api/src/shared/enums/BillingPlatform.ts`
- Create: `packages/api/src/shared/enums/PlanFeature.ts`
- Create: `packages/api/src/shared/enums/SubscriptionEventType.ts`
- Create: `packages/api/src/shared/types/PlanQuota.ts`
- Create: `packages/api/src/shared/constants/PlanQuotas.ts`
- Modify: `packages/api/src/shared/enums/index.ts` — append 5 new exports
- Test: `packages/api/src/shared/constants/PlanQuotas.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /schema
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { PlanTier } from '../enums/PlanTier'
import { PlanPeriod } from '../enums/PlanPeriod'
import { BillingPlatform } from '../enums/BillingPlatform'
import { PlanFeature } from '../enums/PlanFeature'
import { SubscriptionEventType } from '../enums/SubscriptionEventType'
import { PlanQuotaSchema } from '../types/PlanQuota'
import { PLAN_QUOTAS, planQuotaFor, hasQuotaAvailable } from './PlanQuotas'

describe('Billing types + PLAN_QUOTAS', () => {
	it('enums expose spec values', () => {
		expect(PlanTier.UNLIMITED).toBe('UNLIMITED')
		expect(PlanPeriod.ANNUAL).toBe('ANNUAL')
		expect(BillingPlatform.KIWIFY).toBe('KIWIFY')
		expect(PlanFeature.STORE_AMOUNT).toBe('STORE_AMOUNT')
		expect(SubscriptionEventType.PAYMENT_SUCCEEDED).toBe('PAYMENT_SUCCEEDED')
	})

	it('PlanQuotaSchema accepts number or "UNLIMITED"', () => {
		expect(PlanQuotaSchema.safeParse(5).success).toBe(true)
		expect(PlanQuotaSchema.safeParse('UNLIMITED').success).toBe(true)
		expect(PlanQuotaSchema.safeParse('FOO').success).toBe(false)
	})

	it('PLAN_QUOTAS matches backend-old MAX_INTEGRATION_SETS_PER_TIER', () => {
		expect(PLAN_QUOTAS.BASIC.STORE_AMOUNT).toBe(1)
		expect(PLAN_QUOTAS.INTERMEDIATE.STORE_AMOUNT).toBe(3)
		expect(PLAN_QUOTAS.ADVANCED.STORE_AMOUNT).toBe(5)
		expect(PLAN_QUOTAS.UNLIMITED.STORE_AMOUNT).toBe('UNLIMITED')
	})

	it('planQuotaFor returns the quota value', () => {
		expect(planQuotaFor(PlanTier.BASIC, PlanFeature.STORE_AMOUNT)).toBe(1)
		expect(planQuotaFor(PlanTier.UNLIMITED, PlanFeature.STORE_AMOUNT)).toBe('UNLIMITED')
	})

	it('hasQuotaAvailable handles UNLIMITED correctly', () => {
		expect(hasQuotaAvailable(PlanTier.BASIC, PlanFeature.STORE_AMOUNT, 0)).toBe(true)
		expect(hasQuotaAvailable(PlanTier.BASIC, PlanFeature.STORE_AMOUNT, 1)).toBe(false)
		expect(hasQuotaAvailable(PlanTier.UNLIMITED, PlanFeature.STORE_AMOUNT, 99999)).toBe(true)
	})
})
```

- [ ] **Step 2: Verify failure → Step 3: Implement**

Enum files follow Task-3 shape:
- `PlanTier` — `BASIC | INTERMEDIATE | ADVANCED | UNLIMITED`
- `PlanPeriod` — `MONTHLY | QUARTERLY | ANNUAL`
- `BillingPlatform` — `KIWIFY | OTHER`
- `PlanFeature` — `STORE_AMOUNT | INTEGRATION_AMOUNT | DAILY_DIGEST | MULTI_USER | CSV_IMPORT | ADMIN_API`
- `SubscriptionEventType` — `SUBSCRIPTION_CREATED | PAYMENT_SUCCEEDED | PAYMENT_FAILED | PAYMENT_REFUNDED | SUBSCRIPTION_CANCELLED | SUBSCRIPTION_REACTIVATED | EXTERNAL_SUBSCRIPTION_CHANGED`

`packages/api/src/shared/types/PlanQuota.ts`:
```typescript
import { z } from '@shared/utils/schema'

export const PlanQuotaSchema = z.union([z.number().int().nonnegative(), z.literal('UNLIMITED')])
export type PlanQuota = z.infer<typeof PlanQuotaSchema>
```

`packages/api/src/shared/constants/PlanQuotas.ts`:
```typescript
import { PlanTier } from '../enums/PlanTier'
import { PlanFeature } from '../enums/PlanFeature'
import type { PlanQuota } from '../types/PlanQuota'

export const PLAN_QUOTAS: Record<PlanTier, Record<PlanFeature, PlanQuota>> = {
	[PlanTier.BASIC]: {
		[PlanFeature.STORE_AMOUNT]: 1,
		[PlanFeature.INTEGRATION_AMOUNT]: 2,
		[PlanFeature.DAILY_DIGEST]: 1,
		[PlanFeature.MULTI_USER]: 1,
		[PlanFeature.CSV_IMPORT]: 0,
		[PlanFeature.ADMIN_API]: 0,
	},
	[PlanTier.INTERMEDIATE]: {
		[PlanFeature.STORE_AMOUNT]: 3,
		[PlanFeature.INTEGRATION_AMOUNT]: 5,
		[PlanFeature.DAILY_DIGEST]: 1,
		[PlanFeature.MULTI_USER]: 3,
		[PlanFeature.CSV_IMPORT]: 1,
		[PlanFeature.ADMIN_API]: 0,
	},
	[PlanTier.ADVANCED]: {
		[PlanFeature.STORE_AMOUNT]: 5,
		[PlanFeature.INTEGRATION_AMOUNT]: 10,
		[PlanFeature.DAILY_DIGEST]: 1,
		[PlanFeature.MULTI_USER]: 10,
		[PlanFeature.CSV_IMPORT]: 1,
		[PlanFeature.ADMIN_API]: 0,
	},
	[PlanTier.UNLIMITED]: {
		[PlanFeature.STORE_AMOUNT]: 'UNLIMITED',
		[PlanFeature.INTEGRATION_AMOUNT]: 'UNLIMITED',
		[PlanFeature.DAILY_DIGEST]: 1,
		[PlanFeature.MULTI_USER]: 'UNLIMITED',
		[PlanFeature.CSV_IMPORT]: 1,
		[PlanFeature.ADMIN_API]: 1,
	},
}

export function planQuotaFor(tier: PlanTier, feature: PlanFeature): PlanQuota {
	return PLAN_QUOTAS[tier][feature]
}

export function hasQuotaAvailable(tier: PlanTier, feature: PlanFeature, currentUsage: number): boolean {
	const quota = PLAN_QUOTAS[tier][feature]
	if (quota === 'UNLIMITED') return true
	return currentUsage < quota
}
```

Append 5 new exports to `packages/api/src/shared/enums/index.ts`.

- [ ] **Step 4: Verify pass + tsc/lint**

Run: `bun test packages/api/src/shared/constants/PlanQuotas.test.ts && bun tsc && bun lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/enums/{PlanTier,PlanPeriod,BillingPlatform,PlanFeature,SubscriptionEventType}.ts \
        packages/api/src/shared/enums/index.ts \
        packages/api/src/shared/types/PlanQuota.ts \
        packages/api/src/shared/constants/PlanQuotas.ts \
        packages/api/src/shared/constants/PlanQuotas.test.ts
git commit -m "feat(shared): billing enums + PLAN_QUOTAS code constant with helpers (P0 Task 14)"
```

---

## Task 15: Generic utilities — pagination + date range + CSV result + sort

**Files:**
- Create: `packages/api/src/shared/types/PaginationInput.ts`
- Create: `packages/api/src/shared/types/DateRange.ts`
- Create: `packages/api/src/shared/types/CsvImportRowResult.ts`
- Create: `packages/api/src/shared/enums/SortOrder.ts`
- Modify: `packages/api/src/shared/enums/index.ts` — append 1 export
- Test: `packages/api/src/shared/types/generic.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /enum, /schema
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { PaginationInputSchema } from './PaginationInput'
import { DateRangeSchema } from './DateRange'
import { CsvImportRowResultSchema } from './CsvImportRowResult'
import { SortOrder, SortOrderSchema } from '../enums/SortOrder'

describe('Generic utilities', () => {
	it('PaginationInput rejects negative page/limit', () => {
		expect(PaginationInputSchema.safeParse({ page: 1, limit: 20 }).success).toBe(true)
		expect(PaginationInputSchema.safeParse({ page: 0, limit: 20 }).success).toBe(false)
		expect(PaginationInputSchema.safeParse({ page: 1, limit: -1 }).success).toBe(false)
	})

	it('DateRange requires endDate >= startDate', () => {
		expect(DateRangeSchema.safeParse({ startDate: '2026-05-01', endDate: '2026-05-21' }).success).toBe(true)
		expect(DateRangeSchema.safeParse({ startDate: '2026-05-21', endDate: '2026-05-01' }).success).toBe(false)
	})

	it('CsvImportRowResult parses every status variant', () => {
		for (const status of ['CREATED','UPDATED','SKIPPED','ERROR']) {
			expect(CsvImportRowResultSchema.safeParse({ rowNumber: 1, status }).success).toBe(true)
		}
	})

	it('SortOrder is ASC | DESC', () => {
		expect(SortOrder.ASC).toBe('ASC')
		expect(SortOrderSchema.safeParse('DESC').success).toBe(true)
		expect(SortOrderSchema.safeParse('asc').success).toBe(false)
	})
})
```

- [ ] **Step 2: Verify failure → Step 3: Implement**

`packages/api/src/shared/types/PaginationInput.ts`:
```typescript
import { z } from '@shared/utils/schema'

export const PaginationInputSchema = z.object({
	page: z.number().int().positive(),
	limit: z.number().int().positive().max(500),
})

export type PaginationInput = z.infer<typeof PaginationInputSchema>
```

`packages/api/src/shared/types/DateRange.ts`:
```typescript
import { z } from '@shared/utils/schema'

export const DateRangeSchema = z.object({
	startDate: z.iso.date(),
	endDate: z.iso.date(),
}).refine(d => d.endDate >= d.startDate, { message: 'endDate must be >= startDate' })

export type DateRange = z.infer<typeof DateRangeSchema>
```

`packages/api/src/shared/types/CsvImportRowResult.ts`:
```typescript
import { z } from '@shared/utils/schema'

export const CsvImportRowResultSchema = z.object({
	rowNumber: z.number().int().positive(),
	status: z.enum(['CREATED','UPDATED','SKIPPED','ERROR']),
	errorMessage: z.string().optional(),
})

export type CsvImportRowResult = z.infer<typeof CsvImportRowResultSchema>
```

`packages/api/src/shared/enums/SortOrder.ts`:
```typescript
import { z } from '@shared/utils/schema'

export enum SortOrder {
	ASC = 'ASC',
	DESC = 'DESC',
}

export const SortOrderSchema = z.enum(SortOrder)
```

Append `SortOrder` to `packages/api/src/shared/enums/index.ts`.

- [ ] **Step 4: Verify pass + tsc/lint**

Run: `bun test packages/api/src/shared/types/generic.test.ts && bun tsc && bun lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/types/{PaginationInput,DateRange,CsvImportRowResult}.ts \
        packages/api/src/shared/enums/{SortOrder}.ts \
        packages/api/src/shared/enums/index.ts \
        packages/api/src/shared/types/generic.test.ts
git commit -m "feat(shared): generic utilities — pagination, date range, csv result, sort order (P0 Task 15)"
```

---

## Task 16: Error glossary scaffolding (per-BC typed unions)

**Files:**
- Create: `packages/api/src/shared/errors/bk-dash/index.ts` (composes per-BC unions; each BC owns its own union via this file)
- Create: `packages/api/src/shared/errors/bk-dash/IdentityErrors.ts`
- Create: `packages/api/src/shared/errors/bk-dash/TenancyErrors.ts`
- Create: `packages/api/src/shared/errors/bk-dash/IntegrationErrors.ts`
- Create: `packages/api/src/shared/errors/bk-dash/SalesErrors.ts`
- Create: `packages/api/src/shared/errors/bk-dash/CatalogErrors.ts`
- Create: `packages/api/src/shared/errors/bk-dash/MarketingErrors.ts`
- Create: `packages/api/src/shared/errors/bk-dash/TrackingErrors.ts`
- Create: `packages/api/src/shared/errors/bk-dash/FinanceErrors.ts`
- Create: `packages/api/src/shared/errors/bk-dash/AnalyticsErrors.ts`
- Create: `packages/api/src/shared/errors/bk-dash/NotificationsErrors.ts`
- Create: `packages/api/src/shared/errors/bk-dash/BillingErrors.ts`
- Test: `packages/api/src/shared/errors/bk-dash/index.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /errors
**Depends on:** (none)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, expectTypeOf, it } from 'bun:test'
import { BaseError } from '@shared/types/BaseError'
import type { BkDashAnyError } from './index'

describe('BK Dash error glossary', () => {
	it('typed throw works with BaseError<T>', () => {
		const err = new BaseError<BkDashAnyError>('STORE_QUOTA_EXCEEDED', 'quota hit')
		expect(err.name).toBe('STORE_QUOTA_EXCEEDED')
		expect(err.message).toBe('quota hit')
	})

	it('rejects a non-glossary code at type level', () => {
		// @ts-expect-error — NOT_A_REAL_CODE is not in BkDashAnyError
		new BaseError<BkDashAnyError>('NOT_A_REAL_CODE')
	})

	it('union covers spec §7.14 codes (sample)', () => {
		expectTypeOf<'STORE_QUOTA_EXCEEDED'>().toExtend<BkDashAnyError>()
		expectTypeOf<'ORDER_NOT_FOUND'>().toExtend<BkDashAnyError>()
		expectTypeOf<'BILLING_WEBHOOK_SIGNATURE_INVALID'>().toExtend<BkDashAnyError>()
	})
})
```

- [ ] **Step 2: Verify failure → Step 3: Implement**

Each per-BC file follows the spec §7.14 union verbatim. Sample:

`packages/api/src/shared/errors/bk-dash/IdentityErrors.ts`:
```typescript
export type IdentityErrors =
	| 'INVALID_EMAIL'
	| 'EMAIL_ALREADY_REGISTERED'
	| 'PASSWORD_TOO_WEAK'
	| 'INVALID_CREDENTIALS'
	| 'USER_DISABLED'
	| 'INVALID_RESET_TOKEN'
	| 'RESET_TOKEN_EXPIRED'
	| 'RESET_TOKEN_ALREADY_USED'
	| 'INVALID_TIMEZONE'
	| 'INVALID_LEAD_TOKEN'
```

`packages/api/src/shared/errors/bk-dash/TenancyErrors.ts`:
```typescript
export type TenancyErrors =
	| 'STORE_NOT_FOUND'
	| 'STORE_QUOTA_EXCEEDED'
	| 'NO_ACTIVE_SUBSCRIPTION'
	| 'REPORTING_CURRENCY_LOCKED'
	| 'STORE_ALREADY_DISABLED'
	| 'STORE_NOT_DISABLED'
	| 'STORE_MEMBERSHIP_NOT_FOUND'
	| 'CANNOT_REMOVE_LAST_OWNER'
	| 'CANNOT_DEMOTE_LAST_OWNER'
	| 'ALREADY_A_MEMBER'
	| 'INVITATION_ALREADY_PENDING'
	| 'INVALID_INVITATION_TOKEN'
	| 'INVITATION_EXPIRED'
	| 'INVITATION_ALREADY_USED'
```

`packages/api/src/shared/errors/bk-dash/IntegrationErrors.ts`:
```typescript
export type IntegrationErrors =
	| 'STORE_INTEGRATION_NOT_FOUND'
	| 'STORE_INTEGRATION_INACTIVE'
	| 'STORE_INTEGRATION_ALREADY_DISCONNECTED'
	| 'PLATFORM_NOT_SUPPORTED'
	| 'INVALID_CREDENTIAL_FIELDS'
	| 'OAUTH_CODE_INVALID'
	| 'INTEGRATION_HANDSHAKE_FAILED'
	| 'INTEGRATION_QUOTA_EXCEEDED'
	| 'REINTEGRATION_RATE_LIMITED'
```

`packages/api/src/shared/errors/bk-dash/SalesErrors.ts`:
```typescript
export type SalesErrors = 'ORDER_NOT_FOUND' | 'INVALID_LINE_ID' | 'INVALID_OVERRIDE_FIELDS'
```

`packages/api/src/shared/errors/bk-dash/CatalogErrors.ts`:
```typescript
export type CatalogErrors =
	| 'PRODUCT_NOT_FOUND'
	| 'VARIANT_NOT_FOUND'
	| 'PRODUCT_COST_NOT_FOUND'
	| 'PRODUCT_COST_SCOPE_LOCKED'
	| 'DUPLICATE_PRODUCT_COST_SCOPE'
	| 'INVALID_DATE_RANGE'
	| 'TAG_TOO_LONG'
	| 'CSV_PARSE_ERROR'
```

`packages/api/src/shared/errors/bk-dash/MarketingErrors.ts`:
```typescript
export type MarketingErrors =
	| 'CAMPAIGN_NOT_FOUND'
	| 'AD_SPEND_NOT_FOUND'
	| 'CANNOT_MUTATE_AUTOMATIC_AD_SPEND'
	| 'BINDING_NOT_FOUND'
	| 'BINDING_ALREADY_EXISTS'
```

`packages/api/src/shared/errors/bk-dash/TrackingErrors.ts`:
```typescript
export type TrackingErrors = 'PIXEL_NOT_SUPPORTED_FOR_PLATFORM'
```

`packages/api/src/shared/errors/bk-dash/FinanceErrors.ts`:
```typescript
export type FinanceErrors =
	| 'OPERATIONAL_COST_NOT_FOUND'
	| 'WARRANTY_RESERVE_NOT_FOUND'
	| 'INVALID_RATE'
	| 'INVALID_START_DATE'
	| 'FX_PROVIDER_UNAVAILABLE'
```

`packages/api/src/shared/errors/bk-dash/AnalyticsErrors.ts`:
```typescript
export type AnalyticsErrors =
	| 'GOAL_NOT_FOUND'
	| 'GOAL_LOCKED'
	| 'INVALID_TARGET_AMOUNT'
	| 'NO_PREVIOUS_GOAL_FOUND'
	| 'STORE_INTEGRATION_NOT_FOUND'
	| 'USER_NOT_FOUND'
	| 'ADMIN_SECRET_INVALID'
```

`packages/api/src/shared/errors/bk-dash/NotificationsErrors.ts`:
```typescript
export type NotificationsErrors = 'TARGET_USERS_OR_STORE_REQUIRED' | 'NOTIFICATION_DELIVERY_NOT_FOUND'
```

`packages/api/src/shared/errors/bk-dash/BillingErrors.ts`:
```typescript
export type BillingErrors =
	| 'SUBSCRIPTION_NOT_FOUND'
	| 'EXTERNAL_SUBSCRIPTION_NOT_FOUND'
	| 'BILLING_WEBHOOK_SIGNATURE_INVALID'
	| 'BILLING_WEBHOOK_PAYLOAD_INVALID'
	| 'BILLING_WEBHOOK_UNKNOWN_PLATFORM'
	| 'SUBSCRIPTION_LOOKUP_FAILED'
```

`packages/api/src/shared/errors/bk-dash/index.ts`:
```typescript
export type { IdentityErrors } from './IdentityErrors'
export type { TenancyErrors } from './TenancyErrors'
export type { IntegrationErrors } from './IntegrationErrors'
export type { SalesErrors } from './SalesErrors'
export type { CatalogErrors } from './CatalogErrors'
export type { MarketingErrors } from './MarketingErrors'
export type { TrackingErrors } from './TrackingErrors'
export type { FinanceErrors } from './FinanceErrors'
export type { AnalyticsErrors } from './AnalyticsErrors'
export type { NotificationsErrors } from './NotificationsErrors'
export type { BillingErrors } from './BillingErrors'

import type { IdentityErrors } from './IdentityErrors'
import type { TenancyErrors } from './TenancyErrors'
import type { IntegrationErrors } from './IntegrationErrors'
import type { SalesErrors } from './SalesErrors'
import type { CatalogErrors } from './CatalogErrors'
import type { MarketingErrors } from './MarketingErrors'
import type { TrackingErrors } from './TrackingErrors'
import type { FinanceErrors } from './FinanceErrors'
import type { AnalyticsErrors } from './AnalyticsErrors'
import type { NotificationsErrors } from './NotificationsErrors'
import type { BillingErrors } from './BillingErrors'

export type BkDashAnyError =
	| IdentityErrors
	| TenancyErrors
	| IntegrationErrors
	| SalesErrors
	| CatalogErrors
	| MarketingErrors
	| TrackingErrors
	| FinanceErrors
	| AnalyticsErrors
	| NotificationsErrors
	| BillingErrors
```

- [ ] **Step 4: Verify pass + tsc/lint**

Run: `bun test packages/api/src/shared/errors/bk-dash/index.test.ts && bun tsc && bun lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/errors/bk-dash/
git commit -m "feat(shared): error glossary scaffolding — per-BC typed unions + BkDashAnyError (P0 Task 16)"
```

---

## Task 17: Integration event payload schemas (shared.* catalog)

**Files:**
- Create: `packages/api/src/shared/events/bk-dash/OrderUpdatedIntegrationEvent.ts`
- Create: `packages/api/src/shared/events/bk-dash/OrderTransactionRecordedIntegrationEvent.ts`
- Create: `packages/api/src/shared/events/bk-dash/CartAbandonedIntegrationEvent.ts`
- Create: `packages/api/src/shared/events/bk-dash/ProductUpdatedIntegrationEvent.ts`
- Create: `packages/api/src/shared/events/bk-dash/VariantUpdatedIntegrationEvent.ts`
- Create: `packages/api/src/shared/events/bk-dash/CampaignUpdatedIntegrationEvent.ts`
- Create: `packages/api/src/shared/events/bk-dash/AdSpendRecordedIntegrationEvent.ts`
- Create: `packages/api/src/shared/events/bk-dash/PixelEventRecordedIntegrationEvent.ts`
- Create: `packages/api/src/shared/events/bk-dash/IntegrationHandshakeSucceededIntegrationEvent.ts`
- Create: `packages/api/src/shared/events/bk-dash/IntegrationHandshakeFailedIntegrationEvent.ts`
- Create: `packages/api/src/shared/events/bk-dash/IntegrationProgressUpdatedIntegrationEvent.ts`
- Create: `packages/api/src/shared/events/bk-dash/SubscriptionQuotaUpdatedIntegrationEvent.ts`
- Create: `packages/api/src/shared/events/bk-dash/StoreIntegrationDataWipeRequestedIntegrationEvent.ts`
- Create: `packages/api/src/shared/events/bk-dash/index.ts` (barrel + name→event registry)
- Test: `packages/api/src/shared/events/bk-dash/index.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /event
**Depends on:** Task 1, Task 4, Task 5, Task 6, Task 8, Task 9, Task 10

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from 'bun:test'
import { OrderUpdatedIntegrationEvent } from './OrderUpdatedIntegrationEvent'
import { AdSpendRecordedIntegrationEvent } from './AdSpendRecordedIntegrationEvent'
import { IntegrationProgressUpdatedIntegrationEvent } from './IntegrationProgressUpdatedIntegrationEvent'
import { BkDashIntegrationEventRegistry } from './index'

describe('BK Dash integration event catalog', () => {
	it('OrderUpdatedIntegrationEvent has the dotted Kafka topic name', () => {
		expect(OrderUpdatedIntegrationEvent.name).toBe('integration.shared.order.updated')
	})

	it('OrderUpdatedIntegrationEvent payload validates a complete order shape', () => {
		const e = new OrderUpdatedIntegrationEvent({
			ownerId: 'store-1',
			payload: {
				orderId: 'o1', storeIntegrationId: 'si1', storeIntegrationExternalId: 'shop.myshopify.com',
				externalId: '10', externalCreatedAt: '2026-05-21T03:00:00Z',
				isNew: true,
				total: { amountCents: 1000, currency: 'BRL' },
				paymentStatus: 'PAID',
				changedFields: ['paymentStatus'],
			},
		})
		expect(e.payload.orderId).toBe('o1')
	})

	it('AdSpendRecordedIntegrationEvent carries adSpendType discriminator', () => {
		const e = new AdSpendRecordedIntegrationEvent({
			ownerId: 'store-1',
			payload: {
				adSpendId: 'as1', adSpendType: 'AUTOMATIC', platform: 'META',
				adAccountExternalId: 'act_1', campaignExternalId: 'c1',
				startDate: '2026-05-21', endDate: '2026-05-21', groupBy: 'DAILY',
				currency: 'USD', spend: { amountCents: 1500, currency: 'USD' },
			},
		})
		expect(e.payload.adSpendType).toBe('AUTOMATIC')
	})

	it('IntegrationProgressUpdatedIntegrationEvent payload validates 0..100', () => {
		const e = new IntegrationProgressUpdatedIntegrationEvent({
			ownerId: 'store-1',
			payload: {
				storeIntegrationId: 'si1', pipelineType: 'ORDERS', platform: 'SHOPIFY', progress: 42,
			},
		})
		expect(e.payload.progress).toBe(42)
	})

	it('Registry maps every event name to its class', () => {
		const names = [
			'integration.shared.order.updated',
			'integration.shared.order_transaction.recorded',
			'integration.shared.cart.abandoned',
			'integration.shared.product.updated',
			'integration.shared.variant.updated',
			'integration.shared.campaign.updated',
			'integration.shared.ad_spend.recorded',
			'integration.shared.pixel_event.recorded',
			'integration.shared.integration.handshake_succeeded',
			'integration.shared.integration.handshake_failed',
			'integration.shared.integration.progress_updated',
			'integration.shared.subscription.quota_updated',
			'integration.shared.store_integration.data_wipe_requested',
		]
		for (const n of names) expect(BkDashIntegrationEventRegistry[n]).toBeDefined()
	})
})
```

- [ ] **Step 2: Verify failure → Step 3: Implement**

Each event file follows the GameCreatedIntegrationEvent shape — `z.integrationEvent({...})` + class extending `BaseIntegrationEvent` with static `name`/`schema`.

Sample (the rest follow the same pattern with the payload from spec §7.13):

`packages/api/src/shared/events/bk-dash/OrderUpdatedIntegrationEvent.ts`:
```typescript
import { BaseIntegrationEvent } from '@shared/types/BaseIntegrationEvent'
import { z } from '@shared/utils/schema'
import { MonetaryAmountSchema } from '@shared/types/MonetaryAmount'
import { PaymentStatusSchema } from '@shared/enums/PaymentStatus'

export const OrderUpdatedIntegrationEventSchema = z.integrationEvent({
	orderId: z.string(),
	storeIntegrationId: z.string(),
	storeIntegrationExternalId: z.string(),
	externalId: z.string(),
	externalCreatedAt: z.iso.datetime({ offset: true }),
	isNew: z.boolean(),
	total: MonetaryAmountSchema,
	paymentStatus: PaymentStatusSchema,
	changedFields: z.array(z.string()),
})

export class OrderUpdatedIntegrationEvent extends BaseIntegrationEvent<typeof OrderUpdatedIntegrationEventSchema> {
	static override readonly name = 'integration.shared.order.updated' as const
	static readonly schema = OrderUpdatedIntegrationEventSchema
}
```

`packages/api/src/shared/events/bk-dash/AdSpendRecordedIntegrationEvent.ts`:
```typescript
import { BaseIntegrationEvent } from '@shared/types/BaseIntegrationEvent'
import { z } from '@shared/utils/schema'
import { MonetaryAmountSchema } from '@shared/types/MonetaryAmount'
import { AdSpendTypeSchema } from '@shared/enums/AdSpendType'
import { AdSpendGroupBySchema } from '@shared/enums/AdSpendGroupBy'
import { MarketingPlatformSchema } from '@shared/enums/MarketingPlatform'
import { CurrencyCodeSchema } from '@shared/types/CurrencyCode'

export const AdSpendRecordedIntegrationEventSchema = z.integrationEvent({
	adSpendId: z.string(),
	adSpendType: AdSpendTypeSchema,
	platform: z.union([MarketingPlatformSchema, z.literal('MANUAL')]),
	adAccountExternalId: z.string().nullable().optional(),
	campaignExternalId: z.string().nullable().optional(),
	startDate: z.iso.date(),
	endDate: z.iso.date(),
	groupBy: AdSpendGroupBySchema,
	currency: CurrencyCodeSchema,
	spend: MonetaryAmountSchema,
	impressions: z.number().int().nonnegative().optional(),
	clicks: z.number().int().nonnegative().optional(),
	conversions: z.number().int().nonnegative().optional(),
})

export class AdSpendRecordedIntegrationEvent extends BaseIntegrationEvent<typeof AdSpendRecordedIntegrationEventSchema> {
	static override readonly name = 'integration.shared.ad_spend.recorded' as const
	static readonly schema = AdSpendRecordedIntegrationEventSchema
}
```

`packages/api/src/shared/events/bk-dash/IntegrationProgressUpdatedIntegrationEvent.ts`:
```typescript
import { BaseIntegrationEvent } from '@shared/types/BaseIntegrationEvent'
import { z } from '@shared/utils/schema'
import { SalesPlatformSchema } from '@shared/enums/SalesPlatform'
import { MarketingPlatformSchema } from '@shared/enums/MarketingPlatform'

export const IntegrationProgressUpdatedIntegrationEventSchema = z.integrationEvent({
	storeIntegrationId: z.string(),
	pipelineType: z.enum(['ORDERS','PRODUCTS','VARIANTS','CAMPAIGNS','AD_SETS','ADS','AD_SPEND','PIXEL']),
	platform: z.union([SalesPlatformSchema, MarketingPlatformSchema]),
	progress: z.number().int().min(0).max(100),
	data: z.record(z.string(), z.unknown()).optional(),
})

export class IntegrationProgressUpdatedIntegrationEvent extends BaseIntegrationEvent<typeof IntegrationProgressUpdatedIntegrationEventSchema> {
	static override readonly name = 'integration.shared.integration.progress_updated' as const
	static readonly schema = IntegrationProgressUpdatedIntegrationEventSchema
}
```

Remaining events follow the same pattern. Each carries the payload listed in spec §7.13 inbound + outbound flows:
- `OrderTransactionRecordedIntegrationEvent` — `{ orderId, transactionId, externalId, kind, status, amount, fees[] }`
- `CartAbandonedIntegrationEvent` — `{ cartId, storeIntegrationId, externalId, cartToken, total, abandonedAt }`
- `ProductUpdatedIntegrationEvent` — `{ productId, storeIntegrationId, externalId, isNew, status, changedFields[] }`
- `VariantUpdatedIntegrationEvent` — `{ variantId, productId, storeIntegrationId, externalId, isNew, changedFields[] }`
- `CampaignUpdatedIntegrationEvent` — `{ campaignId, adAccountExternalId, externalId, status, isNew, changedFields[] }`
- `PixelEventRecordedIntegrationEvent` — `{ pixelEventId, storeIntegrationId, type, occurredAt, cartToken? }`
- `IntegrationHandshakeSucceededIntegrationEvent` — `{ storeIntegrationId, externalId, handshakeAt }`
- `IntegrationHandshakeFailedIntegrationEvent` — `{ storeIntegrationId, reason }`
- `SubscriptionQuotaUpdatedIntegrationEvent` — `{ userId, tier }`
- `StoreIntegrationDataWipeRequestedIntegrationEvent` — `{ storeIntegrationId }`

`packages/api/src/shared/events/bk-dash/index.ts`:
```typescript
import { OrderUpdatedIntegrationEvent } from './OrderUpdatedIntegrationEvent'
import { OrderTransactionRecordedIntegrationEvent } from './OrderTransactionRecordedIntegrationEvent'
import { CartAbandonedIntegrationEvent } from './CartAbandonedIntegrationEvent'
import { ProductUpdatedIntegrationEvent } from './ProductUpdatedIntegrationEvent'
import { VariantUpdatedIntegrationEvent } from './VariantUpdatedIntegrationEvent'
import { CampaignUpdatedIntegrationEvent } from './CampaignUpdatedIntegrationEvent'
import { AdSpendRecordedIntegrationEvent } from './AdSpendRecordedIntegrationEvent'
import { PixelEventRecordedIntegrationEvent } from './PixelEventRecordedIntegrationEvent'
import { IntegrationHandshakeSucceededIntegrationEvent } from './IntegrationHandshakeSucceededIntegrationEvent'
import { IntegrationHandshakeFailedIntegrationEvent } from './IntegrationHandshakeFailedIntegrationEvent'
import { IntegrationProgressUpdatedIntegrationEvent } from './IntegrationProgressUpdatedIntegrationEvent'
import { SubscriptionQuotaUpdatedIntegrationEvent } from './SubscriptionQuotaUpdatedIntegrationEvent'
import { StoreIntegrationDataWipeRequestedIntegrationEvent } from './StoreIntegrationDataWipeRequestedIntegrationEvent'

export { OrderUpdatedIntegrationEvent }
export { OrderTransactionRecordedIntegrationEvent }
export { CartAbandonedIntegrationEvent }
export { ProductUpdatedIntegrationEvent }
export { VariantUpdatedIntegrationEvent }
export { CampaignUpdatedIntegrationEvent }
export { AdSpendRecordedIntegrationEvent }
export { PixelEventRecordedIntegrationEvent }
export { IntegrationHandshakeSucceededIntegrationEvent }
export { IntegrationHandshakeFailedIntegrationEvent }
export { IntegrationProgressUpdatedIntegrationEvent }
export { SubscriptionQuotaUpdatedIntegrationEvent }
export { StoreIntegrationDataWipeRequestedIntegrationEvent }

export const BkDashIntegrationEventRegistry = {
	[OrderUpdatedIntegrationEvent.name]: OrderUpdatedIntegrationEvent,
	[OrderTransactionRecordedIntegrationEvent.name]: OrderTransactionRecordedIntegrationEvent,
	[CartAbandonedIntegrationEvent.name]: CartAbandonedIntegrationEvent,
	[ProductUpdatedIntegrationEvent.name]: ProductUpdatedIntegrationEvent,
	[VariantUpdatedIntegrationEvent.name]: VariantUpdatedIntegrationEvent,
	[CampaignUpdatedIntegrationEvent.name]: CampaignUpdatedIntegrationEvent,
	[AdSpendRecordedIntegrationEvent.name]: AdSpendRecordedIntegrationEvent,
	[PixelEventRecordedIntegrationEvent.name]: PixelEventRecordedIntegrationEvent,
	[IntegrationHandshakeSucceededIntegrationEvent.name]: IntegrationHandshakeSucceededIntegrationEvent,
	[IntegrationHandshakeFailedIntegrationEvent.name]: IntegrationHandshakeFailedIntegrationEvent,
	[IntegrationProgressUpdatedIntegrationEvent.name]: IntegrationProgressUpdatedIntegrationEvent,
	[SubscriptionQuotaUpdatedIntegrationEvent.name]: SubscriptionQuotaUpdatedIntegrationEvent,
	[StoreIntegrationDataWipeRequestedIntegrationEvent.name]: StoreIntegrationDataWipeRequestedIntegrationEvent,
} as const

export type BkDashIntegrationEventName = keyof typeof BkDashIntegrationEventRegistry
```

- [ ] **Step 4: Verify pass + tsc/lint**

Run: `bun test packages/api/src/shared/events/bk-dash/index.test.ts && bun tsc && bun lint`
Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/api/src/shared/events/bk-dash/
git commit -m "feat(shared): integration event payload catalog — 13 shared.* events + registry (P0 Task 17)"
```

---

## Task 18: Contract Lock — SDK regen + final tsc/lint/test sweep

**Files:**
- Regen: `packages/api/public/docs/openapi.json` (if shared types are exposed by any endpoint — at this point unlikely; document outcome)
- Regen: `packages/client/dist/**` (idempotent)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** Task 1..Task 17

- [ ] **Step 1: Regenerate OpenAPI + SDK**

```bash
bun emit-openapi && bun sdk
```

- [ ] **Step 2: Verify regen produced no unintended surprises**

```bash
git diff --stat packages/client/dist/ packages/api/public/docs/openapi.json
```

Expected: minimal or no diff (this sub-plan adds shared types, no new HTTP endpoints). If there's a diff, it's from the BaseIntegrationEvent emission path — review and confirm it's only event-schema additions.

- [ ] **Step 3: Full quality gates**

```bash
bun tsc      # → 0 errors across all workspaces
bun lint     # → 0 errors
bun run test # → all green
```

If any breaks, ROLL BACK the offending Task and re-do.

- [ ] **Step 4: Commit**

```bash
git add packages/api/public/docs/openapi.json packages/client/dist/ 2>/dev/null || true
git commit --allow-empty -m "chore(sdk): regen + tsc/lint/test sweep after P0 foundation (P0 Task 18)"
```

---

## Final Validation

- [ ] `bun tsc` — 0 errors across all workspaces
- [ ] `bun lint` — 0 errors
- [ ] `bun test affected --base=dev` — all green
- [ ] `bun e2e --grep "shared-foundation"` — N/A (no e2e for shared types; defer to PE-E2E)
- [ ] AC mapping (every spec §7.0 type → ≥1 test):
  - CurrencyCode / MonetaryAmount / MonetaryByCurrency → `packages/api/src/shared/types/MonetaryAmount.test.ts`
  - FxRate / FxRateSource → `packages/api/src/shared/types/FxRate.test.ts`
  - Role / NotificationCurrencyMode / FcmPlatform → `packages/api/src/shared/enums/identity.test.ts`
  - StoreIntegrationType / *Platform / Platform / IntegrationCredentialField → `packages/api/src/shared/types/Platform.test.ts`
  - PaymentStatus / PaymentMethod / PaymentGateway / TransactionKind/Status / DisputeStatus / OrderTransactionFeeType / PostalAddress / UtmTags → `packages/api/src/shared/types/PostalAddress.test.ts`
  - OrderLine / OrderTransaction / OrderTransactionFee / CartLine → `packages/api/src/shared/types/OrderTransaction.test.ts`
  - OrderOverrideFields → `packages/api/src/shared/types/OrderOverrideFields.test.ts`
  - ProductStatus / ProductCostType / QuantityModifier / ProductCostOption family → `packages/api/src/shared/types/ProductCostOption.test.ts`
  - CampaignStatus / AdSpendType / AdSpendGroupBy / ManualMarketingExpenseBinding → `packages/api/src/shared/types/ManualMarketingExpenseBinding.test.ts`
  - PixelEventType → `packages/api/src/shared/enums/PixelEventType.test.ts`
  - TaxType / TaxDeductionType / OperationalCost* / ShippingCost* / GatewayFee / CheckoutFee / ShippingFee → `packages/api/src/shared/types/finance.test.ts`
  - GoalType / AnalyticsFrequency / DayOfWeek / ChartType / TimezoneMode / ChartSeriesPoint / RegionBucket → `packages/api/src/shared/types/ChartSeriesPoint.test.ts`
  - NotificationCategory / Origin / Channel → `packages/api/src/shared/enums/notifications.test.ts`
  - PlanTier / PlanPeriod / BillingPlatform / PlanFeature / PlanQuota / PLAN_QUOTAS / SubscriptionEventType → `packages/api/src/shared/constants/PlanQuotas.test.ts`
  - PaginationInput / SortOrder / DateRange / CsvImportRowResult → `packages/api/src/shared/types/generic.test.ts`
  - Error glossary (per-BC unions + BkDashAnyError) → `packages/api/src/shared/errors/bk-dash/index.test.ts`
  - Integration events (13 events + registry) → `packages/api/src/shared/events/bk-dash/index.test.ts`

## Notes

- Folder rationale: shared types under `packages/api/src/shared/types/`, enums under `packages/api/src/shared/enums/`, constants under `packages/api/src/shared/constants/`, errors under `packages/api/src/shared/errors/bk-dash/` (namespaced so they don't clash with the template's existing `packages/api/src/shared/errors/`), events under `packages/api/src/shared/events/bk-dash/` (same rationale).
- No DI container needed for any of these — they're pure data types and constants.
- `z.integrationEvent` helper lives at `packages/api/src/shared/utils/schema/ExtraTypes.ts`. If a Task fails because the helper doesn't accept the payload shape, the helper must be extended via a separate sub-plan (`P0-FIX-SCHEMA-HELPER`) — do NOT inline-modify it from a BK-Dash sub-plan.
- The graph CLI (`bun scripts/graph/cli/index.ts`) is currently broken (Go-adapter expects `packages/channel/internal`). Skip `validate-plan` for this sub-plan. Tracked in master progress log.
- Once this sub-plan is fully built, the next iteration target is **PG-GO-WORKER** (port the Go sync worker — depends on P0-FOUNDATION for Postgres schema names + idempotency-key convention).
