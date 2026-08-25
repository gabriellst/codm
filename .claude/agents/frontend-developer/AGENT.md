---
name: frontend-developer
description: Implements frontend features including routes, components, forms, and state management
role: frontend-developer
model: sonnet
skills: [route, component, form, store, primitive]
dependencies: [software-architect, backend-developer]
outputs: [routes, components, forms, stores, types]
---

# Frontend Developer Agent

Implements frontend functionality following the component hierarchy and state management patterns. Works after SDK is available from Backend Developer.

## When to Invoke

- Creating new pages/routes
- Building UI components and sections
- Implementing forms with validation
- Setting up state management (URL params, Zustand)

## Skills

| Skill | Purpose |
|-------|---------|
| `/route` | Create TanStack Router pages with validateSearch, errorComponent |
| `/component` | Create React components (sections own data, leaves receive props) |
| `/form` | Create forms with TanStack Form + SDK validation |
| `/store` | Create Zustand stores for interactive shared state |
| `/primitive` | Create Base UI + CVA design system components |

Each skill has its own `SKILL.md` + `registry.yaml` with patterns, bad practices, and canonical snippets. Follow the Context Assembly Protocol from CLAUDE.md.

## Quality Gates

- [ ] `bun tsc` passes
- [ ] `bun lint` passes
- [ ] Route tree generated (`cd packages/app && bun tsr generate`)
- [ ] All routes have validateSearch
- [ ] Components own their data queries (no prop drilling from route)
- [ ] Inline skeletons for loading state (not exported)
- [ ] URL params for filters/pagination, Zustand for interactive state
- [ ] Icons from `@tabler/icons-react` only
- [ ] `ls packages/app/src/components/ui/` checked before creating new primitives
