---
name: ddd-spec
description: Generate a complete DDD strategic modeling document from a system idea. Use when the user describes a new system, product, or platform and wants a full Domain-Driven Design specification — from high-level requirements through Event Storming, Bounded Contexts, Context Mapping, and a full TypeScript API specification with Input/Output/Errors for every screen and command.
---

# DDD Strategic Spec — Full Document Generator

Generate a comprehensive DDD spec document (Markdown, 2000–4000 lines) for any system idea. The output covers the entire strategic design pipeline: requirements → event storming → screens & commands → bounded contexts → context mapping → design decisions → TypeScript API specification.

## When to Use

- User describes a system idea, product, or platform
- User says "model this", "DDD for X", "architect this system", "create the spec doc"
- User wants the full strategic design pipeline, not just code

## Reference Exemplar

Read `reference/exemplar-structure.md` in this skill directory for the exact section structure and formatting conventions extracted from a real 3200-line billing system spec document.

## Process

### Phase 1: Understand the Domain

Before writing anything, ask the user enough to understand:

1. **What the system does** — core value proposition in 1–2 sentences
2. **Who the actors are** — admin, end-user, external API, scheduler, etc.
3. **Key domain concepts** — the nouns (entities, aggregates) the user already has in mind
4. **Key operations** — the verbs (commands) the user expects
5. **Market references** — existing products in the same space (e.g., "like Stripe Billing", "like Notion")
6. **Known constraints** — scale, multi-tenancy, multi-currency, compliance, etc.

If the user provides a rich description, skip unnecessary questions and proceed. Don't over-interview.

### Phase 2: Generate the Document

Produce the document as a single `.md` file following the **exact section structure** below. Write it incrementally in chunks and assemble at the end.

After generation is complete, immediately proceed to **Phase 3** without waiting for user input.

### Phase 3: Self-Review — Iterate Until 100%

After producing the initial draft, run a structured self-review pass on the saved file before delivering it to the user. The goal is to catch and fix every issue without requiring a back-and-forth cycle.

**How to run the review:**

1. Read the full generated file from disk
2. Execute each check in the Review Checklist below
3. For every failed check, apply the fix directly to the file
4. Re-read the affected sections to confirm the fix is correct
5. Repeat until all checks pass
6. Only then deliver the file to the user

**Do not deliver the document if any check is still failing.** If a structural issue would require rewriting a major section (e.g., a BC is missing all its commands in Section 7), rewrite that section entirely rather than patching superficially.

---

## Review Checklist

Run all checks after generating the document. Fix before delivering.

### R1 — Completeness

- [ ] All 7 sections are present and non-empty
- [ ] Every screen ID (Tnn) listed in Section 3 has a corresponding `Read — ScreenName (Tnn)` in Section 7
- [ ] Every command ID (Cnn) listed in Section 3 has a corresponding `Command — CommandName (Cnn)` in Section 7
- [ ] Every BC in Section 4 appears in the BC Summary table and in Section 7
- [ ] Every published event listed in a BC's "Published Events" appears in at least one command's `// Domain Events:` comment
- [ ] Integration Events Summary covers all cross-BC event flows identified in Section 4
- [ ] Error Codes Glossary contains every error code used in any command or read

### R2 — Language

- [ ] No non-English word appears in: field names, type names, event names, command names, enum values, error codes, table cell content, inline TypeScript comments, ASCII diagram labels
- [ ] All prose (behavior descriptions, aggregate descriptions, section intros) is written in English
- [ ] Search the file for obvious non-English patterns (common Portuguese words: `erro`, `cliente`, `assinatura`, `cobrança`, `pagamento`, `usuário`, `criado`, `atualizado` — flag any found inside code blocks or identifiers)

### R3 — Type Safety

- [ ] `MonetaryAmount` is defined exactly once (in section 7.0) with `amountCents: number` and `currency: CurrencyCode` — verify no other definition exists with `amount_cents` or any other casing
- [ ] `ExchangeRate` is defined exactly once (in section 7.0) with camelCase fields and `capturedAt: string` — not `Date`
- [ ] Every type defined in section 7.0 is used by name in Reads/Commands — no duplicate anonymous inline shapes that replicate an existing named type
- [ ] Every status enum value is spelled identically wherever it appears: in the enum definition, in behavior descriptions, in error codes, and in domain event payloads — flag any mismatch (e.g., `"CANCELED"` vs `"CANCELLED"`)
- [ ] Every multi-variant type that has mutually exclusive fields uses a discriminated union — not an optional field bag
- [ ] Enum values referenced in prose and behavior descriptions use the same casing as in code (e.g., `"DRAFT"` not `"draft"`, `"UNITS"` not `"units"`)
- [ ] Cross-context event payloads do not use `value: number` for fields that can actually be `MonetaryAmount` or `MonetaryAmount[]` depending on a discriminator

### R4 — Internal Consistency

- [ ] Every command in Section 3's table has the same name in the Event Storming (Section 2) and in Section 7
- [ ] Every domain event in Section 3's table matches the event name used in the command's `// Domain Events:` comment in Section 7
- [ ] BC screen and command ranges in the BC Summary table are accurate (count them)
- [ ] Every aggregate mentioned in Section 4 has its key fields described — no aggregate is listed without any field description
- [ ] Override inputs: if a field is required when its parent object is provided, it must be non-optional consistently across all commands that share the same pattern (e.g., `unitPriceCents` required at creation if also required at update)

### R5 — Structural & Formatting

- [ ] All TypeScript code blocks use the `typescript` language fence — no unlabeled fences
- [ ] All ID fields (`customerId`, `subscriptionId`, etc.) are typed as `string` — not `number`
- [ ] All date fields are typed as `string` — not `Date`
- [ ] All monetary fields use `amountCents: number` — not `amount: number`, `price: number`, or any float
- [ ] `type` keyword used for `Input`, `Output`, `Errors` — not `interface`
- [ ] `Output = void` commands include the HTTP status comment (`// 201 Created` or `// 204 No Content`)
- [ ] Error codes that appear in multiple commands are spelled identically everywhere
- [ ] Section 7 subsections follow the BC order defined in Section 4

---

## Document Structure (7 Sections + Design Decisions)

### Section 1 — High-Level Requirements

```markdown
## 1. High-Level Requirements

### 1.1 Problem Overview
[1 paragraph describing what the system does and why]

### 1.2 Functional Requirements
[Grouped by domain area with bold headers. Each requirement is a bullet point.
 Use domain terms. Reference entities by name.]

### 1.3 Non-Functional Requirements
[Bullets: scale, availability, consistency, security, extensibility, auditability]
```

### Section 2 — Event Storming

```markdown
## 2. Brainstorming — Event Storming

### 2.1 Legend
[Standard table: 🟧 Domain Event, 🟦 Command, 🟨 Aggregate, 🟪 Policy, 🟩 Read Model, 🟥 Hot Spot, 👤 Actor]

### 2.2 Main Flow — Domain Events Timeline
[ASCII event storming with emoji markers, organized in swimlanes by domain area]
[Format:]
═══════════════════════════════════════════════════════════════════
 DOMAIN AREA NAME (CAPS)
═══════════════════════════════════════════════════════════════════

👤 Actor
  🟦 CommandName
    🟨 AggregateName
      🟧 DomainEventName
        🟪 Policy: description
        🟥 Hot Spot: concern

### 2.3 Pivotal Events
[Numbered list of 4–6 events that mark phase transitions in the business lifecycle]
```

### Section 3 — Screens & Commands Definition

```markdown
## 3. Screens & Commands Definition

### 3.1 Screens (Read Models)
[Table: # | Screen | Description | Data Displayed]
[Each screen: T01, T02, ... Tnn]

### 3.2 Commands
[Table: # | Command | Actor | Aggregate | Resulting Event | Rules]
[Each command: C01, C02, ... Cnn]
```

### Section 4 — Bounded Context Separation

```markdown
## 4. Bounded Context Separation

[1 sentence intro explaining the methodology]

### BCn: Context Name

**Responsibility:** [What this context owns — 1 sentence]
**Ubiquitous Language:** [Comma-separated domain terms]

**Aggregates:**
- `AggregateName` — [description with key fields and TypeScript-style types inline]

**Screens:** T01, T02, ...
**Commands:** C01–C05, ...

**Published Events:**
- `EventName`, `AnotherEvent`

**Command Execution Behavior:**
- **C01 – CommandName:** [Detailed description of what happens, validations, side effects, events published]
```

**Classify each BC** as Core, Support, or Generic.

### Section 5 — Context Mapping

```markdown
## 5. Context Mapping

### 5.1 Context Map
[Large ASCII box diagram showing all BCs, their relationships (OHS/PL, Customer/Supplier, ACL, Conformist), and external systems]

### 5.2 Context Relationships
[Table: Upstream (U) | Downstream (D) | Relationship | Description]

### 5.3 Data Flow Between Contexts (Summary)
[ASCII flow diagram: BC1 → BC2 → ... with arrow annotations]
```

### Design Decisions Section (if applicable)

For any cross-cutting concern that affects multiple BCs (multi-currency, multi-tenancy, RBAC, etc.), add a dedicated section:

```markdown
## Design Decisions — [Topic]

### Principle: "[short statement]"
[Explanation of the design principle]

### [Topic] Flow Through the System
[ASCII flow showing how the concern flows across BCs]

### [Topic] Value Objects (Published Language)
[TypeScript interface definitions for shared types]

### Key Rules
[Numbered list of invariants and design rules]
```

### Bounded Contexts Summary Table

```markdown
## Bounded Contexts Summary

| Bounded Context | Screens | Commands | Core/Support/Generic |
|---|---|---|---|
| BC1: Name | T01–T05 | C01–C11 | **Core** |
| BC2: Name | T06, T07 | C12, C13 | Support |
```

### Section 7 — Technical Specification (API)

This is the largest section (typically 50–60% of the document). Every screen and command gets a full TypeScript type definition.

```markdown
## 7. Technical Specification — Reads & Commands

> **Conventions:**
> - Optional fields marked with `?`
> - All IDs are `string` (UUID v7)
> - Dates in ISO 8601
> - Monetary values always in cents (`amountCents`) — no floating point
> - Error codes in UPPERCASE represent domain invariants and policies
```

#### 7.0 Global Enums & Shared Types

Define ALL enums and shared value objects used across the API:

```typescript
type StatusEnum = "VALUE_A" | "VALUE_B" | "VALUE_C";

type SharedValueObject = {
  fieldA: string;
  fieldB: number;
};
```

#### 7.1–7.N — One subsection per BC

For each BC, list all its Reads and Commands.

**Read format:**

```markdown
#### Read — ScreenName (Tnn)

\`\`\`typescript
type Input = {
  search?: string;
  page: number;
  limit: number;
};

type Output = {
  total: number;
  items: {
    id: string;
    name: string;
    // ... all fields the screen displays
  }[];
};

type Errors =
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";
\`\`\`
```

**Command format:**

```markdown
#### Command — CommandName (Cnn)

\`\`\`typescript
type Input = {
  fieldName: string;
  optionalField?: number;
  nestedObject: {
    subField: boolean;
  };
};

type Output = void; // 201 Created

type Errors =
  | "SPECIFIC_DOMAIN_ERROR"
  | "ANOTHER_ERROR"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "SESSION_EXPIRED";

// Domain Events:
//   EventName { field1, field2 }
\`\`\`
```

#### 7.N+1 — Integration Events Summary

ASCII diagram showing cross-context event flows:

```typescript
// ┌─────────────┐     EventName      ┌──────────────┐
// │ BC1: Source  │ ──────────────────►│ BC2: Target  │
// └─────────────┘                    └──────────────┘
```

#### 7.N+2 — Error Codes Glossary

All error codes organized by BC as TypeScript union types:

```typescript
type GlobalErrors = "UNAUTHORIZED" | "SESSION_EXPIRED" | "VALIDATION_ERROR";

type BC1Errors =
  | "SPECIFIC_ERROR_1"
  | "SPECIFIC_ERROR_2";
```

---

## Formatting Rules

### Language

**The entire document must be written in English — no exceptions.**

This includes:
- All prose (section descriptions, behavior explanations, aggregate descriptions, command behavior)
- All code-level identifiers (field names, event names, command names, enum values, error codes, type names)
- All inline comments inside TypeScript blocks
- All table content (screen names, descriptions, rules)
- All ASCII diagrams (labels, annotations, relationship descriptions)

**Code-level identifier conventions:**
- Field names: `camelCase` — `customerId`, `billingCurrency`, `amountCents`
- Event names: `PascalCase` past participle — `SubscriptionCreated`, `PaymentFailed`
- Error codes: `SCREAMING_SNAKE_CASE` — `METRIC_NOT_FOUND`, `INSUFFICIENT_BALANCE`
- Enum values: `SCREAMING_SNAKE_CASE` — `"ACTIVE"`, `"SUSPENDED"`, `"DRAFT"`
- Type names: `PascalCase` — `MonetaryAmount`, `PriceVariants`

**Type safety rules (learned from real-world modeling):**
- Define ALL shared types in section 7.0 as the single source of truth — never redefine them locally in BC sections
- All BC sections must reference the canonical types from 7.0, not redefine them inline
- `MonetaryAmount` shape: always `{ amountCents: number; currency: CurrencyCode }` — never `amount_cents`, never raw floats
- `ExchangeRate` shape: always `{ fromCurrency, toCurrency, rate, source, capturedAt: string }` — `capturedAt` is ISO string, not `Date`
- Status enums must be consistent across the entire document: if the enum says `"CANCELLED"`, events, error codes, and behavior descriptions must all use `"CANCELLED"` — never mix `"CANCELED"` vs `"CANCELLED"`
- Discriminated union types are preferred over optional field bags when the shape varies by variant:
  ```typescript
  // ✅ Correct — discriminated union
  type AggregationResult =
    | { resultType: "UNITS";          value: number }
    | { resultType: "MONETARY";       amount: MonetaryAmount }
    | { resultType: "MONETARY_MULTI"; amounts: MonetaryAmount[] };

  // ❌ Wrong — optional field bag loses type safety
  type AggregationResult = {
    resultType: "UNITS" | "MONETARY" | "MONETARY_MULTI";
    value?: number;
    amount?: MonetaryAmount;
    amounts?: MonetaryAmount[];
  };
  ```
- Enum values in prose, behavior descriptions, and domain events must use the same casing as in code: `"UNITS"` not `"units"`, `"DRAFT"` not `"draft"`
- Named types in 7.0 must be used in Reads/Commands instead of anonymous inline shapes (e.g., `items: InvoiceLineItem[]` not a repeated anonymous object)
- Cross-context event payloads must use types that are valid at the boundary — avoid `newValue: number` when the actual shape is a discriminated union

### TypeScript Conventions

- `type` keyword (not `interface`) for Input/Output/Errors
- Optional fields: `fieldName?: Type`
- All IDs: `string` (UUID v7)
- Dates: `string` (ISO 8601)
- Monetary values: `amountCents: number` — never floats
- Pagination: `{ page: number; limit: number }` input, `{ total: number; items: T[] }` output
- Void commands: `type Output = void; // 201 Created` or `// 204 No Content`
- Error union: `type Errors = | "CODE_1" | "CODE_2";`
- Domain events as TypeScript comments: `// Domain Events: EventName { field1, field2 }`
- HTTP status in comments where relevant

### Markdown Conventions

- Emoji markers in Event Storming: 🟧🟦🟨🟪🟩🟥👤
- ASCII box diagrams for Context Map (no Mermaid — pure ASCII)
- Tables for Screens, Commands, Context Relationships, BC Summary
- Code fences: always `typescript` language
- Section numbering: `## 1.`, `### 1.1`, `#### Command — Name (Cnn)`
- Screen IDs: `T01`, `T02`, ... Command IDs: `C01`, `C02`, ...

---

## Output

Generate the document as a single `.md` file. For large systems (3000+ lines), build it in 3–5 parts and concatenate.

Final file goes to `/mnt/user-data/outputs/` with a descriptive name like `ddd-modeling-[system-name].md`.

---

## Checklist Before Delivering

> This checklist is the final gate before delivering the file to the user.
> All items must pass. Items R1–R5 map directly to the Review Checklist in Phase 3 —
> run Phase 3 first, then confirm here.

- [ ] Phase 3 self-review was executed and all R1–R5 checks passed
- [ ] All 7 sections are present and non-empty
- [ ] Every screen (Tnn) has a Read in Section 7 with Input/Output/Errors
- [ ] Every command (Cnn) has a Command in Section 7 with Input/Output/Errors + Domain Events
- [ ] **Entire document is in English** — prose, tables, comments, diagrams, behavior descriptions
- [ ] Global enums cover all values used across the document
- [ ] Error Codes Glossary contains every error code from every command and read
- [ ] Integration Events Summary covers all cross-BC event flows
- [ ] Context Map ASCII diagram includes all BCs and external systems
- [ ] BC Summary table command/screen counts match actual totals
- [ ] **Type safety (R3):**
  - [ ] `MonetaryAmount` defined once in 7.0 with `amountCents` — no `amount_cents` anywhere
  - [ ] `ExchangeRate` defined once in 7.0 with `capturedAt: string` — no `captured_at` or `Date`
  - [ ] Named types from 7.0 are referenced in Reads/Commands — no anonymous inline duplicates
  - [ ] Status enum values spelled identically across definition, events, errors, and prose
  - [ ] Multi-variant types use discriminated unions, not optional field bags
  - [ ] Enum values in prose and descriptions match code casing (`"UNITS"` not `"units"`)
  - [ ] Cross-context event payloads typed correctly for all discriminated union variants
- [ ] **Internal consistency (R4):**
  - [ ] Command names consistent across Sections 2, 3, and 7
  - [ ] Domain event names consistent across Section 3 table and Section 7 `// Domain Events:` comments
  - [ ] Override input optionality consistent across all commands that share the same pattern
