# Frontend Architecture Guide

> **Principles, Structure, and Decision Framework for Frontend Development**

This document explains the **why** behind frontend patterns and architecture decisions. For **how** to implement, use the referenced skills.

---

## Component Hierarchy

### Structure

```
Page (index.tsx)
└── Macro Sections (-components/SectionName/)
    └── Specific Components (-components/SectionName/ComponentName/)
        └── Primitive Components (@/components/ui/*)
```

### Responsibilities

| Level | Location | Responsibilities | State Access |
|-------|----------|-----------------|--------------|
| **Page** | `routes/*/index.tsx` | Fetches data, manages URL state, exports types | `Route.useSearch()`, SDK hooks |
| **Macro Section** | `-components/SectionName/index.tsx` | Groups components, layout, skeleton variant | Props from page + Zustand |
| **Specific** | `-components/SectionName/ComponentName/index.tsx` | Feature-specific UI, can call mutations | Props from section |
| **Primitive** | `@/components/ui/*` | Reusable base components | Props only |

**Key Rules:**
- ✅ Pages fetch data (queries)
- ✅ Sections receive data via props
- ✅ Specific components can call mutations directly
- ❌ Sections/Specific components should NOT fetch data

**Implementation:** Use `/route` and `/component` skills.

---

## Folder Structure

```
app/src/
├── stores/                          # Global stores (shared between routes)
│   └── useThemeStore.ts
└── routes/
    └── [context]/
        ├── index.tsx                # Page + type exports
        ├── -components/
        │   ├── index.tsx            # Barrel export
        │   └── SectionName/
        │       ├── index.tsx        # Component + Skeleton
        │       ├── stories/
        │       │   └── SectionName.stories.tsx
        │       └── NestedComponent/
        │           ├── index.tsx
        │           └── stories/
        ├── -stores/                 # Route-specific stores
        │   └── use[Name]Store.ts
        └── -hooks/                  # Custom hooks (optional)
```

**Key Conventions:**
- Each component has its own folder with stories
- Barrel exports in `-components/index.tsx`

**Implementation:** Use `/route` skill for routes, `/component` skill for components.

---

## State Management Strategy

| State Type | Solution | When to Use |
|------------|----------|-------------|
| **Search/View** | URL Search Params | Listings, filters, pagination, sorting |
| **Interactive** | Zustand Stores | State that persists or is shared between components |
| **Local** | Props (value + setValue) | Simple components, controlled forms |

### Decision Framework

**Use Search Params when:**
- State should be shareable via URL
- State should persist on page refresh
- State affects data fetching (filters, pagination)

**Use Zustand Store when:**
- State is shared between multiple components (avoids prop drilling)
- State needs to persist but shouldn't be in URL
- Complex interactive state (selections, expanded items)

**Use Props when:**
- Simple component state
- Parent needs to control the value
- No sharing or persistence needed

**Implementation:** Use `/route` skill for URL state, `/store` skill for Zustand stores.

---

## SDK Usage Principles

### Import Pattern
```typescript
// ✅ CORRECT: Single import from SDK
import {
  useListExample,
  useCreateExample,
  listExampleQueryParamsSchema,
  createExampleMutationRequestSchema,
  CreateExampleMutationRequest,
  ExampleStatus,
  listExampleQueryKey,
} from '@monorepo/sdk/app'

// ❌ WRONG: Multiple imports or wrong path
// import { useListExample } from 'client/app'
```

### Type Inference
```typescript
// Types declared in route file
export type ExampleItem = ListExampleQueryResponse['items'][number]

// Components import from route
import type { ExampleItem } from '../..'
```

### Query Key Invalidation
```typescript
// ✅ CORRECT: Use SDK query key functions
await queryClient.invalidateQueries({ queryKey: listExampleQueryKey() })

// ❌ WRONG: Hardcoded strings
// await queryClient.invalidateQueries({ queryKey: ['listExample'] })
```

### Mutation Pattern
```typescript
// ✅ CORRECT: Direct properties (no params/body/query prefixes)
await createMutation({ data: formData })
await updateMutation({ id: entityId, data: formData })
await deleteMutation({ id: entityId })

// ❌ WRONG: Using prefixes
// await createMutation({ body: formData })
// await updateMutation({ params: { id }, body: data })
```

**Implementation:** All skills use these SDK patterns consistently.

---

## Forms

Forms use TanStack Form with SDK Zod schemas for synchronized validation.

**Key Principles:**
- Use SDK schemas in `validators.onSubmit`
- Use SDK types for `defaultValues`
- Use SDK enums for select options
- Validation is automatically synchronized with backend

**Implementation:** Use `/form` skill (includes input masking with Maskito).

---

## Session & Conditional Routing

### Session Access

BetterAuth provides session data (user + session with custom fields) via the `auth` client. The `useSession()` hook returns the full session object.

When a specific session field drives UI behavior (e.g., navigation, feature gating), create a **derived hook** that extracts just that field:

```typescript
// Derived hook for a specific session field
export const useSessionField = () => {
  const session = useSession()
  if (!session) return { value: undefined }
  return { value: session.session.customField }
}
```

### Session-Based UI Decisions

Custom session fields (added via BetterAuth `additionalFields`) are available on the frontend and can drive:

- **Navigation**: Different sidebar items per session mode/role
- **Feature gating**: Show/hide features based on session state
- **Routing**: Redirect or conditionally render based on session data

```typescript
const { value } = useSessionField()
const items = value === 'TYPE_A' ? TYPE_A_ITEMS : TYPE_B_ITEMS
```

### Sign-In Custom Parameters

The frontend can pass additional parameters at sign-in time via `fetchOptions.body`. The backend receives these in BetterAuth hooks (`after` on `/sign-in`) and can use them to set session fields or cookies:

```typescript
await auth.signIn.email({
  email, password,
  fetchOptions: { body: { customParam: 'value' } },
})
```

### Key Files

- `app/src/lib/auth.ts` — BetterAuth client setup
- `app/src/hooks/useSession.ts` — Base session hook
- `app/src/hooks/` — Derived session hooks (e.g., `useSessionMode.ts`)

---

## Implementation Skills

| Task | Skill | Description |
|------|-------|-------------|
| Create a route/page | `/route` | TanStack Router setup, search params, SDK integration |
| Create a component | `/component` | Component hierarchy, sections, skeletons, stories |
| Create a form | `/form` | TanStack Form, SDK validation, mutations |
| Create a store | `/store` | Zustand store patterns |
| Generate SDK | `/sdk` | Generate SDK from backend |

---

## Checklist Summary

### Route Creation
- [ ] Use `/route` skill
- [ ] Types declared inline using SDK response types
- [ ] `staticData: { breadcrumb: 'Label' }` defined (used by Header breadcrumbs via `useMatches()`)
- [ ] `validateSearch` with SDK schema
- [ ] `errorComponent` defined
- [ ] `createSearchParamsUpdater` utility for navigation
- [ ] Skeleton components for loading state
- [ ] `bun tsr generate` executed

### Component Creation
- [ ] Use `/component` skill
- [ ] Component folder with `index.tsx` + `stories/`
- [ ] Sections export both component and skeleton
- [ ] Types imported from route file
- [ ] SDK enums for type safety
- [ ] Added to barrel export

### State Management
- [ ] URL search params for filters/pagination
- [ ] Zustand stores for interactive/shared state
- [ ] Props for simple local state
- [ ] Never `useState` for URL values

---

## References

- `docs/COMPONENTS.md` - Primitive component documentation
- `docs/DEVELOPMENT.md` - General development guide
- `.claude/skills/` - Implementation skills
