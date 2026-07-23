---
name: form
description: Create forms with TanStack Form and SDK validation. Routes by working-directory to the matching child — react (Base UI + Maskito) or expo (native Input/NumField/KeyboardAware). No astro variant — forms on landing pages should be implemented as React islands and follow the react child.
---

# Create Form (parent)

A **form** is the interactive surface between the user and an SDK mutation. It owns its field state via TanStack Form, validates against the same Zod schema the controller declared, and submits via an SDK mutation hook.

## Platform routing (READ FIRST)

| Working file path                       | Use                                                                                                                                                                   |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/app/react/**`                 | [`./react/SKILL.md`](./react/SKILL.md) + [`./react/registry.yaml`](./react/registry.yaml) — TanStack Form + Base UI primitives, Maskito masks, Dialog forms          |
| `packages/app/expo/**`                  | **DORMANT** — no expo workspace in this repo (`packages/app/expo` removed); no file resolves here. [`./expo/`](./expo/SKILL.md) kept as reference only, in case a mobile target returns.     |
| `packages/app/astro/**`                 | **No astro variant.** Forms are an interactive concern; landing pages aren't where they belong. If a form genuinely needs to live on a marketing page (newsletter signup, contact form), implement it as a React island inside `packages/app/astro/src/components/<Name>.tsx` and follow the `react/` child below — but most forms should live in `packages/app/react/`. |

If the path is **ambiguous**, ask the user once and don't proceed until they answer.

## Shared principles (apply on BOTH platforms)

1. **SDK schema is the single source of truth.** Forms validate against `xxxMutationRequestSchema` from `@codedm/client-typescript/<service>`. Never hand-roll validation rules.
2. **TanStack Form owns field state.** `useForm({ defaultValues, validators: { onChange: schema }, onSubmit })`. Never `useState` for form values.
3. **Submit via the SDK mutation hook.** On success: `toast` / `Toast` + `queryClient.invalidateQueries({ queryKey: ... })`. Never call `fetch` directly.
4. **Same Zod schema as the controller.** That's the contract the backend enforces too.
5. **Native primitives win.** Use the platform's input primitives (Base UI on react, RN inputs on expo). Wrap in a `FormField` to wire `id={field.name}` + label.

## When to use this skill

- Adding a create / edit / delete form for any backend mutation.
- Wrapping a single-step or multi-step wizard.
- Building a sheet that submits an SDK mutation (expo).

## When NOT to use this skill

- Building the dialog/sheet shell → `/component` (react) or `/sheet` (expo).
- Adding a read-only filter bar → `/component`.

## Checklist (parent-level)

- [ ] Platform identified from working directory (or asked the user).
- [ ] Reading only the matching child SKILL + registry.
- [ ] Form validates against the SDK request schema, no hand-rolled rules.
- [ ] Submit goes through the SDK mutation hook + invalidates the relevant query keys.
