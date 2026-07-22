# Exemplar: workout-set — shared form across composed components

> **Domain:** an "active exercise" screen where the user logs sets (reps + kg).
> One `useForm` instance is created by the screen and threaded through three
> child components that each subscribe to a different slice. Adapted from
> `berzerk-club / packages/expo/app/active-exercise/` (real production code)
> — stripped of swipe/drag/blur noise so the *form* pattern shows clean.

## What this teaches

This is the canonical answer to **"how do I share one form across multiple
sibling components without prop-drilling values or hoisting to Zustand?"**

The three tricks the example demonstrates:

1. **Type-only inference helper for the `form` prop** (`-types.ts.txt`).
   A function `_inferSetEditorForm` that's never invoked at runtime —
   its only job is to give callers a `SetEditorForm` type for their
   `form: SetEditorForm` prop without redeclaring TanStack Form's
   generic arguments.

2. **Screen owns `useForm`, children receive it as a prop**
   (`screen.tsx.txt` → passes `form={form}` into `SetEditor`, `SetList`).
   No Zustand mirror, no React context, no microtask hop — every change
   from any child re-renders all subscribers in the same React commit.

3. **`form.Subscribe` with surgical selectors** (the heart of the
   pattern). Each child subscribes to the *narrowest slice it needs*:
   - **`SetEditor`** subscribes to `{ isSubmitting, values }` so the
     submit area can derive a disabled gate via `schema.safeParse(values)`
     AND branch between "log new set" and "save edits" based on
     `values.editingSelection`.
   - **`SetRow`** subscribes via a **3-mode discriminant selector**
     that returns `0 | 1 | 2 as const` (idle / selected / other-editing).
     Crucially this selector returns a *number*, not an object — so
     TanStack Form's structural-equality check stops the row from
     re-rendering on every keystroke in unrelated fields.
   - **`DraftSetPreviewSubscriber`** subscribes to
     `{ reps, kg, isDropset, editing }` to render a ghost preview of
     the next set under the list. Only this one component re-renders
     on every NumField keystroke; the FlatList itself is subscribed to
     `sets` (server data), not to the form.

## Files

| File | Owns |
|---|---|
| `-types.ts.txt` | Form data schema (`logSetMutationRequestSchema.and(editingSelection)`) + `SetEditorForm` type-only inference helper |
| `screen.tsx.txt` | `useForm` instance + onSubmit (branches `editSet` vs `logSet`) + threading `form` into children |
| `SetEditor.tsx.txt` | `form.Field` for `reps` + `kg` NumFields + `form.Subscribe` for the bottom submit area (edit-mode vs log-mode branching) |
| `SetRow.tsx.txt` | `form.Subscribe` with the 3-mode discriminant selector; `setFieldValue` batch on tap to enter edit mode |
| `SetList.tsx.txt` | Composes `SetRow` rows; `DraftSetPreviewSubscriber` (separate component to isolate its keystroke-driven re-renders) |

## Why split `DraftSetPreviewSubscriber` into its own component?

If you put the `<form.Subscribe>` for the ghost preview directly inside
`SetList`, the list re-renders on every keystroke (because the subscriber
returns a node that's part of `SetList`'s tree). Extracting it into its
own component scopes the re-render to just that component — the FlatList's
`renderItem` / `keyExtractor` stay stable.

## Anti-patterns this avoids

| If you reach for… | …you've drifted to a worse shape |
|---|---|
| A Zustand store mirroring `reps`/`kg` | Microtask hop between TanStack Form's commit and the store; selection state goes stale during server refetches because Zustand has no concept of "field touched" |
| React Context with `useForm` instance | All consumers re-render on every keystroke (Context propagation doesn't memoize) — same overhead, more boilerplate |
| Prop-drilling `reps`, `kg`, `editingSelection`, `setReps`, etc. | Children re-render on every parent re-render; the type-only inference helper exists precisely so the *form* travels as one typed prop |
| `useState` for `editingSelection` and `useForm` only for `reps`/`kg` | Now you have two sources of truth and the submit branch (`log` vs `edit`) has to consume both — the merged form-schema removes that split |

## How to adapt to your domain

Replace `reps`/`kg`/`isDropset` with your fields. Keep the shape:
- **One UI-only field** (here `editingSelection`) merged into the API schema via `apiSchema.and(z.object({ uiField: ... }))`. Submit re-parses with the bare API schema to strip the UI field.
- **One "leaf identity" field** in the UI field that distinguishes which row/instance is being edited. Used by the 3-mode discriminant selector in the row component.
- **Submit branches** in `onSubmit`: if `uiField` is populated → call the edit mutation; else → call the create mutation.
