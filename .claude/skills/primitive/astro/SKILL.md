---
name: primitive (astro)
description: Create a primitive UI component for the astro landing/blog app — design-system-grade, reusable across pages. Lives in packages/app/astro/src/components/. Default to a stateless `.astro` file; reach for a `.tsx` React island only when the primitive needs interactivity (toggle, dropdown, input).
---

> **Parent**: [`../SKILL.md`](../SKILL.md) — cross-platform mental model.
> **BEFORE IMPLEMENTING**: Open [`./registry.yaml`](./registry.yaml) and read `patterns` + `bad_practices`.

# Create Astro Primitive

An astro primitive is a small, reusable visual unit shared across landing pages and blog posts: `Button.astro`, `Card.astro`, `Pill.astro`, `Avatar.astro`, `Section.astro`. They have no state, no data fetching, and no business knowledge — only props in, HTML out.

## Static vs island

| Need                                             | File extension              | Notes                                                              |
| ------------------------------------------------ | --------------------------- | ------------------------------------------------------------------ |
| No interactivity (Button as `<a>`, Card, Badge)  | `Button.astro`              | Stateless. Zero JavaScript. **Default.**                            |
| CSS-only interaction (hover, focus, `<details>`) | `Disclosure.astro`          | Still stateless. Use semantic HTML + CSS.                           |
| JS-required interaction (toggle controlled by state, modal trigger, dismissable banner) | `ThemeToggle.tsx`           | React island. Mounted from `.astro` with `client:visible` or smaller. |

If you're tempted to make every primitive a React island, stop. The astro workspace's value is shipping HTML, not React.

## Variant approach

Astro primitives use **class-variance-authority (CVA)** the same way the react primitives do. Author the CVA recipe inside the `.astro` file's frontmatter and emit `class={variants({ variant, size })}` on the rendered element.

```astro
---
// src/components/Button.astro
import { cva, type VariantProps } from 'class-variance-authority';

const button = cva(
  'inline-flex items-center justify-center rounded-md font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        ghost: 'bg-transparent text-foreground hover:bg-secondary',
        link: 'underline-offset-4 hover:underline text-primary',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-10 px-4 text-base',
        lg: 'h-12 px-6 text-lg',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type Props = VariantProps<typeof button> & {
  href?: string;
  ariaLabel?: string;
};

const { variant, size, href, ariaLabel, ...rest } = Astro.props;
const Tag = href ? 'a' : 'button';
---

<Tag class={button({ variant, size })} href={href} aria-label={ariaLabel} {...rest}>
  <slot />
</Tag>
```

## File & folder convention

- One primitive per file. `packages/app/astro/src/components/Button.astro`.
- React islands as siblings: `packages/app/astro/src/components/ThemeToggle.tsx`.
- No subcomponent `.astro` files that aren't reused — fold those back into the parent.
- PascalCase filenames.

## Tokens & styling

- All colors come from `@codm/app-ui/tokens.css` via CSS variables.
- Tailwind utility classes mapped to those variables (`bg-primary`, `text-foreground`, etc.) — same convention as the react app.
- No hardcoded hex/rgb anywhere.
- If a token doesn't exist, add it to `tokens.css`, do not fork inline.

## Accessibility

- Buttons that render `<a>` for navigation should not have `type="button"`.
- Icon-only primitives accept `ariaLabel` as a required prop.
- Forwarded slots use Astro's `<slot />` so consumers can compose freely.

## When to make it a React island instead

Use a `.tsx` island when **any** of these are true:

- Controlled state (`useState`) is required.
- It reads from `window` / `document` (theme, scroll, viewport).
- It listens to events (`onClick` with state changes, `keydown` handlers).
- It mounts a portal or a popover.

Otherwise, keep it static.

## Shared rules with the parent

- Stateless. No data fetching. No domain types.
- One primitive per family — one `Button`, not `PrimaryButton` + `GhostButton`.
- Variant-driven via CVA.
- Tokens via shared styles workspace.

## Checklist

- [ ] Is the primitive really stateless? If not, is the island truly necessary?
- [ ] Uses CVA + `tokens.css`-mapped Tailwind utilities.
- [ ] Single file per primitive; PascalCase name.
- [ ] Forwards `<slot />` for content.
- [ ] Accessibility props (`aria-label`) where icon-only.
- [ ] No imports from `@codm/app-react`.

## References

- `packages/app/astro/src/components/` — peer primitives.
- `packages/app/ui/styles/tokens.css` — design tokens.
- `../react/SKILL.md` — Base UI version for reference (the CVA pattern is identical).
