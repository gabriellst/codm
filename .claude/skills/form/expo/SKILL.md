---
name: form (mobile)
description: Create TanStack Form-powered forms for the Expo app (packages/app/expo/) using native primitives — Input / NumField / KeyboardAware / Button. Covers single forms, sheet-as-form (modal sheet whose body is a form), and login-style flows.
---

> **Parent**: [`../SKILL.md`](../SKILL.md) — cross-platform mental model.
> **BEFORE IMPLEMENTING**: Open [`./registry.yaml`](./registry.yaml) and read `patterns` + `bad_practices`.

# Create Mobile Form (TanStack Form + native primitives)

Creates a validated form in the Expo app using TanStack Form, SDK Zod schemas, and the native primitive library at `packages/app/expo/components/ui/`. Forms live either inline under a tab/detail screen's `-components/` folder, or AS the body of a sheet route in `app/(sheets)/<name>/`.

## Core Principles [FRM-01..FRM-07]

1. **SDK schema is the single source of truth.** Import `xxxMutationRequestSchema` from `@codedm/client-typescript/typescript`. Use it as `validators.onChange` AND as the source for the submit button's `safeParse` gate.
2. **TanStack Form for field state.** `useForm({ defaultValues, validators: { onChange: schema }, onSubmit })`. Never `useState` for form values.
3. **Native primitives only.** `Input`, `InputGroup`, `InputPrefix`, `InputSuffix`, `NumField`, `Button`, `KeyboardAware` from `@/components/ui/*`. Never raw `<TextInput>` / `<Pressable>` styled as a CTA.
4. **`KeyboardAware` wraps any form with text inputs.** It owns `KeyboardAvoidingView` behavior + tap-to-dismiss. Wrap the form body, not the entire screen, so non-form siblings (header, illustration) layout independently.
5. **`DeepPartial<T>` defaults + `{}`-or-entity start.** Create forms start `{}`; edit forms start with the entity spread.
6. **Submit button gated by `safeParse`.** The `Button` is disabled while `!schema.safeParse(values).success || mutation.isPending || isSubmitting`.
7. **Global error handling.** `MutationCache.onError` (in `app/_layout.tsx`) surfaces errors via `Alert` / haptic — never wrap a `mutateAsync` call in `try/catch`.

## When to use this skill

- Building a create/edit form on a tab or detail screen (lives in `-components/<X>Form/index.tsx`).
- Building a **sheet-as-form**: a modal sheet route whose body IS a form (lives in `app/(sheets)/<name>/index.tsx`).
- Login / sign-up flows on `(auth)/*` screens.
- Multi-step wizards orchestrated by a parent form (same architecture as the web skill — see web/SKILL.md for the wizard composition rules; the field render code is mobile-specific).

## When NOT to use this skill

- The sheet's URL contract + presentation options → `/sheet` (mobile) skill.
- Read-only screens → `/component` (mobile).
- URL filters / pagination → `/route` (mobile) via `useTypedSearchParams`.
- Ephemeral toggles → `useState` or a route-scoped `/store`.

## Prerequisites

- SDK generated: `@codedm/client-typescript/typescript` exposes `useCreateX` / `useUpdateX` and `xxxMutationRequestSchema`.
- Form primitives exist: `ls packages/app/expo/components/ui/` should show `Input.tsx`, `NumField.tsx`, `KeyboardAware.tsx`, `Button.tsx`, `Sheet.tsx`.

---

## Type A — Single Form (inside a screen)

Lives at `packages/app/expo/app/<route>/-components/<X>Form/index.tsx`.

```tsx
import { View, Text } from 'react-native'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { Haptics } from 'react-native-nitro-haptics'
import { useTranslation } from 'react-i18next'
import {
  useCreateItem,
  createItemMutationRequestSchema,
  listItemsQueryKey,
  type CreateItemMutationRequest,
} from '@codedm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { Input, InputGroup } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { KeyboardAware } from '@/components/ui/KeyboardAware'

interface CreateItemFormProps {
  onSuccess?: () => void
}

export function CreateItemForm({ onSuccess }: CreateItemFormProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const createItem = useCreateItem()

  const defaultValues: DeepPartial<CreateItemMutationRequest> = {}

  const form = useForm({
    defaultValues,
    validators: { onChange: createItemMutationRequestSchema },
    onSubmit: async form => {
      const result = createItemMutationRequestSchema.safeParse(form.value)
      if (!result.success) return

      await createItem.mutateAsync(
        { data: result.data },
        {
          onSuccess: () => {
            Haptics.notification('success')
            onSuccess?.()
          },
          onSettled: () =>
            queryClient.invalidateQueries({ queryKey: listItemsQueryKey() }),
        },
      )
    },
  })

  return (
    <KeyboardAware>
      <View className="flex-1 px-5 py-6 gap-4">
        <form.Field name="name">
          {field => (
            <View className="gap-1.5">
              <Text className="text-fg-2 font-sans-semi text-xs uppercase">
                {t('createItem.name.label')}
              </Text>
              <InputGroup>
                <Input
                  value={field.state.value ?? ''}
                  onChangeText={field.handleChange}
                  onBlur={field.handleBlur}
                  placeholder={t('createItem.name.placeholder')}
                  accessibilityLabel={t('createItem.name.label')}
                />
              </InputGroup>
              {field.state.meta.isTouched && !field.state.meta.isValid ? (
                <Text className="text-accent-danger text-xs font-sans">
                  {field.state.meta.errors.join(', ')}
                </Text>
              ) : null}
            </View>
          )}
        </form.Field>

        <form.Subscribe
          selector={s => ({
            canSubmit: s.canSubmit,
            isSubmitting: s.isSubmitting,
            values: s.values,
          })}
        >
          {({ canSubmit, isSubmitting, values }) => {
            const isDisabled =
              !canSubmit ||
              isSubmitting ||
              createItem.isPending ||
              !createItemMutationRequestSchema.safeParse(values).success
            return (
              <Button
                label={t('createItem.submit')}
                fullWidth
                onPress={() => void form.handleSubmit()}
                disabled={isDisabled}
              />
            )
          }}
        </form.Subscribe>
      </View>
    </KeyboardAware>
  )
}
```

Notes:
- Use `onChangeText` (RN) instead of web's `onChange={e => field.handleChange(e.target.value)}`.
- `value={field.state.value ?? ''}` — same `?? ''` rule as web: `DeepPartial` makes the default `undefined`, and an uncontrolled `TextInput` flipping to controlled emits a warning.
- Errors render inline below the field (no `FieldError` primitive on mobile yet — use a plain `<Text>` styled with `text-accent-danger`).
- Submit via `form.handleSubmit()` from `Button.onPress` (no `<form>` element on RN).

---

## Type B — Sheet-as-Form

A modal sheet route whose body IS a form. The route lives under `packages/app/expo/app/(sheets)/<name>/index.tsx`, registered in `app/_layout.tsx` with `presentation: 'pageSheet'` (in-page sheet) or `presentation: 'fullScreenModal'` (takeover flow).

Pattern:

```tsx
// packages/app/expo/app/(sheets)/edit-profile/index.tsx
import { ScrollView, View, Text } from 'react-native'
import { router } from 'expo-router'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { Haptics } from 'react-native-nitro-haptics'
import { useTranslation } from 'react-i18next'
import {
  useUpdateProfile,
  updateProfileMutationRequestSchema,
  getProfileQueryKey,
  type ProfileResponse,
} from '@codedm/client-typescript/typescript'
import type { DeepPartial } from '@/lib'
import { Input, InputGroup } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { KeyboardAware } from '@/components/ui/KeyboardAware'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { surfaces } from '@/lib/tokens'

export default function EditProfileSheet() {
  // Profile comes from its own SDK hook. GATE the form's mount on it:
  // `defaultValues` is read ONCE at mount and does NOT auto-sync when the
  // query resolves later, so a form created while `profile` is undefined
  // would stay stuck on empty defaults. Mount the form only once loaded.
  const { data: profile } = useGetProfile()
  if (!profile) return <FormSkeleton />
  return <EditProfileForm profile={profile} />
}

function EditProfileForm({ profile }: { profile: GetProfileQueryResponse }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const updateProfile = useUpdateProfile()

  const defaultValues: DeepPartial<UpdateProfileMutationRequest> = {
    name: profile.name,
    bio: profile.bio,
  }

  const form = useForm({
    defaultValues,
    validators: { onChange: updateProfileMutationRequestSchema },
    onSubmit: async form => {
      const result = updateProfileMutationRequestSchema.safeParse(form.value)
      if (!result.success) return

      await updateProfile.mutateAsync(
        { data: result.data },
        {
          onSuccess: () => {
            Haptics.notification('success')
            router.back() // dismiss the sheet
          },
          onSettled: () =>
            queryClient.invalidateQueries({ queryKey: getProfileQueryKey() }),
        },
      )
    },
  })

  return (
    <KeyboardAware style={{ backgroundColor: surfaces.surface1 }}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="px-5 pt-6 pb-4">
          <Eyebrow>{t('editProfile.sectionPersonal')}</Eyebrow>
        </View>

        <View className="px-5 gap-4">
          <form.Field name="name">
            {field => (
              <View className="gap-1.5">
                <Text className="text-fg-2 font-sans-semi text-xs uppercase">
                  {t('editProfile.name')}
                </Text>
                <InputGroup>
                  <Input
                    value={field.state.value ?? ''}
                    onChangeText={field.handleChange}
                    onBlur={field.handleBlur}
                  />
                </InputGroup>
              </View>
            )}
          </form.Field>
          {/* ... more fields ... */}
        </View>

        <View className="px-5 pt-6">
          <form.Subscribe
            selector={s => ({ canSubmit: s.canSubmit, values: s.values })}
          >
            {({ canSubmit, values }) => {
              const isDisabled =
                !canSubmit ||
                updateProfile.isPending ||
                !updateProfileMutationRequestSchema.safeParse(values).success
              return (
                <Button
                  label={t('editProfile.save')}
                  fullWidth
                  onPress={() => void form.handleSubmit()}
                  disabled={isDisabled}
                />
              )
            }}
          </form.Subscribe>
        </View>
      </ScrollView>
    </KeyboardAware>
  )
}
```

Notes:
- **`router.back()` dismisses the sheet** after a successful submit (or `router.dismiss()` for `fullScreenModal` flows).
- **`KeyboardAware` is the outer wrapper** so the keyboard pushes the inputs up.
- **The sheet's URL contract + presentation options** belong to the `/sheet` skill — this file is only the body.
- Reference: `packages/app/expo/app/(sheets)/edit-profile/index.tsx`.

---

## Type C — Login / Apple Sign-In flow

The `(auth)/login` screen is NOT a TanStack Form (no editable fields). It's a button-driven flow over Apple Sign-In + biometric re-auth. Treat it as a **screen with mutation calls**, not a form. The patterns from this skill don't apply.

See `packages/app/expo/app/(auth)/login.tsx` for the canonical implementation. The relevant lessons here:

- `useState<boolean>(busy)` for the spinner/disabled state.
- `tryCatchAsync` for non-mutation async flows (e.g. wrapping `AppleAuthentication.signInAsync`) since there's no `MutationCache` to fall back on.
- `Alert.alert(...)` for user-facing errors.

If the user asks to add a username/password login form (no Apple/biometric flow), that IS a form — use Type A above with `loginMutationRequestSchema`.

---

## Field patterns

### Text field

```tsx
<form.Field name="name">
  {field => (
    <View className="gap-1.5">
      <Text className="text-fg-2 font-sans-semi text-xs uppercase">Name</Text>
      <InputGroup>
        <Input
          value={field.state.value ?? ''}
          onChangeText={field.handleChange}
          onBlur={field.handleBlur}
          placeholder="..."
        />
      </InputGroup>
      {field.state.meta.isTouched && !field.state.meta.isValid ? (
        <Text className="text-accent-danger text-xs font-sans">
          {field.state.meta.errors.join(', ')}
        </Text>
      ) : null}
    </View>
  )}
</form.Field>
```

### Email / password / numeric variants

Use RN keyboard hints on the `Input` (they pass straight through to `TextInput`):

```tsx
<Input keyboardType="email-address" autoCapitalize="none" textContentType="emailAddress" />
<Input secureTextEntry textContentType="password" />
<Input keyboardType="number-pad" />
```

### NumField (reps / weight / stepper input)

```tsx
import { NumField } from '@/components/ui/NumField'

<form.Field name="reps">
  {field => (
    <NumField
      label="Reps"
      value={field.state.value ?? 0}
      onChange={field.handleChange}
      step={1}
      min={0}
      max={99}
    />
  )}
</form.Field>
```

`NumField` is already styled and accessible. Use it for any positive integer / decimal input where stepper buttons + a typed value both make sense.

### Prefix / suffix adornments

```tsx
<InputGroup>
  <InputPrefix>@</InputPrefix>
  <Input value={field.state.value ?? ''} onChangeText={field.handleChange} placeholder="your.handle" />
</InputGroup>

<InputGroup>
  <Input value={field.state.value ?? ''} onChangeText={field.handleChange} keyboardType="numeric" />
  <InputSuffix>kg</InputSuffix>
</InputGroup>
```

### Masked inputs (phone, CPF, CNPJ, CEP)

There's no Maskito-style masking primitive on mobile yet. Two options:

1. **Soft formatting on display**: store the unmasked value, format inline in `value` via a helper from `@/lib/masks` (or inline `formatPhone(raw)`).
2. **Strict masking**: install a community RN mask lib (`react-native-mask-input`) and wrap it as a primitive (`MaskedInput`) following the `/primitive` mobile skill — only do this if a feature truly needs strict masking.

For most flows (phone collected once during onboarding), soft formatting + `keyboardType="phone-pad"` is enough.

---

## Submit pattern

The Button is always controlled by a `form.Subscribe` block. Submit from `onPress`, not from a form-level submit event (there's no `<form>` on RN):

```tsx
<form.Subscribe
  selector={s => ({ canSubmit: s.canSubmit, isSubmitting: s.isSubmitting, values: s.values })}
>
  {({ canSubmit, isSubmitting, values }) => {
    const isDisabled =
      !canSubmit ||
      isSubmitting ||
      mutation.isPending ||
      !schema.safeParse(values).success
    return (
      <Button
        label={t('common.save')}
        fullWidth
        onPress={() => void form.handleSubmit()}
        disabled={isDisabled}
      />
    )
  }}
</form.Subscribe>
```

If you want a "loading" visual instead of just disabling, add a `<ActivityIndicator>` next to the label inside a custom `Button` slot — Button's `leading` prop accepts a `ReactNode`.

---

## Multi-step wizards

The architecture mirrors the web skill: a parent screen holds a `useForm` of the full payload; each step component has its own `useForm` keyed to a sub-schema extracted from the complete/strict SDK schema. The only mobile-specific differences:

- Each step renders its body in a `<KeyboardAware>` wrapper.
- Step navigation uses `setCurrentStepIndex` from a Zustand store (route-scoped, in `-stores/`) — not `router.push`. The wizard is a single route with internal step state.
- "Back" buttons call `setDirection(-1)` then `setCurrentStepIndex(prev - 1)`; outside the first step, the OS back gesture should be intercepted to step the wizard back (see `Stack.Screen.options.gestureEnabled`).

The schema-extraction rules (use complete schema's `.def.shape.X` / `.unwrap()` / `.pick()`) are identical to web — refer to `../web/SKILL.md` for the canonical extraction code.

---

## Type D — Shared form across composed components

> **Canonical example: `exemplars/workout-set/`** — a textbook "active exercise" screen where one `useForm` (`reps`, `kg`, `isDropset`, plus a UI-only `editingSelection`) is owned by the screen and threaded into three sibling components (`SetEditor`, `SetList`, `SetRow`). Each child subscribes to a different slice of the same form, with zero Zustand mirror, zero Context, zero prop-drilling of values.
>
> Read all five files in [`exemplars/workout-set/`](./exemplars/workout-set/) before reaching for Context or a Zustand store to "share form state" — most of the time the answer is to share the *form instance itself* as a typed prop.

Use this pattern when the SAME form is consumed by multiple sibling components — typically a side-by-side "edit area + list of saved items" layout where the list rows can also drive what the edit area shows.

The three tricks:

### 1. Type-only inference helper for the `form` prop

```tsx
// active-exercise/-types.ts
function _inferSetEditorForm() {
	const defaults: DeepPartial<SetEditorFormData> = {}
	return useForm({
		defaultValues: defaults,
		validators: { onChange: setEditorFormSchema },
	})
}
export type SetEditorForm = ReturnType<typeof _inferSetEditorForm>
```

`_inferSetEditorForm` is never called at runtime. Its job is to give every consumer component a `form: SetEditorForm` prop type without restating TanStack Form's generic arguments at every call site.

### 2. Screen owns `useForm`; children consume by prop

```tsx
// active-exercise/[id].tsx
const form = useForm({ defaultValues, validators, onSubmit })
return (
	<View className="flex-1">
		<SetList form={form} sets={data?.sets ?? []} />
		<SetEditor form={form} />
	</View>
)
```

Every child mutation goes back to the same instance — every change re-renders all subscribers in the same React commit. **No Zustand mirror needed.**

> **Seeding defaults from async data?** `defaultValues` is read once at mount. If your defaults come from the fetched entity (e.g. `suggestedNextReps`), **gate the form's mount on `data`** — render an inner `<...Form entity={data} />` only once loaded (or `key` the form on the entity id). A form created while the query is still loading seeds from `undefined` and never picks up the server value. See the gate in `exemplars/workout-set/screen.tsx.txt`.

### 3. `form.Subscribe` with surgical selectors

Each child subscribes to the *narrowest slice it needs*. The keystone is the **3-mode discriminant selector** in `SetRow`:

```tsx
// active-exercise/-components/SetList/SetRow/index.tsx
<form.Subscribe
	selector={s => {
		const sel = s.values.editingSelection
		if (sel == null) return 0 as const                    // idle
		return sel.workoutSetId === set.workoutSetId
			? (1 as const)                                       // this row selected
			: (2 as const)                                       // another row selected
	}}
>
	{mode => { /* mode is 0 | 1 | 2 — a primitive, not an object */ }}
</form.Subscribe>
```

The selector returns a **number** (or any primitive). TanStack Form's structural-equality check only re-renders when the mode actually changes — typing in a `NumField` in the editor does NOT re-render every row in the list. Returning `{ isSelected, isOther }` instead would create a new object on every subscription tick and invalidate the equality check, re-rendering all rows on every keystroke.

`SetEditor` subscribes wider — `{ isSubmitting, values }` — so its submit area can:
- Derive `disabled` via `apiSchema.safeParse(values).success`
- Branch its render tree between "log mode" and "edit mode" by checking `values.editingSelection`

And the **draft-preview ghost row** lives in its own component (`DraftSetPreviewSubscriber`) extracted from `SetList`, so its keystroke-driven re-renders don't bubble back into the FlatList.

### When to reach for this vs. Zustand

| Need | Use |
|---|---|
| Sibling components READ + WRITE the same field state | This pattern (shared `useForm` via prop) |
| Sibling components need a TOGGLE / DIALOG / SELECTION not tied to a field | Zustand (`/store` skill) |
| State that survives the route lifetime (cross-page) | Zustand with `persist` middleware |
| State that's part of the URL contract | `routeApi.useSearch()` (the `/route` skill) |

---

## Critical rules

### Always wrap in `KeyboardAware`

```tsx
// WRONG — keyboard covers the input
<View>
  <Input ... />
  <Button ... />
</View>

// CORRECT
<KeyboardAware>
  <View className="flex-1 px-5 py-6 gap-4">
    <Input ... />
    <Button ... />
  </View>
</KeyboardAware>
```

### Use `?? ''` on `value`, `?? 0` on numeric

```tsx
<Input value={field.state.value ?? ''} ... />
<NumField value={field.state.value ?? 0} ... />
```

DeepPartial defaults are `undefined`. Uncontrolled → controlled transitions trigger an RN warning.

### Never call SDK fetcher manually

```tsx
// WRONG
import { sdk } from '@/lib/sdk'
await sdk.api.createItem({ data })

// CORRECT
const createItem = useCreateItem()
await createItem.mutateAsync({ data })
```

### Never wrap `mutateAsync` in try/catch

```tsx
// WRONG — global MutationCache.onError already handles this
try { await mutation.mutateAsync(...) } catch (e) { Alert.alert('Error', e.message) }

// CORRECT
await mutation.mutateAsync({ data: result.data }, { onSuccess, onSettled })
```

### Use `router.back()` to dismiss a sheet-as-form

```tsx
onSuccess: () => {
  Haptics.notification('success')
  router.back()         // pageSheet
  // or:  router.dismiss()  // fullScreenModal
},
```

### Invalidate cache with SDK helpers

```tsx
// WRONG
queryClient.invalidateQueries({ queryKey: ['items'] })

// CORRECT
import { listItemsQueryKey } from '@codedm/client-typescript/typescript'
queryClient.invalidateQueries({ queryKey: listItemsQueryKey() })
```

---

## Checklist

- [ ] All `when: always` patterns present (FRM-01..FRM-07 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated
- [ ] No `bad_practices` violations
- [ ] Form body wrapped in `<KeyboardAware>`
- [ ] All inputs use `Input` / `InputGroup` / `NumField` from `@/components/ui/*` — no raw `TextInput`
- [ ] Submit `Button` disabled gate uses `schema.safeParse(values).success`
- [ ] `value` props use `?? ''` (text) / `?? 0` (number)
- [ ] Mutation invalidates cache via SDK query-key helper
- [ ] Sheet-as-form dismisses via `router.back()` / `router.dismiss()` on success
- [ ] No `try/catch` around `mutateAsync`
- [ ] i18n strings via `useTranslation()` from `react-i18next`

## References

- `packages/app/expo/app/(sheets)/edit-profile/index.tsx` — Sheet-as-form scaffold
- `packages/app/expo/app/(auth)/login.tsx` — Login flow (NOT a form — Apple Sign-In)
- `packages/app/expo/components/ui/Input.tsx` — Text input + `InputGroup` / `InputPrefix` / `InputSuffix`
- `packages/app/expo/components/ui/NumField.tsx` — Stepper numeric input
- `packages/app/expo/components/ui/KeyboardAware.tsx` — Keyboard wrapper
- `packages/app/expo/components/ui/Button.tsx` — Submit button
- [`exemplars/workout-set/`](./exemplars/workout-set/) — **Type D** canonical example: reps/kg form shared across screen + editor + list + row via `form.Subscribe`
- `/sheet` skill — Sheet route registration + presentation options
- `/route` (mobile) — Screen scaffolding around a form
- `/primitive` (mobile) — Building a `MaskedInput` if strict masking is needed
