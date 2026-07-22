---
name: primitive
description: Create a primitive UI component (design system entry point). Stateless, reusable, variant-driven via CVA. Routes through a react / expo / astro child based on the working directory.
---

# Create Primitive (parent)

A **primitive** is a small, reusable visual unit shared across routes — `Button`, `Card`, `Input`, `Dialog`, `Pill`. It is stateless, has no business knowledge, and exposes variants via CVA.

## Platform routing (READ FIRST)

| Working file path                            | Use                                                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `packages/app/react/**`                      | [`./react/SKILL.md`](./react/SKILL.md) + [`./react/registry.yaml`](./react/registry.yaml) — Base UI + Tailwind + HTML        |
| `packages/app/expo/**`                       | [`./expo/SKILL.md`](./expo/SKILL.md) + [`./expo/registry.yaml`](./expo/registry.yaml) — React Native + Uniwind                |
| `packages/app/astro/**/*.astro` or `*.tsx`   | [`./astro/SKILL.md`](./astro/SKILL.md) + [`./astro/registry.yaml`](./astro/registry.yaml) — Astro components + React islands |

If the path is **ambiguous**, ask the user once and don't proceed until they answer.

## What "primitive" means (cross-platform)

A primitive is:

1. **Stateless** — no internal data fetching, no business logic, no domain types. Controlled via props.
2. **Reusable** — it has no knowledge of routes, queries, or features. The same primitive ships on every screen that needs it.
3. **Variant-driven** — one primitive per family (one `Button`, not `ChromeButton` + `GhostButton`). Variations live in `variant` / `size` props.
4. **The design system entry point** — primitives are the only files that read raw design tokens. Everything else consumes the primitive.

## Shared principles (apply on ALL platforms)

1. **CVA for variants.** Declare `variant` and `size` once via `class-variance-authority` and compose with the `cn()` helper so consumer `className` overrides win.
2. **One primitive per family.** A button family is **one** `Button` with `variant: 'chrome' | 'ghost' | 'destructive' | 'link' | ...`. Same for `Card`, `Sheet`/`Dialog`, `Input`, `Pill`.
3. **Named exports, no dot-notation.** Subcomponents export individually (`export { Card, CardHeader, CardBody }`) — never `Card.Header`.
4. **PascalCase** for component names and (on expo / astro) file names.
5. **Tokens come from the design system.** Colors / spacing / radius / type scales come from `@template/app-styles/tokens.css` (react + astro) or `packages/app/expo/lib/tokens.ts` (expo). Never hardcode hex values or arbitrary pixel sizes.
6. **`cn()` everywhere a className is composed** — react/expo import from `@/lib/utils`; astro authors the same helper inline or imports from a local `lib/utils.ts`.

## When to use this skill

- Building a reusable visual unit that doesn't own data or business logic.
- Wrapping a Base UI / RN / Astro element with project styling.

## When NOT to use this skill

- Route-scoped feature component → `/component` (in its react / expo / astro variant).
- Page route → `/route`.
- Form input with state → `/form` (the form composes primitives; this skill builds the primitives).

## Checklist (parent-level, before reading the child)

- [ ] Platform identified from working directory (or asked the user).
- [ ] Reading only the matching child SKILL + registry.
- [ ] Stateless, variant-driven, named exports.
- [ ] Tokens via the shared sheet / lib (no inline hex).
