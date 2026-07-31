---
name: primitive
description: Create a primitive UI component using Base UI and CVA. Use when building reusable design system components like Button, Card, Input. Use this skill for any low-level, reusable component that wraps Base UI primitives with project-specific styling and variants.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

# Create Primitive Component

Creates a reusable primitive component using Base UI, Tailwind CSS, and CVA (Class Variance Authority).

## Prerequisites

- Context must exist (use `/context` first) if creating context-specific components

## Key Principles [PRM-01, PRM-02, PRM-03, PRM-04, PRM-P01, PRM-P04]

1. **Stateless**: Primitives don't have internal state - use props for controlled behavior
2. **forwardRef for Composition**: Use `forwardRef` when component will be used with Base UI's `render` prop
3. **CVA for Variants**: Use `class-variance-authority` for variant management
4. **Named Exports**: Export subcomponents separately (shadcn pattern), not as `Card.Header`

## When to Create Primitives

Create primitives for:
- Reusable UI elements (Button, Input, Card, Modal)
- Design system components
- Components used across multiple routes

**Don't** create primitives for:
- Feature-specific components (use `-components/`)
- One-off UI elements

## Process

### Step 1: Check Existing Components

Check `packages/app/react/src/components/ui/` for existing primitives before creating new ones.

### Step 2: Search for Reference Implementations Online

**Before writing any code**, search for existing implementations of the component in popular libraries. This avoids reinventing the wheel and ensures best practices for accessibility, keyboard navigation, and API design.

**Search order (stop at the first good match):**

1. **shadcn/ui (primary reference)** — Use Context7 MCP to fetch the latest shadcn/ui docs for the component:
   ```
   1. resolve-library-id: "shadcn/ui"
   2. query-docs: "<component-name> component" (e.g. "dialog component", "tabs component")
   ```
   shadcn/ui components are the closest match to our project style (Tailwind + CVA + named exports + data-slot).

2. **Base UI docs** — If the component needs interactive behavior (dialogs, menus, tooltips, tabs, etc.), also check Base UI docs via Context7:
   ```
   1. resolve-library-id: "base-ui"
   2. query-docs: "<component-name>"
   ```

3. **Web search fallback** — If Context7 doesn't return useful results, use WebSearch:
   ```
   WebSearch: "shadcn ui <component-name> component site:ui.shadcn.com"
   ```
   Then fetch the result page with WebFetch to extract the implementation.

   > **Note:** Context7 MCP may occasionally be unavailable. If `resolve-library-id` or `query-docs` fails, fall back directly to WebSearch as described above.

4. **Other libraries** — For niche components not in shadcn/ui, search for:
   - Radix UI primitives
   - Base UI primitives
   - Ark UI
   - React Aria
   - Park UI (Ark + Tailwind)

**What to extract from reference implementations:**
- Component API (props, subcomponents, composition pattern)
- Accessibility attributes (aria-*, role, keyboard handlers)
- Animation/transition patterns
- Variant structure (if using CVA or similar)

**Adaptation rules — always adapt the reference to our stack:**
- Replace `tailwind-merge` / `clsx` with our `cn` from `@/lib/utils`
- Replace Radix primitives with Base UI equivalents when available
- Add `data-slot` attributes to every subcomponent
- Use `React.ComponentProps<'element'>` or Base UI `.Props` for typing
- Use `forwardRef` when the component will be used with Base UI's `render` prop
- Keep named exports (not `Component.SubComponent` pattern)
- Remove any `"use client"` directives (not needed in our setup)

### Step 3: Create Component File

```bash
touch packages/app/react/src/components/ui/<component-name>.tsx
```

### Step 4: Implement Component

**Simple Primitive (no variants):**

```typescript
// packages/app/react/src/components/ui/card.tsx
import * as React from 'react'
import { cn } from '@/lib/utils'

function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn('flex flex-col space-y-1.5 p-6', className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-title"
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-content"
      className={cn('p-6 pt-0', className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex items-center p-6 pt-0', className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardTitle, CardContent, CardFooter }
```

**Interactive Primitive with CVA (Button):**

```typescript
// packages/app/react/src/components/ui/button.tsx
import * as React from 'react'
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  // Base classes (always applied)
  'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-muted',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-muted',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

// Uses forwardRef because it will be used with render prop
const Button = React.forwardRef<
  HTMLButtonElement,
  ButtonPrimitive.Props & VariantProps<typeof buttonVariants>
>(function Button({ className, variant = 'default', size = 'default', ...props }, ref) {
  return (
    <ButtonPrimitive
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
})

export { Button, buttonVariants }
```

**Input with forwardRef:**

```typescript
// packages/app/react/src/components/ui/input.tsx
import * as React from 'react'
import { Input as InputPrimitive } from '@base-ui/react/input'
import { cn } from '@/lib/utils'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  function Input({ className, type, ...props }, ref) {
    return (
      <InputPrimitive
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          'flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      />
    )
  }
)

export { Input }
```

### Step 5: Export from Barrel (Optional)

```typescript
// packages/app/react/src/components/ui/index.ts
export { Button, buttonVariants } from './button'
export { Input } from './input'
export { Card, CardHeader, CardTitle, CardContent, CardFooter } from './card'
```

## Complex Components with Base UI [PRM-C01, PRM-P02, PRM-P03, PRM-P06]

### AlertDialog Example

```typescript
// packages/app/react/src/components/ui/alert-dialog.tsx
import * as React from 'react'
import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({ ...props }: AlertDialogPrimitive.Trigger.Props) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogContent({
  className,
  ...props
}: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Backdrop
        data-slot="alert-dialog-overlay"
        className="fixed inset-0 z-50 bg-black/50"
      />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-background p-6 shadow-lg',
          className
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn('text-lg font-semibold', className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="alert-dialog-action"
      className={cn(className)}
      {...props}
    />
  )
}

// Using render prop to compose with another component
function AlertDialogCancel({
  className,
  variant = 'outline',
  ...props
}: AlertDialogPrimitive.Close.Props &
  Pick<React.ComponentProps<typeof Button>, 'variant'>) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      className={cn(className)}
      render={<Button variant={variant} />}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
```

**Usage:**

```typescript
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

<AlertDialog>
  <AlertDialogTrigger render={<Button />}>
    Deletar
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogTitle>Confirmar exclusao?</AlertDialogTitle>
    <AlertDialogDescription>
      Esta acao nao pode ser desfeita.
    </AlertDialogDescription>
    <div className="flex justify-end gap-2 mt-4">
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction variant="destructive">Deletar</AlertDialogAction>
    </div>
  </AlertDialogContent>
</AlertDialog>
```

### Dialog Example

```typescript
// packages/app/react/src/components/ui/dialog.tsx
import * as React from 'react'
import { Dialog as BaseDialog } from '@base-ui/react/dialog'
import { cn } from '@/lib/utils'

const Dialog = BaseDialog.Root

const DialogTrigger = BaseDialog.Trigger

const DialogPortal = BaseDialog.Portal

const DialogBackdrop = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Backdrop>
>(({ className, ...props }, ref) => (
  <BaseDialog.Backdrop
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80',
      'data-open:animate-in data-closed:animate-out',
      'data-closed:fade-out-0 data-open:fade-in-0',
      className
    )}
    {...props}
  />
))
DialogBackdrop.displayName = 'DialogBackdrop'

const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof BaseDialog.Popup>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogBackdrop />
    <BaseDialog.Popup
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%]',
        'rounded-lg border bg-background p-6 shadow-lg',
        'data-open:animate-in data-closed:animate-out',
        'data-closed:fade-out-0 data-open:fade-in-0',
        'data-closed:zoom-out-95 data-open:zoom-in-95',
        className
      )}
      {...props}
    >
      {children}
    </BaseDialog.Popup>
  </DialogPortal>
))
DialogContent.displayName = 'DialogContent'

const DialogTitle = BaseDialog.Title

const DialogDescription = BaseDialog.Description

const DialogClose = BaseDialog.Close

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
}
```

## Common Patterns

### Badge with Variants

```typescript
// packages/app/react/src/components/ui/badge.tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { type HTMLAttributes } from 'react'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        secondary: 'bg-secondary text-secondary-foreground',
        destructive: 'bg-destructive text-destructive-foreground',
        outline: 'border text-foreground',
        success: 'bg-green-100 text-green-800',
        warning: 'bg-yellow-100 text-yellow-800',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
```

### Select (Base UI Compound)

```typescript
// packages/app/react/src/components/ui/select.tsx
import * as React from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { cn } from '@/lib/utils'

const Select = SelectPrimitive.Root

function SelectTrigger({
  className, size = 'default', children, ...props
}: SelectPrimitive.Trigger.Props & { size?: 'sm' | 'default' }) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn('border-input ...styles...', className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon render={<IconSelector className="size-4" />} />
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className, children, side = 'bottom', sideOffset = 4, align = 'center', ...props
}: SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, 'align' | 'side' | 'sideOffset'>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} className="isolate z-50">
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn('bg-popover data-open:animate-in data-closed:animate-out ...', className)}
          {...props}
        >
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )
}

function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
  return (
    <SelectPrimitive.Item data-slot="select-item" className={cn('...', className)} {...props}>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator render={<span className="..." />}>
        <IconCheck />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )
}

export { Select, SelectTrigger, SelectContent, SelectItem, SelectValue }
```

## Critical Rules [PRM-P05, bp-01, bp-02, bp-03]

### Always Use forwardRef for Composed Components

```typescript
// WRONG - Will break when used with render prop
function Button({ className, ...props }) {
  return <ButtonPrimitive {...props} />
}

// CORRECT - Allows composition with Base UI render prop
const Button = React.forwardRef<HTMLButtonElement, Props>(
  function Button({ className, ...props }, ref) {
    return <ButtonPrimitive ref={ref} {...props} />
  }
)
```

### Extend Native HTML Props

```typescript
// WRONG - Limited props
interface ButtonProps {
  onClick?: () => void
  children: React.ReactNode
}

// CORRECT - Extends native props
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive'
}
```

### Use cn for Class Merging [bp-05, bp-06 — as duas metades]

A superfície aberta tem uma metade de **declaração** (o tipo expõe `className`, bp-05) e uma de
**encanamento** (o valor do chamador chega na raiz, bp-06). As duas falham por caminhos diferentes:

```typescript
// WRONG - Overwrites consumer classes
<button className={buttonVariants({ variant })} />

// CORRECT - Merges with consumer classes
<button className={cn(buttonVariants({ variant }), className)} />
```

```tsx
// WRONG - clobber: o `{...props}` vem depois, então um className do chamador APAGA "toaster group"
function Toaster({ theme = 'system', ...props }: ToasterProps) {
  return <Sonner theme={theme} className="toaster group" {...props} />
}

// CORRECT - cn() mescla; o do chamador só se soma
function Toaster({ theme = 'system', className, ...props }: ToasterProps) {
  return <Sonner theme={theme} className={cn('toaster group', className)} {...props} />
}
```

**`cn()` não é obrigatório quando a raiz não tem classe própria.** Um wrapper que só repassa um bag
tipado pela raiz (`function Collapsible({ ...props }: ComponentProps<typeof CollapsiblePrimitive.Root>)`
→ `<CollapsiblePrimitive.Root {...props} />`) já entrega o `className` inteiro pelo spread — nada a
mesclar. A pergunta é sempre "o className do chamador chega na raiz?", nunca "tem `cn()` no arquivo?".

Gate principal desde 31/07: a regra eslint type-aware **`local/component-props`**
(`scripts/eslint-rules/component-props.ts`), que roda em `bun lint` e enxerga **283 componentes de
`components/ui/`** — o walker que ela substituiu só via `^export function X`, e 34 dos 40 arquivos de
primitivo exportam por barrel no rodapé, então `ui/` ficava de fora. Ela pergunta ao checker se a raiz
aceita `className` (é assim que `Popover.Root`/`Ctx.Provider` se isentam, sem whitelist) e exige
superfície + merge.

Rail C (`packages/app/react/tests/architecture/primitive-props.test.ts`) segue com as duas asserções que
são dela: nenhuma declaração `*Props` fechada (predicado sobre o TIPO, mais forte que o da regra) e
nenhuma raiz com clobber em componente module-private. A asserção de `className?: string` saiu de lá — é
`local/component-props` (`handTyped`) e cobre estritamente mais.

### Use data-slot for Identification

```typescript
// CORRECT - Enables debugging and testing
<div data-slot="card" className={...} />
<div data-slot="card-header" className={...} />
```

### Use rem Not px

```typescript
// WRONG - Breaks accessibility
className="text-[15px] p-[20px]"

// CORRECT - Use Tailwind utilities (rem-based)
className="text-base p-5"
```

## Storybook

### Folder Structure

```
packages/app/react/src/components/ui/
├── button.tsx
├── card.tsx
└── ...
packages/app/react/src/components/ui/-stories/
├── button.stories.tsx
├── card.stories.tsx
└── ...
```

### Basic Story (CSF 3.0)

```tsx
// -stories/button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react'
import { Button } from '../button'

const meta: Meta<typeof Button> = {
  title: 'UI/Button',
  component: Button,
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'link'],
    },
    size: {
      control: 'select',
      options: ['default', 'sm', 'lg', 'icon'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Button>

export const Default: Story = {
  args: {
    children: 'Button',
    variant: 'default',
  },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-4">
      <Button variant="default">Default</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
}

export const AllSizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
}
```

### Running Storybook

```bash
# Development
bun run storybook

# Build
bun run storybook:build
```

## Checklist

- [ ] All `when: always` patterns present (PRM-01 through PRM-04, PRM-P01, PRM-P04, PRM-P05 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (PRM-C01, PRM-C02 — check which apply)
- [ ] No `bad_practices` violations (bp-01 through bp-04 — verify against registry.yaml)
- [ ] Story created in `stories/` folder

## When NOT to Use

- An existing primitive already covers the use case (check `packages/app/react/src/components/ui/` first)
- The component is page-specific with no reuse potential (use `/component` instead)
- The component has complex business logic (use `/component` for sections)

## References

- `packages/app/react/src/components/ui/` — Existing primitives
- `docs/COMPONENTS.md` — Architecture principles (why)
- `docs/FRONTEND.md` — Frontend architecture reference
- `/prototype` skill — UI prototyping process
- Base UI: https://base-ui.com/
- CVA: https://cva.style/
- Tailwind CSS: https://tailwindcss.com/

## Gotchas — learned building GradientIcon / GradientIconBadge / StatCard

- **Gradient-on-icon is paint-property-specific.** Tinting via `color="url(#…)"` only works for
  **stroke** icons (Tabler, `stroke="currentColor"`). The custom icons in `ui/icons/` are **fill**-based
  (`fill="currentColor"`), and `color: url()` is invalid CSS, so `currentColor` silently falls back to a
  solid color — the gradient *looks* applied but isn't. A gradient-icon primitive needs a
  `paint: 'fill' | 'stroke'` switch and sets `style={{ fill | stroke: 'url(#id)' }}` (a CSS `fill`/`stroke`
  property overrides the path's `fill="currentColor"` attribute).
- **A missing `@theme inline` mapping fails *silently*.** A `text-X` / `bg-X` utility only exists if
  `--color-X` is mapped in the react `index.css` `@theme inline` block. Forget one (e.g. the time
  `--color-destructive-foreground` was unmapped) and the class is a no-op — **no error**, the element
  just keeps its inherited color. First place to check when "a token isn't applying."
- **`ui/icons/` has two shapes — "coin" vs "glyph".** e.g. `CurrencyMoneyIcon` is a filled *circle* with
  a `$` carved out; dropped into a circular badge it reads as a double-circle. Use the plain glyph
  (`MoneyIcon`) for badges. Check the icon's actual art/viewBox, not its name.
