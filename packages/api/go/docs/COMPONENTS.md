# UI Components Architecture

This document explains the principles and decision frameworks for creating primitive UI components. For implementation details and code examples, use the `/primitive` skill.

## Core Principles

Primitive components are the building blocks of the UI. They must be:

| Principle | Why |
|-----------|-----|
| **Stateless** | State belongs in the application layer, not the design system |
| **Composable** | Complex UIs are built by combining simple primitives |
| **Accessible** | ARIA compliance and keyboard navigation are non-negotiable |
| **Flexible** | Accept native HTML props + custom variants |
| **Stylable** | Support `className` override with proper merge |

## Technology Stack

| Technology | Purpose |
|------------|---------|
| **Base UI** | Accessible, unstyled primitives |
| **CVA** | Variant management |
| **Tailwind CSS** | Utility-first styling |
| **clsx** | Conditional class merging |

## Folder Structure

```
app/src/components/ui/
├── index.ts           # Barrel export
└── [component].tsx    # Individual components (kebab-case)
```

## Key Decisions

### When to Use `forwardRef`

**USE when**:
- Component will be used with Base UI's `render` prop
- Component needs to receive refs from parent components
- Component wraps another component that requires refs

**DON'T NEED when**:
- Component is used directly (no `render` prop)
- Component is a simple wrapper with no ref requirements

### When to Use `clsx` vs `cn`

| Use `clsx` | Use `cn` |
|------------|----------|
| Conditional classes based on state/props | Merging with consumer `className` |
| Application-specific components | Primitive components |
| No Tailwind class conflicts | Tailwind conflicts possible (`p-4` + `p-2`) |

```typescript
// clsx for conditionals
<Card className={clsx({
  'opacity-70 bg-gray-50': todo.completed,
})}>

// cn for primitives (merges consumer className)
<button className={cn(buttonVariants({ variant }), className)} />
```

### When to Use CVA

Use CVA when a component has:
- Multiple visual variants (primary, secondary, destructive)
- Size variations (sm, md, lg)
- Consistent patterns across the codebase

### Component Types

| Type | forwardRef | CVA | Example |
|------|------------|-----|---------|
| **Simple primitive** | Maybe | No | Card, CardHeader |
| **Interactive primitive** | Yes | Usually | Button, Input |
| **Complex primitive** | Yes | Usually | Dialog, AlertDialog |

## Composable API Pattern

Components should follow the shadcn pattern with named exports:

```typescript
// Usage
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

**Why named exports over `Card.Header`?**
- Better tree-shaking
- Clearer imports
- Standard React pattern

## Data Attributes

Use `data-slot` for component identification:

```typescript
<div data-slot="card" className={...} />
<div data-slot="card-header" className={...} />
```

**Why?** Enables debugging, testing, and styling hooks without coupling to implementation details.

## Accessibility Requirements

- Use semantic HTML or Base UI primitives
- Support keyboard navigation
- Include ARIA attributes when needed
- Maintain adequate color contrast
- Test with screen readers

## Performance Guidelines

- Avoid unnecessary re-renders
- Use CSS-only animations when possible
- Lazy load heavy components
- Animate only transform/opacity

## Implementation Skills

| Skill | Use Case |
|-------|----------|
| `/primitive` | Create Button, Input, Card, Dialog, etc. |
| `/component` | Create feature-specific components |

## Storybook

Stories should be in `stories/` folders adjacent to components:

```
app/src/components/ui/
├── button.tsx
└── ...
app/src/components/ui/stories/
├── button.stories.tsx
└── ...
```

For Storybook patterns and configuration, see the Storybook section in the `/primitive` skill.

## References

- `app/src/components/ui/` - Existing primitives
- `docs/PROTOTYPING.md` - UI implementation process
- Base UI: https://base-ui.com/
- CVA: https://cva.style/
