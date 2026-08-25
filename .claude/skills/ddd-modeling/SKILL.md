---
name: ddd-modeling
description: Strategic and tactical DDD modeling. Use when designing bounded contexts, aggregates, and domain boundaries. Use this skill whenever a feature introduces new entities, you're unsure about aggregate boundaries, or need to model a new domain area — especially for features with 3+ entities.
---

# DDD Modeling — Strategic & Tactical Design

> **BEFORE IMPLEMENTING**: Read the "Bad Practices" section at the end of this document to avoid common violations.

Guides the decomposition of a feature into bounded contexts, aggregates, and domain boundaries using DDD principles. This skill is a prerequisite for `/plan` when a feature introduces new entities.

## When to Use This Skill

- Feature introduces new entities
- You need to decide whether entities belong in the same or different contexts
- Designing aggregate boundaries for a new domain area
- Cross-context relationships need to be modeled

## When NOT to Use This Skill

- Frontend-only changes
- Backend changes that doesn't relate to entity operations

## Prerequisites

- User stories or PRD available
- Understanding of the business domain

---

## Part 1: Strategic DDD — Context Discovery

### Step 1: Entity Extraction

List all substantives (nouns) from user stories as candidate entities:

```
User Stories → Extract nouns → Candidate Entities
```

Example:
- "Doctor creates an AI Agent with Skills and Tools"
- Candidates: Doctor, Agent, Skill, Tool

### Step 2: Language Boundary Grouping

Group entities by "language boundary" — entities that share the same ubiquitous language belong together:

| Group | Entities | Shared Language |
|-------|----------|----------------|
| Agent Core | Agent, Skill, Tool | "agent capabilities" |
| Conversation | Conversation, Message | "chat interactions" |
| Scheduling | Schedule, ExecutionLog | "when things run" |

### Step 3: Lifecycle Analysis

For each group, identify lifecycle characteristics:

| Entity Group | Created By | Updated By | Deleted By | Independent? |
|-------------|-----------|-----------|-----------|-------------|
| Agent Core | Admin | Admin | Admin | Yes |
| Conversation | System/User | System | System | Yes |
| Scheduling | Admin | System | Admin | Yes |

**Rule**: Entities with different lifecycles → strong candidate for separate contexts.

### Step 4: Consistency Boundary Analysis

For each pair of entity groups, ask:
- Do they share invariants? (Must be consistent at all times?)
- Can they be eventually consistent? (One updates, other catches up later?)

| Group A | Group B | Shared Invariants? | Decision |
|---------|---------|-------------------|----------|
| Agent Core | Conversation | No — agent can exist without conversations | Separate |
| Agent Core | Scheduling | No — schedules reference agents by ID | Separate |

**Rule**: No shared invariants + different lifecycle = separate contexts.

### Step 5: Context Map

Produce a context map with relationship types:

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  agent-core  │────►│ conversation  │     │  scheduling  │
│             │     │              │     │             │
│ Agent       │     │ Conversation │     │ Schedule    │
│ Skill       │     │ Message      │     │ ExecutionLog│
│ Tool        │     │              │     │             │
└─────────────┘     └──────────────┘     └─────────────┘
       │                                        │
       └────────────────────────────────────────┘
                   Referenced by ID
```

Relationship types:
- **Shared Kernel**: Shared code/types between contexts
- **Customer-Supplier**: One context produces, another consumes
- **Conformist**: One context conforms to another's model
- **Anti-Corruption Layer**: Translation layer between contexts

---

## Part 2: Heuristics for Splitting

### When to Split a Context

| Signal | Threshold | Action |
|--------|-----------|--------|
| Entity count | >5 entities | Consider split |
| Use case count | >10 use cases | Definitely split |
| No shared invariants between groups | Any count | Split |
| Different lifecycle | Any count | Strong candidate for split |
| Different rate of change | Any count | Consider split |
| Different team ownership | Any count | Split |

### When NOT to Split

| Signal | Reason |
|--------|--------|
| Entities share transactional invariants | Must be in same aggregate/context |
| <4 entities total | Over-engineering |
| Shared lifecycle | Natural grouping |

> **The invariant/lifecycle boundary DOMINATES the entity-count heuristic — never god-context.**
> "<4 entities → over-engineering" means *do not split one cohesive aggregate into many contexts*;
> it does **not** license lumping two aggregates that each own their **own** invariants and have
> **different lifecycles** into a single catch-all context just because the feature is small. Two
> aggregates with distinct invariants + different rates of change belong in **separate** contexts
> even if there are only two of them. Worked trap (measured): a Kanban feature has a `Board`
> aggregate (created once, archived; owns its lists as ordered value objects) and a `Card` aggregate
> (created, moved between lists constantly — a *different* lifecycle, its own move invariant). These
> are **two contexts** (`board`, `card`), NOT one `kanban` god-context owning both. If you find
> yourself naming a context after the *feature* ("kanban", "billing-stuff") rather than after a
> single aggregate's consistency boundary, that is the god-context smell — split it.

---

## Part 3: Tactical DDD — Aggregate Design

### Aggregate Rules

1. **One aggregate root per consistency boundary** — the root entity owns the transaction
2. **Children via composition** — arrays of IDs or embedded objects
3. **Cross-aggregate references by ID only** — never object references
4. **Keep aggregates small** — prefer eventual consistency between aggregates
5. **Database junction tables ≠ domain model** — the DB may have many-to-many via junction tables, but in the domain model navigation goes through the aggregate root

> **Value object vs aggregate — don't OVER-model (the inverse of god-context).** A child concept is a
> **VALUE OBJECT on its parent** — NOT its own aggregate — when it has **no independent lifecycle**,
> **no invariants of its own**, and is **only ever accessed through its parent**. A value object gets
> NO repository, NO controller, NO use case, NO event — it is embedded data the parent owns. Promote a
> child to its own aggregate ONLY when it has its own lifecycle + its own invariants + a confirmed
> need to be loaded/changed independently. Worked trap (measured): in a ClickUp feature a `Space`
> owns ordered **Lists**; a List is just a grouping with a name + order — no lifecycle, no invariant,
> never loaded on its own → it is a **value object on Space**, NOT a `SpaceList` aggregate with its
> own repo/usecase/controller/event. Giving a VO that machinery is over-modeling and bloats the model
> exactly as a god-context collapses it — both are decomposition failures. Ask of every entity: *does
> it change on its own timeline and enforce its own rules?* If no → value object.

### Aggregate Design Template

```typescript
const AgentSchema = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	systemPrompt: z.string().min(1),
	status: z.enum(AgentStatus).default(AgentStatus.DRAFT),
	model: z.string().min(1),
	temperature: z.number().min(0).max(2).optional(),
	maxTokens: z.number().min(1).optional(),
	teamId: z
		.string()
		.optional()
		.transform(v => (v ? new Id(v) : undefined)),
	createdById: z.string().transform(v => new Id(v)),
	skillIds: z
		.array(z.string())
		.optional()
		.default([])
		.transform(ids => ids.map(v => new Id(v))),
	toolIds: z
		.array(z.string())
		.optional()
		.default([])
		.transform(ids => ids.map(v => new Id(v))),
})

export class Agent extends AggregateRoot<typeof AgentSchema> {
	static override schema = AgentSchema

	static create(data: {
		name: string
		systemPrompt: string
		model: string
		createdById: string
		description?: string
		temperature?: number
		maxTokens?: number
		teamId?: string
	}): Agent {
		return new Agent({
			name: data.name,
			description: data.description,
			systemPrompt: data.systemPrompt,
			model: data.model,
			temperature: data.temperature,
			maxTokens: data.maxTokens,
			teamId: data.teamId,
			createdById: data.createdById,
		})
	}

	activate(): void {
		this.status = AgentStatus.ACTIVE
	}

	archive(): void {
		this.status = AgentStatus.ARCHIVED
	}

	isActive(): boolean {
		return this.status === AgentStatus.ACTIVE
	}

	updateConfig(data: { systemPrompt?: string; model?: string; temperature?: number; maxTokens?: number }): void {
		if (data.systemPrompt !== undefined) {
			this.systemPrompt = data.systemPrompt
		}
		if (data.model !== undefined) {
			this.model = data.model
		}
		if (data.temperature !== undefined) {
			this.temperature = data.temperature
		}
		if (data.maxTokens !== undefined) {
			this.maxTokens = data.maxTokens
		}
	}

	assignSkills(skillIds: Id[]): void {
		this.skillIds = [...skillIds]
	}

	assignTools(toolIds: Id[]): void {
		this.toolIds = [...toolIds]
	}

	hasSkill(skillId: Id): boolean {
		return this.skillIds.some(id => id.value === skillId.value)
	}

	hasTool(toolId: Id): boolean {
		return this.toolIds.some(id => id.value === toolId.value)
	}
}

export interface Agent extends Z.infer<typeof AgentSchema> {}


// Skill and Tool are separate aggregates (own lifecycle)
class Skill extends AggregateRoot<typeof SkillSchema> { ... }
class Tool extends AggregateRoot<typeof ToolSchema> { ... }
```

### Anti-pattern: Junction Table as Domain Concept

```typescript
// WRONG — membership check via junction table in repository
async isToolAssignedToAgent(toolId: Id, agentId: Id): Promise<boolean> {
  const [row] = await this.db.select().from(agentTools)
    .where(and(eq(agentTools.toolId, toolId), eq(agentTools.agentId, agentId)))
  return !!row
}

// CORRECT — aggregate root knows its relationships
// Load the Agent with its toolIds, then:
const agent = await this.agentRepo.findByIdWithTools(agentId)
if (!agent.hasSkill(skillId)) throw ...
```

**Rule**: The database can have many-to-many via junction tables, but in code these checks go through the aggregate root.

---

## Part 4: Example — E-Commerce Domain Modeling

### Scenario

> "A customer browses a product catalog, adds items to a cart, places an order, and receives a shipment. Sellers manage their product listings and inventory."

Candidate nouns: Customer, Product, Category, Cart, CartItem, Order, OrderItem, Payment, Shipment, Seller, Inventory, Review.

### Context Map

| Context | Entities | Rationale |
|---------|----------|-----------|
| `catalog` | Product (root), Category, Variant | Product discovery — seller-owned lifecycle |
| `inventory` | Stock (root), StockMovement | Stock levels — own lifecycle, updated on sales/returns |
| `cart` | Cart (root), CartItem | Transient shopping state — customer-owned, short lifecycle |
| `ordering` | Order (root), OrderItem, Payment | Purchase finalization — strong transactional invariants |
| `fulfillment` | Shipment (root), TrackingEvent | Physical delivery — logistics lifecycle |
| `review` | Review (root) | Post-purchase feedback — independent lifecycle |

```
┌──────────┐    references     ┌───────────┐    triggers    ┌───────────────┐
│ catalog  │◄──────────────────│   cart    │───────────────►│   ordering    │
│          │                   │           │                │               │
│ Product  │                   │ Cart      │                │ Order         │
│ Category │                   │ CartItem  │                │ OrderItem     │
│ Variant  │                   │           │                │ Payment       │
└──────────┘                   └───────────┘                └───────────────┘
     │                                                              │
     ▼                                                              ▼
┌──────────┐                                              ┌───────────────┐
│inventory │◄─────────────────────────────────────────────│ fulfillment   │
│          │         reserved on order placed             │               │
│ Stock    │                                              │ Shipment      │
│ Movement │                                              │ TrackingEvent │
└──────────┘                                              └───────────────┘
```

Relationship types used:
- **Customer-Supplier**: `catalog` supplies product data; `cart` and `ordering` consume it by ID
- **Anti-Corruption Layer**: `fulfillment` talks to third-party logistics APIs — ACL translates external tracking events into `TrackingEvent` domain objects
- **Conformist**: `review` conforms to `ordering` (a review can only exist for a completed order)

### Aggregate Boundaries

| Aggregate Root | Children / Value Objects | Cross-Aggregate References |
|---------------|--------------------------|---------------------------|
| Product | Variant[], Category (VO) | sellerId (by ID) |
| Stock | StockMovement[] | productId (by ID) |
| Cart | CartItem[] | customerId (by ID), productId (by ID) per item |
| Order | OrderItem[], Payment | customerId (by ID) |
| Shipment | TrackingEvent[] | orderId (by ID) |
| Review | — | customerId (by ID), productId (by ID), orderId (by ID) |

### Key Design Decisions

**Why Cart and Order are separate contexts:**
- Cart is transient — items can be added/removed freely, no financial commitment
- Order is immutable after placement — strong audit and payment invariants
- Different lifecycle: Cart is abandoned/merged; Order is fulfilled/refunded

**Why Inventory is separate from Catalog:**
- Product descriptions change on seller schedule
- Stock levels change on every purchase/return/restock (high write frequency)
- Different team ownership (catalog team vs. warehouse team)

**Why Payment is inside Order, not a separate context:**
- Payment and Order share a transactional invariant: an Order must have a valid Payment to be confirmed — they must be strongly consistent, so they belong in the same aggregate.

---

## Checklist

- [ ] Story nouns listed and grouped by language boundary
- [ ] Lifecycle analysis performed for each group
- [ ] Consistency boundary analysis performed
- [ ] No context with >8 entities without explicit justification
- [ ] Context map produced with relationship types
- [ ] Aggregate boundaries defined (one root per aggregate)
- [ ] Many-to-many relationships modeled via aggregate root, not junction tables in domain
- [ ] Cross-aggregate references use ID, not objects

## Bad Practices

### bp-01: God Aggregate

**WRONG** — One aggregate managing everything:
```typescript
class Organization {
  members: Member[]
  appointments: Appointment[]
  invoices: Invoice[]
  documents: Document[]
  // 50+ methods managing all subdomain logic
}
```

**CORRECT** — Small, focused aggregates protecting specific invariants:
```typescript
// Organization aggregate: only manages membership
class Organization { members: Member[] }

// Appointment aggregate: manages scheduling independently
class Appointment { doctorId: string; patientId: string; slot: TimeSlot }
```

### bp-02: Cross-Aggregate Direct References

**WRONG** — Aggregate holding reference to another aggregate:
```typescript
class Order {
  customer: Customer // Direct reference creates tight coupling!
  product: Product   // Can't load Order without loading Product
}
```

**CORRECT** — Reference by ID only:
```typescript
class Order {
  customerId: string  // Reference by ID
  productId: string   // Load separately when needed
}
```

## References

- `.claude/commands/plan.md` - Consumed by /plan for context mapping and artifact derivation
- `.claude/skills/entity/SKILL.md` - Entity creation patterns
- `.claude/skills/repository/SKILL.md` - Repository patterns for aggregates
- `docs/BACKEND.md` - Architecture principles
