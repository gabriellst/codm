---
name: design-system
description: Generate a SYSTEM.md design system from a visual reference (screenshot, HTML/CSS, or description). Use when starting a new project's UI or changing the design direction. Use this skill whenever defining or updating the project's design tokens, color palette, typography, and component styling conventions.
---

# Generate Design System (SYSTEM.md)

Generates a complete `SYSTEM.md` design system document and updates `packages/app/react/src/index.css` CSS variables from a visual reference.

## Why This Exists

Every frontend component depends on a consistent design system. Without `SYSTEM.md`, components drift into inconsistent spacing, colors, and patterns. This skill establishes the single source of truth that all primitives and components reference.

## When to Use

- Starting a new project's UI from a design reference
- Changing the project's visual direction (new brand, redesign)
- No `SYSTEM.md` exists and `/component` or `/primitive` skills require it

## When NOT to Use

- `SYSTEM.md` already exists and just needs small tweaks (edit directly)
- Adding a single component (use `/primitive` or `/component`)
- Backend-only work

## Prerequisites

- A design reference: screenshot, HTML/CSS code, Figma export, or detailed description
- Understanding of the project's domain and target audience

## Key Principles

1. **Opinionated, Not Exhaustive**: SYSTEM.md captures design *intent* and *decisions*, not every CSS value
2. **OKLCH Colors**: All colors use `oklch()` for perceptual uniformity and easy dark mode
3. **CSS Variables Bridge**: Every palette color maps to a CSS variable in `packages/app/react/src/index.css`
4. **Tailwind-First**: Document Tailwind utility usage, not raw CSS
5. **Dark Mode Parity**: Every light token must have a dark counterpart

## Process

### Step 1: Analyze the Reference

Examine the provided design reference thoroughly:

- **Color extraction**: Identify primary, secondary, accent, neutral, and semantic colors
- **Typography**: Font family, weights used, size scale, line heights
- **Spacing patterns**: Gaps, paddings, margins — identify the base unit
- **Border radius**: Rounding patterns across buttons, cards, inputs
- **Depth system**: Shadows, borders, elevation hierarchy
- **Interaction patterns**: Hover, focus, active, selected states
- **Component catalog**: Cards, buttons, badges, inputs, avatars, etc.

### Step 2: Define Intent and Direction

Before writing tokens, establish the *why*:

```markdown
## Intent

**Who:** [Target users and their context]

**What they accomplish:** [Key tasks and workflows]

**How it should feel:** [Emotional quality of the interface]

---

## Direction

**Domain concepts:** [Core domain vocabulary]

**Color world:** [Why this palette — cultural, psychological, domain associations]

**Signature:** [The distinctive visual pattern that makes this system recognizable]
```

### Step 3: Extract Design Tokens

Map every visual decision to the SYSTEM.md structure:

```markdown
## Palette

### Foundation
- **Background:** [value] — [rationale]
- **Route Background:** [value] — [rationale]
- **Foreground:** [value] — [rationale]

### Accent
- **Primary:** [value] — [rationale]
- **Primary (dark):** [value] — [rationale]
- **Accent:** [value] — [rationale]

### Semantic
- **Destructive:** [value] — [rationale]
- **Muted:** [value] — [rationale]
- **Muted Foreground:** [value] — [rationale]

### Charts ([palette description])
chart-1 through chart-5 gradient

---

## Typography

**Family:** [Font] — [why this font]
**Base size:** [value] — [rationale]
**Weights:** [list with usage]
**Scale:** [text-xs through text-lg with usage]

---

## Spacing

**Base unit:** [value]
Multiplier system (1-5+ units with usage)
Card padding, component gaps

---

## Depth

**Philosophy:** [shadow vs border approach]
Borders, shadows, elevation pattern

---

## Radius

**Base:** [value]
Scale from radius-sm to radius-2xl with usage

---

## Layout

**Container:** [max-width, padding pattern]
**Grid:** [column system, gap pattern]
**Responsive breakpoints:** [if applicable]

---

## Interaction

**Timing:** [duration] with [easing]
Hover, active/selected, focus patterns

---

## Icons

**Library:** [icon library used]
**Default size:** [value]
**Color:** [how icons inherit color]
**Stroke width:** [if applicable]

---

## Components

Brief reference for each primitive:
Cards, Buttons, Status Badges, Avatars, Inputs, etc.

---

## Dark Mode

Token adjustments for dark theme

---

## Patterns to Preserve

Numbered list of distinctive design decisions to maintain
```

### Step 4: Write SYSTEM.md

Create `SYSTEM.md` at the project root following the structure above. Rules:

- Every color value must be in `oklch()` format
- Every token must include a rationale (the `—` explanation)
- Component examples use Tailwind classes, not raw CSS
- Keep it concise — this is a reference, not a tutorial

### Step 5: Update CSS Variables

Update `packages/app/react/src/index.css` to match the palette. The CSS file must include:

1. **`:root` block** with all light mode variables
2. **`.dark` block** with all dark mode variables
3. **`@theme inline` block** mapping CSS vars to Tailwind colors
4. **`@theme` block** for spacing base unit and font

Structure:

```css
@theme {
  --spacing: [base-unit];
}

:root {
  --route-background: oklch(...);
  --background: oklch(...);
  --foreground: oklch(...);
  /* ...all tokens */
  --radius: [base-radius];
}

.dark {
  /* Dark mode overrides */
}

@theme inline {
  --font-sans: "[Font]", sans-serif;
  --color-route-background: var(--route-background);
  /* ...all color mappings */
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --radius-2xl: calc(var(--radius) + 8px);
}
```

### Step 6: Validate

- Every palette color in SYSTEM.md has a corresponding CSS variable
- Light and dark mode tokens are complete (no missing dark counterparts)
- Radius scale is consistent with the base value
- Font family is imported (`@import "@fontsource-variable/[font]"`)
- Component examples use only documented tokens (no magic values)

## SYSTEM.md Structure Reference

The complete section order:

| # | Section | Purpose |
|---|---------|---------|
| 1 | Intent | Who, what, how it should feel |
| 2 | Direction | Domain, color world, signature |
| 3 | Palette | Foundation, accent, semantic, charts |
| 4 | Typography | Family, base size, weights, scale |
| 5 | Spacing | Base unit, multipliers, common patterns |
| 6 | Depth | Philosophy, borders, shadows, elevation |
| 7 | Radius | Base value, scale, usage |
| 8 | Layout | Container, grid, breakpoints |
| 9 | Interaction | Timing, hover, active, focus |
| 10 | Icons | Library, size, color |
| 11 | Components | Brief primitive reference |
| 12 | Dark Mode | Token adjustments |
| 13 | Patterns to Preserve | Distinctive decisions list |

## Critical Rules

### Colors Must Be OKLCH

```markdown
<!-- WRONG -->
- **Primary:** #0D9488

<!-- CORRECT -->
- **Primary:** Teal `oklch(0.5655 0.101 182.45)` — the signature medical teal
```

### Every Token Needs Rationale

```markdown
<!-- WRONG -->
- **Background:** oklch(1 0 0)

<!-- CORRECT -->
- **Background:** Pure white `oklch(1 0 0)` — clinical cleanliness
```

### Tailwind Classes in Component Examples

```markdown
<!-- WRONG -->
Cards use `box-shadow: 0 1px 2px rgba(0,0,0,0.05); border-radius: 8px;`

<!-- CORRECT -->
Cards: `rounded-xl ring-1 ring-border/50 shadow-sm`
```

### No Orphaned Variables

Every CSS variable in `index.css` must appear in SYSTEM.md and vice versa. If SYSTEM.md defines a color, it must exist as `--color-name` in CSS.

## Checklist

- [ ] Design reference analyzed (colors, typography, spacing, components)
- [ ] Intent section defines who, what, how it feels
- [ ] Direction section explains color world and signature
- [ ] All palette colors in OKLCH with rationale
- [ ] Typography documents family, weights, and scale
- [ ] Spacing base unit defined with multiplier system
- [ ] Depth philosophy stated (shadows vs borders)
- [ ] Radius base and scale documented
- [ ] Layout patterns documented (container, grid, breakpoints)
- [ ] Interaction timing and patterns defined
- [ ] Icons library and defaults specified
- [ ] Component brief reference included
- [ ] Dark mode tokens complete
- [ ] Patterns to Preserve captures distinctive decisions
- [ ] `packages/app/react/src/index.css` updated with all CSS variables
- [ ] Light and dark mode CSS variables are complete pairs
- [ ] `@theme inline` maps all colors to Tailwind
- [ ] Font imported in CSS

## References

- `SYSTEM.md` - Current design system (project root, when present)
- `packages/app/react/src/index.css` - CSS variables and theme
- `/prototype` skill — Prototyping workflow
- `docs/COMPONENTS.md` - Component architecture
- `.claude/skills/primitive/SKILL.md` - Primitive component creation
- `.claude/skills/component/SKILL.md` - Component hierarchy
