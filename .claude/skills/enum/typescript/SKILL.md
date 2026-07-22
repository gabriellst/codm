---
name: enum
description: Create a domain enum (status, type, category). Use when defining fixed sets of values like OrderStatus, PaymentType, DayOfWeek. Use this skill whenever you need to model a finite set of named constants that represent domain concepts.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

> Canonical shape: see `snippet.skeleton` (and `snippet.exemplar`) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.

## Why Enums Exist

Enums provide type-safe constants for domain concepts with fixed value sets. Unlike plain strings, enums are validated at compile time, appear in IDE autocomplete, and prevent typos. They also serve as the single source of truth — the same enum is used in entities, repositories, controllers, and the frontend SDK.

# Create Domain Enum

Creates a TypeScript enum for domain concepts following project patterns.

## Prerequisites

- Read `docs/BACKEND.md` — Schema Strategy section (covers `z.enum()` + `pgEnum` rule)
- Context must exist (use `/context` first if needed)

## When to Use Enums

Use enums for:
- **Status fields**: `OrderStatus`, `PaymentStatus`, `UserStatus`
- **Type classifications**: `PaymentType`, `DocumentType`, `NotificationType`
- **Categories**: `ProductCategory`, `EventCategory`
- **Fixed options**: `Priority`, `Severity`, `Role`

## Process

### Step 1: Create Enum File

Create a file in `<context>/enums/`:

```typescript
// <context>/enums/OrderStatus.ts
// CRITICAL: Both keys AND values use SCREAMING_SNAKE_CASE (UPPERCASE)
export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}
```

### Step 2: Export from Index

Edit `<context>/enums/index.ts`:

```typescript
export { OrderStatus } from './OrderStatus'
export { PaymentType } from './PaymentType'
// Add your new enum export
```

### Step 3: Use in Zod Schemas

```typescript
import { z } from '@template/core-typescript'
import { OrderStatus } from '../enums'

// In controller InputSchema
const InputSchema = z.object({
  body: z.object({
    status: z.enum(OrderStatus),  // CORRECT - Always z.enum()
  }),
})

// For optional enum
const InputSchema = z.object({
  query: z.object({
    status: z.enum(OrderStatus).optional(),
  }),
})

// For array of enum values
const InputSchema = z.object({
  body: z.object({
    statuses: z.array(z.enum(OrderStatus)),
  }),
})
```

## Critical Rules [ENUM-C02, bp-02, bp-07]

### Always Use z.enum()

See `bp-07` in registry.yaml for the wrong/right pattern.

### Controller Cross-Reference Rule [ENUM-P07, bp-02]

When defining an enum, verify that ALL controllers using related fields reference it via `z.enum()`, never `z.string()`:

See `bp-02` in registry.yaml for the wrong/right pattern.

### Both Keys AND Values Use UPPERCASE (SCREAMING_SNAKE_CASE) [ENUM-01, ENUM-P01]

See `ENUM-01` in registry.yaml for the wrong/right pattern.

## Usage in Entities

```typescript
import { AggregateRoot, z } from '@template/core-typescript'
import Z from 'zod'
import { OrderStatus } from '../enums'
import { DomainErrors } from '../errors'

const OrderSchema = z.object({
  status: z.enum(OrderStatus),
  // ... other fields
})

export type OrderProps = Z.infer<typeof OrderSchema>

export class Order extends AggregateRoot<typeof OrderSchema> {
  static override schema = OrderSchema

  static create(data: { /* ... */ }): Order {
    return new Order({
      ...data,
      status: OrderStatus.PENDING,  // Initial status
    })
  }

  confirm(): void {
    if (this.status !== OrderStatus.PENDING) {
      throw new BaseError<DomainErrors>('ORDER_CANNOT_BE_CONFIRMED')
    }
    this.status = OrderStatus.CONFIRMED
  }

  cancel(): void {
    if (this.status === OrderStatus.DELIVERED) {
      throw new BaseError<DomainErrors>('DELIVERED_ORDER_CANNOT_BE_CANCELLED')
    }
    this.status = OrderStatus.CANCELLED
  }
}

export interface Order extends OrderProps {}
```

## Usage in Repositories

```typescript
// In Drizzle repository - convert between persistence and domain
private toDomain(row: typeof orders.$inferSelect): Order {
  return new Order({
    id: row.id,
    status: row.status as OrderStatus,  // Cast from DB enum string
    // ... other fields
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    version: row.version,
  })
}

private toPersistence(entity: Order): typeof orders.$inferInsert {
  return {
    id: entity.id.value,
    status: entity.status,  // Enum value stored directly
  }
}
```

## Common Patterns [ENUM-P10, ENUM-C01]

### Status with Transitions

```typescript
export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

// Valid transitions map
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
}
```

### Type with Metadata

```typescript
export enum PaymentType {
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  PIX = 'PIX',
  BOLETO = 'BOLETO',
}

export const PAYMENT_TYPE_INFO: Record<PaymentType, { label: string; icon: string }> = {
  [PaymentType.CREDIT_CARD]: { label: 'Credit Card', icon: 'credit-card' },
  [PaymentType.DEBIT_CARD]: { label: 'Debit Card', icon: 'credit-card' },
  [PaymentType.PIX]: { label: 'PIX', icon: 'pix' },
  [PaymentType.BOLETO]: { label: 'Boleto', icon: 'barcode' },
}
```

## Checklist

- [ ] All `when: always` patterns present (ENUM-01 through ENUM-04 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (ENUM-C01, ENUM-C02 — check which apply)
- [ ] No `bad_practices` violations (bp-01 through bp-08 — verify against registry.yaml)
- [ ] Registered in `shared/index.ts` via `openapi.registerEnums()`

## Example

Creating a `ProductStatus` enum:

```typescript
// product/enums/ProductStatus.ts
export enum ProductStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  OUT_OF_STOCK = 'OUT_OF_STOCK',
  DISCONTINUED = 'DISCONTINUED',
}
```

```typescript
// product/enums/index.ts
export { ProductStatus } from './ProductStatus'
```

```typescript
// Using in controller
import { ProductStatus } from '../enums'

const InputSchema = z.object({
  body: z.object({
    name: z.string(),
    status: z.enum(ProductStatus).default(ProductStatus.DRAFT),
  }),
})
```

## Frontend Enums Rule [ENUM-P08]

**IMPORTANT:** This skill is for **backend domain enums** only (placed in `<context>/enums/`).

Frontend-only enums (enums that don't exist in the backend, e.g. `CalendarView` for a UI widget) must **NOT** be placed in a centralized `packages/app/react/src/enums/` folder. Instead, they must be **co-located alongside the component that primarily uses them**.

```typescript
// ❌ WRONG - Centralized frontend enums folder
packages/app/react/src/enums/CalendarView.ts

// ✅ CORRECT - Co-located with the primary component
packages/app/react/src/routes/(app)/dashboard/-components/.../ViewSelector/index.tsx
export enum CalendarView { DAY = 'day', WEEK = 'week', MONTH = 'month' }
```

For enums that exist in the backend, the frontend should always import from the SDK:
```typescript
import { GameGenreEnum } from '@template/client-typescript/typescript'
```

## Frontend Enum Labels via i18n [ENUM-P11, ENUM-P12, bp-09]

**Every enum value displayed in the UI must resolve through i18n** under the canonical
`enums.<EnumName>.<VALUE>` namespace. There is **no** `lib/labels.ts` `Record<EnumType, string>`
in this project — that pattern is dead. Two payoffs:

1. The zod-config `getEnumLabel` automatically resolves invalid-enum error messages by
   walking `resources.enums.*` — no extra wiring per enum.
2. Locales scale per-language without touching component code.

### Add to BOTH locales (`packages/app/react/src/locales/{pt,en}.json`)

```json
{
  "enums": {
    "GameGenre": {
      "ACTION": "Ação",
      "ADVENTURE": "Aventura",
      "RPG": "RPG"
    }
  }
}
```

### Render in tables / read-only UI

```tsx
import { useTranslation } from 'react-i18next'
import type { GameGenreEnum } from '@template/client-typescript/typescript'

const { t } = useTranslation()
<TableCell>{t(`enums.GameGenre.${game.genre as GameGenreEnum}`)}</TableCell>
```

### Render in `<Select>` triggers (Base UI gotcha — see ENUM-P11)

`Base UI`'s `<Select.Value>` does **NOT** auto-resolve the label from the matching
`<Select.Item>` children. You must pass the resolved label as **children**, otherwise
the trigger shows the raw enum value (e.g. `"ACTION"` instead of `"Ação"`) once selected.

```tsx
const selectedGenre = field.state.value as GameGenreEnum | undefined
<Select value={selectedGenre} onValueChange={v => field.handleChange(v as GameGenreEnum)}>
  <SelectTrigger>
    <SelectValue>
      {selectedGenre ? t(`enums.GameGenre.${selectedGenre}`) : t('games.form.genrePlaceholder')}
    </SelectValue>
  </SelectTrigger>
  <SelectContent>
    {ALL_GENRES.map(genre => (
      <SelectItem key={genre} value={genre}>{t(`enums.GameGenre.${genre}`)}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

## References

- `docs/BACKEND.md` — Schema Strategy (enum rules)
- `registry.yaml` — bad practices for enums (bp-01 through bp-09)
- `.claude/skills/form/registry.yaml` — `FRM-P09` (Select trigger renders enum label via t())
