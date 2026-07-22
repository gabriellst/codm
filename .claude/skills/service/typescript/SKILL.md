---
name: service
description: "Create a domain or application service. Use when business logic doesn't fit in an entity or spans multiple entities. Use this skill for cross-entity calculations, external API integrations, or complex business rules that coordinate multiple aggregates."
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

> Canonical shape: see `snippet.skeleton` (and `snippet.exemplar`) in this skill's `registry.yaml` — the single source the CLI renders and `/review` checks against.

# Create Service

Services encapsulate domain or application logic that doesn't naturally belong to a single entity. Domain services coordinate behavior across multiple entities or implement logic that spans aggregate boundaries. Application services orchestrate infrastructure concerns like external API calls, email sending, or payment processing.

## When NOT to Use

- **Logic belongs in an entity method** -- if the operation only involves one entity's data, it should be a method on that entity
- **A use case can directly orchestrate the operation** -- if you're just calling a repository and returning, you don't need a service layer
- **You're just wrapping a repository call** -- adding a service that does `return this.repository.findById(id)` adds no value

## Prerequisites

- Read `docs/BACKEND.md` for service patterns
- Context must exist (use `/context` first)

## Service Types

| Type | Purpose | Example |
|------|---------|---------|
| **Domain Service** | Business logic spanning multiple entities | `PricingService`, `ShippingCalculator` |
| **Application Service** | External integrations, infrastructure | `EmailService`, `PaymentGateway` |

## When to Use Services

Use services when:
- Logic doesn't belong to a single entity
- Operation involves multiple aggregates
- External system integration is needed
- Complex calculations or algorithms

Don't use services for:
- Logic that belongs to a single entity (put it in the entity)
- Simple CRUD operations (use repository directly)

## Process

### Step 1: Create Service Contract [SVC-01, SVC-P01, SVC-P02]

```typescript
// <context>/services/<ServiceName>/index.ts

// Domain Service Contract — abstract class so tsyringe can use it as DI token
export abstract class PricingService {
  abstract calculatePrice(params: CalculatePriceParams): Promise<Money>
  abstract applyDiscount(price: Money, discountCode: string): Promise<Money>
}

// DTO interfaces for method params/results are fine as interfaces
export interface CalculatePriceParams {
  productId: string
  quantity: number
  customerId?: string
}
```

### Step 2: Create Service Implementation [SVCI-01, SVC-P04, SVC-P09, SVC-P10]

```typescript
// <context>/services/<ServiceName>/<Implementation>.ts
import { injectable } from 'tsyringe-neo'
import { Money } from '@shared/objects'
import { PricingService, CalculatePriceParams } from './index'
import { ProductRepository } from '../../repositories/ProductRepository'
import { DiscountRepository } from '../../repositories/DiscountRepository'

@injectable()
export class DefaultPricingService extends PricingService {
  constructor(
    private productRepository: ProductRepository,
    private discountRepository: DiscountRepository,
  ) {}

  async calculatePrice(params: CalculatePriceParams): Promise<Money> {
    const product = await this.productRepository.findById(new Id(params.productId))
    if (!product) {
      throw new BaseError<ApplicationErrors>('PRODUCT_NOT_FOUND')
    }

    const basePrice = product.price
    const quantity = params.quantity

    // Apply quantity discounts
    let unitPrice = basePrice
    if (quantity >= 100) {
      unitPrice = basePrice * 0.85  // 15% off
    } else if (quantity >= 50) {
      unitPrice = basePrice * 0.90  // 10% off
    } else if (quantity >= 10) {
      unitPrice = basePrice * 0.95  // 5% off
    }

    return Money.create(unitPrice * quantity, 'BRL')
  }

  async applyDiscount(price: Money, discountCode: string): Promise<Money> {
    const discount = await this.discountRepository.findByCode(discountCode)
    if (!discount) {
      throw new BaseError<ApplicationErrors>('INVALID_DISCOUNT_CODE')
    }

    if (discount.isExpired()) {
      throw new BaseError<ApplicationErrors>('DISCOUNT_EXPIRED')
    }

    if (discount.type === 'PERCENTAGE') {
      return price.multiply(1 - discount.value / 100)
    } else {
      return price.subtract(Money.create(discount.value, price.currency))
    }
  }
}
```

### Step 3: Register in the Registry System [SVCI-02, SVC-P03, SVC-P11, SVC-P12]

```typescript
// packages/api/typescript/src/<context>/registry.ts
import { type InstanceRegistry, expandBindings } from '@template/core-typescript'
import { PricingService, MockPricingService, DefaultPricingService } from '../services'

// One declaration per token — `integration` omitted mirrors `real`; `null` = declared absence.
export const INSTANCE_REGISTRY: InstanceRegistry = expandBindings([
  { token: PricingService, mock: MockPricingService, real: DefaultPricingService },
])
```

Every DI-managed service must provide both:

- a `MockXService` for `mock`
- a true concrete implementation for `integration` and `real` such as `DefaultXService`, `WebChatProvider`, or `ConsoleMailSender`

If the service is shared across contexts, bind it directly in `packages/api/typescript/src/shared/registry.ts` (the `CORE_REGISTRY` declarations). Otherwise, bind it in the owning context's `registry.ts` — `packages/api/typescript/src/shared/registry.ts` composes that context registry via `CONTEXT_REGISTRIES` and the mechanical merge into `ALL_REGISTRIES`.

### Exception: Factory-Managed Services [SVC-P13]

When concrete implementations are consumed exclusively through a factory class and injected by their **concrete type** (not by an abstract token), **no registry entries are needed**. The `@injectable()` decorator is sufficient — tsyringe auto-resolves them.

```typescript
// services/ChatProvider/ChatProviderFactory.ts
@injectable()
export class ChatProviderFactory {
  constructor(
    private consoleChatProvider: ConsoleChatProvider,  // concrete type, not ChatProvider
    private webChatProvider: WebChatProvider,           // concrete type, not ChatProvider
  ) { ... }
  get(platform: ExternalPlatform): ChatProvider { ... }
}

// ConsoleChatProvider.ts — @injectable() only, NO registry entry
@injectable()
export class ConsoleChatProvider extends ChatProvider { ... }

// WebChatProvider.ts — @injectable() only, NO registry entry
@injectable()
export class WebChatProvider extends ChatProvider { ... }

// registry.ts — NONE of these need entries
// ChatProviderFactory, ConsoleChatProvider, WebChatProvider are all auto-resolved
```

This applies when:
- The factory takes implementations by **concrete class**, not by abstract token
- No consumer injects `ChatProvider` directly — they always go through the factory
- All participants have `@injectable()`

### Step 4: Use in Use Cases

```typescript
@injectable()
export class CreateOrder extends Handler<...> {
  constructor(
    private pricingService: PricingService,
    private orderRepository: OrderRepository,
  ) {
    super()
  }

  protected async handle(input: this['input']): Promise<this['output']> {
    // Use service for pricing logic
    const totalPrice = await this.pricingService.calculatePrice({
      productId: input.productId,
      quantity: input.quantity,
      customerId: input.customerId,
    })

    if (input.discountCode) {
      const discountedPrice = await this.pricingService.applyDiscount(
        totalPrice,
        input.discountCode
      )
    }

    // ... create order
  }
}
```

## Common Service Patterns [SVC-C01, SVC-C02, SVC-P05]

### External Integration Service

```typescript
// payment/services/PaymentGateway/index.ts

// Abstract class — tsyringe requires a class reference as DI token; interfaces are erased at runtime
export abstract class PaymentGateway {
  abstract createPayment(params: CreatePaymentParams): Promise<PaymentResult>
  abstract refund(paymentId: string, amount?: number): Promise<RefundResult>
  abstract getStatus(paymentId: string): Promise<PaymentStatus>
}

// DTO interfaces for method params/results are fine as interfaces
export interface CreatePaymentParams {
  amount: number
  currency: string
  customerId: string
  method: PaymentMethod
  metadata?: Record<string, string>
}

export interface PaymentResult {
  id: string
  status: PaymentStatus
  redirectUrl?: string
}
```

```typescript
// payment/services/PaymentGateway/StripePaymentGateway.ts
import { injectable } from 'tsyringe-neo'
import Stripe from 'stripe'
import { PaymentGateway, CreatePaymentParams, PaymentResult } from './index'

@injectable()
export class StripePaymentGateway extends PaymentGateway {
  private stripe: Stripe

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: params.amount * 100,  // Stripe uses cents
      currency: params.currency.toLowerCase(),
      customer: params.customerId,
      metadata: params.metadata,
    })

    return {
      id: paymentIntent.id,
      status: this.mapStatus(paymentIntent.status),
      redirectUrl: paymentIntent.next_action?.redirect_to_url?.url,
    }
  }

  async refund(paymentId: string, amount?: number): Promise<RefundResult> {
    const refund = await this.stripe.refunds.create({
      payment_intent: paymentId,
      amount: amount ? amount * 100 : undefined,
    })

    return {
      id: refund.id,
      status: refund.status as RefundStatus,
    }
  }

  async getStatus(paymentId: string): Promise<PaymentStatus> {
    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentId)
    return this.mapStatus(paymentIntent.status)
  }

  private mapStatus(stripeStatus: string): PaymentStatus {
    const statusMap: Record<string, PaymentStatus> = {
      'requires_payment_method': PaymentStatus.PENDING,
      'requires_confirmation': PaymentStatus.PENDING,
      'requires_action': PaymentStatus.PENDING,
      'processing': PaymentStatus.PROCESSING,
      'succeeded': PaymentStatus.COMPLETED,
      'canceled': PaymentStatus.CANCELLED,
    }
    return statusMap[stripeStatus] ?? PaymentStatus.UNKNOWN
  }
}
```

### Notification Service

```typescript
// notification/services/EmailService/index.ts

// Abstract class — tsyringe DI token must be a class, not an interface
export abstract class EmailService {
  abstract send(params: SendEmailParams): Promise<void>
  abstract sendBulk(params: SendEmailParams[]): Promise<void>
}

// DTO interfaces for method params are fine as interfaces
export interface SendEmailParams {
  to: string | string[]
  template: string
  data: Record<string, any>
  subject?: string
}
```

```typescript
// notification/services/EmailService/SendGridEmailService.ts
import { injectable } from 'tsyringe-neo'
import sgMail from '@sendgrid/mail'
import { EmailService, SendEmailParams } from './index'

@injectable()
export class SendGridEmailService extends EmailService {
  constructor() {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY!)
  }

  async send(params: SendEmailParams): Promise<void> {
    const msg = {
      to: params.to,
      from: process.env.EMAIL_FROM!,
      templateId: this.getTemplateId(params.template),
      dynamicTemplateData: params.data,
    }

    await sgMail.send(msg)
  }

  async sendBulk(params: SendEmailParams[]): Promise<void> {
    const messages = params.map(p => ({
      to: p.to,
      from: process.env.EMAIL_FROM!,
      templateId: this.getTemplateId(p.template),
      dynamicTemplateData: p.data,
    }))

    await sgMail.send(messages)
  }

  private getTemplateId(template: string): string {
    const templates: Record<string, string> = {
      'welcome': process.env.TEMPLATE_WELCOME!,
      'order_confirmation': process.env.TEMPLATE_ORDER_CONFIRMATION!,
      'password_reset': process.env.TEMPLATE_PASSWORD_RESET!,
    }
    return templates[template] ?? template
  }
}
```

### Domain Calculation Service

```typescript
// shipping/services/ShippingCalculator/index.ts

// Abstract class — tsyringe DI token must be a class, not an interface
export abstract class ShippingCalculator {
  abstract calculate(params: ShippingParams): Promise<ShippingQuote[]>
  abstract getDeliveryEstimate(params: ShippingParams): Promise<DeliveryEstimate>
}

// DTO interfaces for method params/results are fine as interfaces
export interface ShippingParams {
  originZipCode: string
  destinationZipCode: string
  weight: number
  dimensions: { length: number; width: number; height: number }
}

export interface ShippingQuote {
  carrier: string
  service: string
  price: Money
  estimatedDays: number
}
```

```typescript
// shipping/services/ShippingCalculator/BrazilShippingCalculator.ts
@injectable()
export class BrazilShippingCalculator extends ShippingCalculator {
  async calculate(params: ShippingParams): Promise<ShippingQuote[]> {
    const quotes: ShippingQuote[] = []

    // Calculate based on distance and weight
    const distance = await this.calculateDistance(
      params.originZipCode,
      params.destinationZipCode
    )

    // Standard shipping
    quotes.push({
      carrier: 'Correios',
      service: 'PAC',
      price: this.calculatePACPrice(distance, params.weight),
      estimatedDays: this.calculatePACDays(distance),
    })

    // Express shipping
    quotes.push({
      carrier: 'Correios',
      service: 'SEDEX',
      price: this.calculateSEDEXPrice(distance, params.weight),
      estimatedDays: this.calculateSEDEXDays(distance),
    })

    return quotes.sort((a, b) => a.price.amount - b.price.amount)
  }

  // ... implementation details
}
```

## Testing Services [SVC-C03, SVC-P06]

Create a mock implementation alongside the concrete implementation and bind it in the registry:

```typescript
// payment/services/PaymentGateway/MockPaymentGateway.ts
@injectable()
export class MockPaymentGateway extends PaymentGateway {
  private payments: Map<string, PaymentResult> = new Map()

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    const result: PaymentResult = {
      id: `mock_${Date.now()}`,
      status: PaymentStatus.COMPLETED,
    }
    this.payments.set(result.id, result)
    return result
  }

  async refund(paymentId: string): Promise<RefundResult> {
    return { id: `refund_${paymentId}`, status: 'succeeded' }
  }

  async getStatus(paymentId: string): Promise<PaymentStatus> {
    return this.payments.get(paymentId)?.status ?? PaymentStatus.UNKNOWN
  }

  // Test helpers
  clear(): void {
    this.payments.clear()
  }
}
```

## Checklist

- [ ] All `when: always` patterns present (SVC-01, SVC-02, SVCI-01, SVCI-02 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (SVC-C01 through SVC-C03 — check which apply)
- [ ] Service exposes both `MockXService` and a true concrete implementation
- [ ] Context services are registered in `packages/api/typescript/src/<context>/registry.ts`
- [ ] Shared services are registered in `packages/api/typescript/src/shared/registry.ts`
- [ ] No `bad_practices` violations (bp-01 through bp-04 — verify against registry.yaml)

## References

- `docs/BACKEND.md` — First-Class Citizens table (Service row)
