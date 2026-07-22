---
name: form
description: Create forms with TanStack Form and SDK validation. Covers single forms and multi-step wizards. Use this skill for any form implementation — login forms, CRUD forms, multi-step wizards, forms with field arrays, or any UI that collects and validates user input.
---

> **BEFORE IMPLEMENTING**: Open [`registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

# Form Skill — TanStack Form + SDK Validation

Creates validated forms using TanStack Form with SDK Zod schemas. Supports two form types: **single forms** (one form, one submission) and **multi-step wizards** (multiple sub-forms orchestrated by a parent).

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Form Types Overview](#form-types-overview)
3. [Type A — Single Form](#type-a--single-form)
4. [Type B — Multi-Step Wizard](#type-b--multi-step-wizard)
5. [Field Patterns](#field-patterns)
6. [Submit Button Patterns](#submit-button-patterns)
7. [Input Masking](#input-masking)
8. [Critical Rules](#critical-rules)
9. [Checklist](#checklist)
10. [Quick-reference: canon deviations](#quick-reference-canon-deviations)

---

## Core Principles [FRM-01, FRM-02, FRM-03]

- **SDK schema is the single source of truth** — forms use SDK Zod schemas for validation, keeping frontend and backend contracts synchronized automatically.
- **TanStack Form manages field state** — validation timing, touched state, submission, and error display.
- **SDK mutation hooks handle the API call** — cache invalidation and error handling are handled globally by `MutationCache`.
- **Input masking (Maskito)** formats visual input while the form stores the value the backend expects.

## When to Use

- Creating or editing data that submits to the API
- Any form that needs validation synchronized with the backend
- Multi-step wizards with partial validation per step
- Forms with masked inputs (phone, CPF, CNPJ)

## When NOT to Use

- Read-only data display → `/component` skill
- Filters and search → URL search params via `/route` skill
- Simple toggles or selections without API submission → `/store` or `useState`

## Prerequisites

- SDK generated with mutation hooks (`/sdk` skill)
- Primitives available in `@/components/ui/` (field, input, button, spinner)

---

## Form Types Overview

| Aspect | Single Form | Multi-Step Wizard | Dialog Form |
|--------|-------------|-------------------|-------------|
| **Structure** | One `useForm` → one submit | Parent `useForm` + N child `useForm`s | One `useForm` inside `<DialogContent>` → `useDialogStore` controls open/close |
| **Validation** | `validators.onChange` with full SDK schema | Each step validates its sub-schema via `onChange` | `validators.onChange` with full SDK schema |
| **Default values** | `DeepPartial<MutationRequest>` with `{}` | `DeepPartial<StepData>` (fields start empty) | `DeepPartial<MutationRequest>` (create) or fetched entity (update) |
| **Submission** | `onSubmit` calls mutation directly | Each step calls parent handler; parent merges data and may submit per-step or at the end | `onSubmit` calls mutation, `hide()` on success |
| **Examples** | Sign-up, create/edit entity | Onboarding, multi-page registration | Create/edit/delete entity via modal |

### Default Values — Always `DeepPartial` + `{}`

All forms use `DeepPartial<T>` for default values. This simplifies the pattern — no need to spell out every field.

| Scenario | defaultValues | Example |
|----------|--------------|---------|
| Create (empty) | `DeepPartial<MutationRequest> = {}` | `const defaultValues: DeepPartial<CreateItemMutationRequest> = {}` |
| Edit (pre-filled) | `DeepPartial<MutationRequest> = { ...data }` | `const defaultValues: DeepPartial<UpdateItemMutationRequest> = { name: item.name }` |
| Multi-step wizard | `DeepPartial<StepData>` (from props) | `defaultValues` prop received from parent |
| With fixed values | `DeepPartial<MutationRequest> = { fixedField }` | `const defaultValues: DeepPartial<CreateNoteMutationRequest> = { patientId }` |

**Rule**: Always use `DeepPartial<T>` and start with `{}` (or partial values for edit forms). The `safeParse` button check handles validation — no need for `validateFieldsFilled`.

---

## Type A — Single Form

A standalone form that collects all data and submits in one action.

### Structure

```
routes/feature/-components/CreateItemForm/index.tsx
```

### Complete Example

```typescript
import React from 'react'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  useCreateItem,
  createItemMutationRequestSchema,
  listItemsQueryKey,
  type CreateItemMutationRequest,
} from '@template/client-typescript/typescript'
import { cn } from '@/lib/utils'
import { DeepPartial } from '@/lib'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

// A15: compose ComponentProps so parents can place/style this form
type CreateItemFormProps = React.ComponentProps<'form'> & {
  onSuccess?: () => void
  onCancel?: () => void
}

export function CreateItemForm({ onSuccess, onCancel, className, ...props }: CreateItemFormProps) {
  const queryClient = useQueryClient()

  // H1: declare onSuccess on the hook, not on each mutateAsync call site
  const createItem = useCreateItem({
    mutation: {
      onSuccess: () => {
        toast.success('Item created')
        queryClient.invalidateQueries({ queryKey: listItemsQueryKey() })
        onSuccess?.()
      },
    },
  })

  // A5/A6: typed const (no inline cast, no useForm<T> type arg)
  const defaultValues: DeepPartial<CreateItemMutationRequest> = {}

  const form = useForm({
    defaultValues,
    validators: {
      onChange: createItemMutationRequestSchema,   // A1: SDK schema, never local z.object
    },
    onSubmit: async form => {
      const result = createItemMutationRequestSchema.safeParse(form.value)
      if (!result.success) return
      await createItem.mutateAsync({ data: result.data })
    },
  })

  return (
    // A15: forward className + native form attrs; keep form's onSubmit last
    <form
      className={cn('space-y-4', className)}
      {...props}
      onSubmit={e => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      <form.Field name="name">
        {field => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <FieldGroup>
              <FieldLabel htmlFor={field.name}>Name *</FieldLabel>
              <Input
                id={field.name}
                value={field.state.value ?? ''}    // bp-17
                onBlur={field.handleBlur}
                onChange={e => field.handleChange(e.target.value)}
                aria-invalid={isInvalid}
              />
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </FieldGroup>
          )
        }}
      </form.Field>

      <div className="flex gap-2 pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        )}
        <form.Subscribe selector={state => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting, values: state.values })}>
          {({ canSubmit, isSubmitting, values }) => {
            // H2: combined isPending when a form owns multiple mutations
            const isPending = isSubmitting || createItem.isPending
            const isDisabled = !canSubmit || isPending || !createItemMutationRequestSchema.safeParse(values).success
            return (
              <Button type="submit" disabled={isDisabled}>
                {isPending && <Spinner className="mr-2" />}
                Save
              </Button>
            )
          }}
        </form.Subscribe>
      </div>
    </form>
  )
}
```

### Edit Form Variant (A14)

Edit forms receive the **entity typed from the SDK read query** (never a hand-rolled interface), and map it to `DeepPartial<WriteDto>` for `defaultValues`. Two shapes, one mapping — no invented third type.

```typescript
import type { GetItemQueryResponse, UpdateItemMutationRequest } from '@template/client-typescript/typescript'

// A14: props = read DTO (what the parent already has from its list/detail query)
type EditItemFormProps = React.ComponentProps<'form'> & {
  item: NonNullable<GetItemQueryResponse['item']>
  onSuccess?: () => void
}

export function EditItemForm({ item, onSuccess, className, ...props }: EditItemFormProps) {
  const queryClient = useQueryClient()
  const updateItem = useUpdateItem({
    mutation: {
      onSuccess: () => {
        toast.success('Item updated')
        queryClient.invalidateQueries({ queryKey: getItemQueryKey({ id: item.id }) })
        queryClient.invalidateQueries({ queryKey: listItemsQueryKey() })
        onSuccess?.()
      },
    },
  })

  // A14: defaultValues = write DTO shape, mapped from the read DTO
  const defaultValues: DeepPartial<UpdateItemMutationRequest> = {
    name: item.name,
    email: item.email,
  }

  const form = useForm({
    defaultValues,
    validators: { onChange: updateItemMutationRequestSchema },
    onSubmit: async form => {
      const result = updateItemMutationRequestSchema.safeParse(form.value)
      if (!result.success) return
      await updateItem.mutateAsync({ id: item.id, data: result.data })
    },
  })

  return (
    <form
      className={cn('space-y-4', className)}
      {...props}
      onSubmit={e => { e.preventDefault(); e.stopPropagation(); form.handleSubmit() }}
    >
      {/* same field structure as Type A */}
    </form>
  )
}
```

---

## Type B — Multi-Step Wizard

A page with multiple sequential sub-forms that collectively fulfill one command. Data can be sent to the server at each step (progressive save) or accumulated and sent at the final step.

### Architecture

```
routes/wizard/
├── index.tsx                          # Parent: orchestrator + parent form
├── -stores/useWizardStore.ts          # Step navigation state (Zustand)
└── -components/
    ├── StepA/index.tsx                # Sub-form with own useForm + sub-schema
    ├── StepB/index.tsx                # Sub-form with own useForm + sub-schema
    └── StepC/index.tsx                # Sub-form with own useForm + sub-schema
```

**Roles:**
- **Parent (`index.tsx`)** — holds the full data shape in a `useForm`, orchestrates step navigation, defines handler functions for each step, decides when/what to send to the server.
- **Step components** — each has its own `useForm` with an extracted sub-schema, receives `defaultValues` + `onSubmit` + `onBack` as props. Steps are completely unaware of the API, store, or navigation.
- **Store** — manages current step index, direction (for animations), and mode selection. Pure UI state, no form data.

### 1. Define Step Configuration

Steps are defined as ordered arrays, grouped by mode/variant. This allows the wizard to show different flows depending on user choices or any other business rule.

```typescript
// Step enum comes from SDK or is defined locally
const FLOW_A_STEPS = [
  StepEnum.SELECTION,
  StepEnum.PERSONAL_INFO,
  StepEnum.ADDRESS,
  StepEnum.REVIEW,
] as const

const FLOW_B_STEPS = [
  StepEnum.SELECTION,
  StepEnum.WAITING,
] as const

// Map each mode/variant to its step sequence
const MODE_STEPS: Record<FlowMode, readonly Step[]> = {
  [FlowModeEnum.FLOW_A]: FLOW_A_STEPS,
  [FlowModeEnum.FLOW_B]: FLOW_B_STEPS,
}

// Map each mode to its initial step (after selection)
const MODE_INITIAL_STEP: Record<FlowMode, Step> = {
  [FlowModeEnum.FLOW_A]: StepEnum.PERSONAL_INFO,
  [FlowModeEnum.FLOW_B]: StepEnum.WAITING,
}
```

### 2. Navigation Store

A Zustand store holds pure UI state for step navigation:

```typescript
import { create } from 'zustand'

interface WizardStore {
  selectedMode: FlowMode | undefined
  currentStepIndex: number
  direction: 1 | -1                    // Animation direction
  setSelectedMode: (mode: FlowMode | undefined) => void
  setCurrentStepIndex: (index: number) => void
  setDirection: (direction: 1 | -1) => void
  reset: () => void
}

export const useWizardStore = create<WizardStore>()(set => ({
  selectedMode: undefined,
  currentStepIndex: 0,
  direction: 1,
  setSelectedMode: selectedMode => set({ selectedMode }),
  setCurrentStepIndex: currentStepIndex => set({ currentStepIndex }),
  setDirection: direction => set({ direction }),
  reset: () => set({ selectedMode: undefined, currentStepIndex: 0, direction: 1 }),
}))
```

### 3. Parent Form + Handler Functions

The parent creates a `useForm` that holds the full data shape. Each handler function:
1. Merges the step's validated data into the parent form
2. Advances to the next step
3. Optionally saves progress to the server (progressive save)

```typescript
function WizardForm() {
  const navigate = useNavigate()
  const { selectedMode, currentStepIndex, direction, setSelectedMode, setCurrentStepIndex, setDirection, reset } = useWizardStore()

  const saveProgress = useSaveProgress()
  const completeWizard = useCompleteWizard()

  // Parent form holds the full accumulated data
  const form = useForm({
    defaultValues: { ...defaultValues, ...initialState },
  })

  const steps = selectedMode ? MODE_STEPS[selectedMode] : ([StepEnum.SELECTION] as const)
  const currentStepName = steps[currentStepIndex] ?? StepEnum.SELECTION

  // Handler for an intermediate step — merges data, advances, saves progress
  const handlePersonalInfoSubmit = useCallback(
    async (data: PersonalInfoStepData) => {
      form.setFieldValue('personalInfo', data)

      if (currentStepIndex >= steps.length - 1) return
      const nextIndex = currentStepIndex + 1
      setDirection(1)
      setCurrentStepIndex(nextIndex)

      // Progressive save: persist partial state to server
      await saveProgress.mutateAsync({
        data: {
          mode: selectedMode,
          currentStep: steps[nextIndex],
          state: { ...form.state.values, personalInfo: data },
        },
      })
    },
    [currentStepIndex, steps, setDirection, setCurrentStepIndex, selectedMode, saveProgress, form],
  )

  // Handler for the final step — validates full payload, completes the wizard
  const handleFinalSubmit = useCallback(
    async (data: FinalStepData) => {
      if (!selectedMode) return

      const merged = { ...form.state.values, ...data }
      const parsed = completeWizardMutationRequestSchema.safeParse({
        mode: selectedMode,
        ...merged,
      })

      if (!parsed.success) {
        toast.error('Required fields missing')
        return
      }

      await completeWizard.mutateAsync(
        { data: parsed.data },
        {
          onSuccess: () => {
            toast.success('Completed!')
            reset()
            navigate({ to: '/dashboard' })
          },
        },
      )
    },
    [selectedMode, form, completeWizard, navigate, reset],
  )

  // Generic back handler
  const handleBack = useCallback(async () => {
    if (currentStepIndex <= 0) return
    const prevIndex = currentStepIndex - 1
    setDirection(-1)
    setCurrentStepIndex(prevIndex)
    await saveProgress.mutateAsync({
      data: { mode: selectedMode, currentStep: steps[prevIndex], state: form.state.values },
    })
  }, [currentStepIndex, steps, setDirection, setCurrentStepIndex, selectedMode, saveProgress, form.state.values])

  const isSubmitting = completeWizard.isPending || saveProgress.isPending

  // ...
}
```

### 4. Step Component Map

Map each step to its component, passing the appropriate handler and parent form slice:

```typescript
const stepComponents: Record<Step, React.ReactNode> = {
  [StepEnum.SELECTION]: <ModeSelection onSelect={handleModeSelect} selectedMode={selectedMode} />,
  [StepEnum.PERSONAL_INFO]: (
    <PersonalInfoStep
      defaultValues={defaultValues.personalInfo}
      onSubmit={handlePersonalInfoSubmit}
      onBack={handleBack}
      isSubmitting={isSubmitting}
    />
  ),
  [StepEnum.ADDRESS]: (
    <AddressStep
      defaultValues={defaultValues.address}
      onSubmit={handleAddressSubmit}
      onBack={handleBack}
      isSubmitting={isSubmitting}
    />
  ),
  [StepEnum.REVIEW]: (
    <ReviewStep
      defaultValues={defaultValues}
      onSubmit={handleFinalSubmit}
      onBack={handleBack}
      isSubmitting={isSubmitting}
    />
  ),
  [StepEnum.WAITING]: <WaitingStep onComplete={handleSkip} isSubmitting={isSubmitting} />,
  [StepEnum.COMPLETED]: null,
}

// Render current step
return <div>{stepComponents[currentStepName]}</div>
```

### 5. Step Component — Schema Extraction & Props Contract

Each step extracts its sub-schema from the **complete/strict** SDK mutation schema (never from a draft/save schema, which has all fields optional).

> **Extraction goes through `@/lib/union`** — `pickUnionVariantField(union, match, field)` /
> `pickUnionVariant(union, match)` match the variant by DISCRIMINANT (typos and bad literals
> are compile errors). Never raw positional `.def.options[0]` — the index breaks silently
> when the contract reorders members (registry FRM-P44; expo form FRM-C05 is the same canon).

```typescript
import { completeWizardMutationRequestSchema } from '@template/client-typescript/typescript'
import { pickUnionVariantField, pickUnionVariant } from '@/lib/union'
import { type DeepPartial } from '@/lib'
import { useForm } from '@tanstack/react-form'

// --- Schema extraction ---

// Slice ONE field of the union member matched by its discriminant — the returned
// schema is a valid TanStack `validators.onChange` AND a safeParse source:
export const PersonalInfoStepSchema = pickUnionVariantField(
  completeWizardMutationRequestSchema, { type: 'PERSONAL' }, 'personalInfo',
)

// Partial steps compose with .pick() on the slice (.unwrap() for optionals):
export const AddressStepSchema = pickUnionVariantField(
  completeWizardMutationRequestSchema, { type: 'PERSONAL' }, 'address',
).unwrap().pick({
  street: true, city: true, state: true, zipCode: true,
})

// --- Type derivation ---

export type PersonalInfoStepData = (typeof PersonalInfoStepSchema)['_zod']['output']

// --- Form type inference (for passing form to child components) ---

function _inferPersonalInfoForm() {
  const defaults: DeepPartial<PersonalInfoStepData> = {}
  return useForm({ defaultValues: defaults, validators: { onChange: PersonalInfoStepSchema } })
}
type PersonalInfoForm = ReturnType<typeof _inferPersonalInfoForm>
// The _infer function is NEVER called — it exists only for ReturnType inference.
// This pattern exists because TanStack Form's type inference for nested form
// structures is complex. Exporting the form type allows child step components
// to receive properly typed form props without re-deriving the types.
```

**Why `DeepPartial`?** In multi-step flows, fields start empty. `DeepPartial<T>` makes all properties (including nested) optional while keeping type safety for field access.

Since values start as `undefined` (empty `{}`), all text inputs MUST use `?? ''` (see bp-17).

### Step Props Contract

Every step component follows this standard interface:

```typescript
interface StepProps {
  defaultValues?: DeepPartial<StepData>   // Pre-filled from parent form
  onSubmit: (data: StepData) => void      // Parent decides what happens next
  onBack?: () => void                     // Parent handles navigation
  onSkip?: () => void                     // Optional: skip this step
  isSubmitting?: boolean                  // Parent controls loading state
}
```

The step owns its own `useForm`, validates locally, and calls `onSubmit(validatedData)` — it knows nothing about the store, API, or navigation.

### Step Component Implementation

```typescript
export function PersonalInfoStep({ defaultValues, onSubmit, onBack, isSubmitting }: PersonalInfoStepProps) {
  const form = useForm({
    defaultValues,
    validators: {
      onChange: PersonalInfoStepSchema,
    },
    onSubmit: async form => {
      const result = PersonalInfoStepSchema.safeParse(form.value)

      if (!result.success) return

      onSubmit(result.data)
    },
  })

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        e.stopPropagation()
        form.handleSubmit()
      }}
    >
      {/* ... form fields ... */}

      <form.Subscribe selector={state => ({ canSubmit: state.canSubmit, values: state.values })}>
        {({ canSubmit, values }) => {
          const isDisabled = isSubmitting || !canSubmit || !PersonalInfoStepSchema.safeParse(values).success
          return (
            <div className="flex justify-between">
              {onBack && (
                <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
                  Back
                </Button>
              )}
              <Button type="submit" disabled={isDisabled}>
                {isSubmitting && <Spinner className="mr-2" />}
                Next
              </Button>
            </div>
          )
        }}
      </form.Subscribe>
    </form>
  )
}
```

### Passing Form to Extracted Child Components

When a step has complex sub-sections (e.g., dynamic array rows), extract them into child components and pass the form instance using the inferred type:

```typescript
// Child component receives the form instance typed via inference
function ItemRow({ form, index }: { form: PersonalInfoForm; index: number }) {
  return (
    <form.Field name={`items[${index}].name`}>
      {field => {
        const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
        return (
          <Field>
            <Input
              id={field.name}
              value={field.state.value ?? ''}
              onBlur={field.handleBlur}
              onInput={e => field.handleChange(e.currentTarget.value)}
              aria-invalid={isInvalid}
            />
            {isInvalid && <FieldError errors={field.state.meta.errors} />}
          </Field>
        )
      }}
    </form.Field>
  )
}
```

### Array Fields in Steps

Use `mode="array"` for dynamic lists. With `DeepPartial`, push empty objects:

```typescript
<form.Field name="items" mode="array">
  {field => (
    <div>
      {(field.state.value ?? []).map((_, i) => (
        <div key={i} className="flex items-end gap-2">
          <ItemRow form={form} index={i} />
          {(field.state.value?.length ?? 0) > 1 && (
            <Button variant="ghost" size="icon" onClick={() => field.removeValue(i)}>
              <IconTrash className="size-4" />
            </Button>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => field.pushValue({})}>
        <IconPlus className="size-4 mr-1" /> Add
      </Button>
    </div>
  )}
</form.Field>
```

### Submission Strategies

| Strategy | When to Use | How |
|----------|-------------|-----|
| **Progressive save** | Server persists partial state; user can resume later | Each step handler calls `saveProgress.mutateAsync()` after merging data |
| **Accumulate + final submit** | Only the final payload matters | Steps only merge data into parent form; final step validates the full schema and submits |
| **Hybrid** | Some steps persist (e.g., file uploads), final step completes | Mix both: intermediate steps save where needed, final step validates everything |

---

## Type C — Dialog Form

A form rendered inside a dialog, opened via `useDialogStore`. The dialog is self-contained: it owns its form, mutation, query invalidation, and close behavior. It renders `<DialogContent>` directly — the global `<Dialog>` in the app layout handles open/close.

### Three Subtypes

| Subtype | Props | Data | Example |
|---------|-------|------|---------|
| **Create** | none (or optional defaults) | Form starts empty | `CreateUnitDialog` |
| **Update** | full entity data | Dialog receives entity as props, inner component pre-fills form | `UpdatePatientDialog` |
| **Delete/Confirm** | entity ID + display name | No form — just mutation call | `DeleteServiceDialog` |

### Structure

Dialog forms live in `-components/` under their route:

```
routes/feature/
├── -components/
│   ├── CreateItemDialog/index.tsx
│   ├── UpdateItemDialog/index.tsx
│   └── DeleteItemDialog/index.tsx
```

### Opening & Closing

```typescript
// Open from anywhere:
import { useDialogStore } from '@/stores/useDialogStore'
const { show } = useDialogStore()
show(<CreateItemDialog />)

// Close from inside the dialog:
const { hide } = useDialogStore()
hide()
```

No `open`/`onOpenChange` props. The dialog unmounts on `hide()`, so form state is automatically cleaned up — no manual `form.formApi.reset()` needed.

### Create Dialog Pattern

```typescript
export function CreateItemDialog() {
  const { hide } = useDialogStore()
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
          onSuccess: () => { toast.success('Item created'); hide() },
          onSettled: () => queryClient.invalidateQueries({ queryKey: listItemsQueryKey() }),
        },
      )
    },
  })

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Create Item</DialogTitle>
      </DialogHeader>
      <form noValidate className="flex flex-col gap-4"
        onSubmit={e => { e.preventDefault(); e.stopPropagation(); form.handleSubmit() }}>
        {/* fields — same TanStack Form patterns as Type A */}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={hide}>Cancel</Button>
          {/* safeParse-driven submit button — same pattern as Type A */}
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
```

### Update Dialog Pattern (entity as props)

Update dialogs receive the full entity as props (e.g., `patient: PatientDetail`, `unit: UnitItem`, `service: ServiceDetail`), avoiding an extra fetch. The dialog handles its own mutation and query invalidation.

```typescript
export function UpdateItemDialog({ item }: { item: ItemResponse }) {
  const { hide } = useDialogStore()
  const queryClient = useQueryClient()
  const updateItem = useUpdateItem()

  const form = useForm({
    defaultValues: { name: item.name, email: item.email },
    validators: { onChange: updateItemMutationRequestSchema },
    onSubmit: async form => {
      const result = updateItemMutationRequestSchema.safeParse(form.value)
      if (!result.success) return
      await updateItem.mutateAsync(
        { id: item.id, data: result.data },
        {
          onSuccess: () => { toast.success('Updated'); hide() },
          onSettled: () => queryClient.invalidateQueries({ queryKey: listItemsQueryKey() }),
        },
      )
    },
  })

  return (
    <DialogContent className="sm:max-w-md">
      {/* form fields pre-filled from item props */}
    </DialogContent>
  )
}

// Caller:
show(<UpdateItemDialog item={selectedItem} />)
```

**Why entity as props?** The parent already has the entity data (from a list query or detail query). Passing it directly avoids an extra API call and ensures the form has correct initial values immediately at mount.

### Delete/Confirm Dialog Pattern

```typescript
export function DeleteItemDialog({ itemId, itemName }: { itemId: string; itemName: string }) {
  const { hide } = useDialogStore()
  const queryClient = useQueryClient()
  const deleteItem = useDeleteItem()

  const handleDelete = async () => {
    await deleteItem.mutateAsync(
      { id: itemId },
      {
        onSuccess: () => { toast.success(`${itemName} deleted`); hide() },
        onSettled: () => queryClient.invalidateQueries({ queryKey: listItemsQueryKey() }),
      },
    )
  }

  return (
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Delete {itemName}?</DialogTitle>
        <DialogDescription>This action cannot be undone.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={hide}>Cancel</Button>
        <Button variant="destructive" onClick={handleDelete} disabled={deleteItem.isPending}>
          {deleteItem.isPending && <Spinner className="mr-2" />}
          Delete
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
```

### Inline Confirmation (no dialog component needed)

For simple confirmations that don't need a dedicated component, use `useDialogStore.confirm()` directly:

```typescript
const { confirm } = useDialogStore()

const handleDelete = async () => {
  const confirmed = await confirm({
    title: 'Delete message?',
    description: 'This action cannot be undone.',
    variant: 'destructive',
  })
  if (!confirmed) return
  await deleteMutation.mutateAsync({ id: messageId })
}
```

`confirm()` renders a generic `ConfirmDialog` primitive and returns `Promise<boolean>`. Use this when the confirmation is simple (title + description + confirm/cancel). For confirmations that need custom UI, mutation loading state, or domain-specific layout, create a dedicated dialog component instead.

---

## Field Patterns

### Standard Text Field

```typescript
<form.Field name="fieldName">
  {field => {
    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
    return (
      <Field>
        <FieldLabel htmlFor={field.name}>Label</FieldLabel>
        <Input
          id={field.name}
          name={field.name}
          value={field.state.value ?? ''}
          onBlur={field.handleBlur}
          onChange={e => field.handleChange(e.target.value)}
          aria-invalid={isInvalid}
        />
        {isInvalid && <FieldError errors={field.state.meta.errors} />}
      </Field>
    )
  }}
</form.Field>
```

### Combobox / Select Field (arbitrary values)

```typescript
<form.Field name="category">
  {field => {
    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
    return (
      <Field>
        <FieldLabel htmlFor={field.name}>Category</FieldLabel>
        <Combobox
          value={field.state.value || null}
          onValueChange={value => field.handleChange(value ?? undefined)}
          items={ITEMS}
          itemToStringLabel={item => itemLabels[item]}
        >
          <ComboboxInput placeholder="Select..." aria-invalid={isInvalid} />
          <ComboboxContent>
            <ComboboxList>
              <ComboboxEmpty>No results</ComboboxEmpty>
              {ITEMS.map(item => (
                <ComboboxItem key={item} value={item}>{itemLabels[item]}</ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
        {isInvalid && <FieldError errors={field.state.meta.errors} />}
      </Field>
    )
  }}
</form.Field>
```

### Enum Select / Toggle Fields (FRM-P09 — A13)

Any field bound to a closed SDK enum uses the **enum-driven mode** of the existing `<Select>`, `<Combobox>`, or `<ToggleGroup>` primitives. Pass an `enum` prop (a `Record<string, string>` constant from the SDK) together with `i18nPrefix` and the primitive auto-renders translated labels — no per-form `Object.values(…).map(…)` block, no `as <Enum>` cast at `onValueChange`.

**Enum-mode props** (generic `E extends Record<string, string>`):

| Prop | Type | Notes |
|------|------|-------|
| `enum` | `E` | SDK enum object, e.g. `TaxTypeEnum` |
| `i18nPrefix` | `string` | Namespace prefix, e.g. `"enums.TaxType"` |
| `value` | `E[keyof E] \| undefined` | Controlled value; `undefined` → null root |
| `onValueChange` | `(v: E[keyof E]) => void` | Emits typed enum value via `isEnumValue` guard — no `as` cast |
| `placeholder` | `string` (optional) | i18n key for the unselected label |
| `values` | `E[keyof E][]` (optional) | Subset of values to show; defaults to `Object.values(enum)` |
| `id` | `string` (optional) | Wire to `<FieldLabel htmlFor>` |
| `className` | `string` (optional) | |
| `disabled` | `boolean` (optional) | |
| `aria-invalid` | `boolean` (optional) | |

The trigger label is `t(\`${i18nPrefix}.${value}\`)` and each item label is `t(\`${i18nPrefix}.${v}\`)`. The narrowing from `string` to `E[keyof E]` uses `isEnumValue` from `'@/lib'` — never a bare `as` cast.

The compound children API of `<Select>` / `<Combobox>` / `<ToggleGroup>` is **unchanged** — existing usages that pass `<SelectItem>` children continue to compile.

```typescript
import { Select } from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { ToggleGroup } from '@/components/ui/toggle-group'
import { TaxTypeEnum, CurrencyCode, OperationalCostFlowEnum } from '@template/client-typescript/typescript'

// Dropdown — Select in enum mode
<form.Field name="type">
  {field => {
    const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
    return (
      <FieldGroup>
        <FieldLabel htmlFor={field.name}>Type</FieldLabel>
        <Select
          enum={TaxTypeEnum}
          i18nPrefix="enums.TaxType"
          value={field.state.value}
          onValueChange={field.handleChange}
          placeholder="taxes.typePlaceholder"
          id={field.name}
          aria-invalid={isInvalid}
        />
        {isInvalid && <FieldError errors={field.state.meta.errors} />}
      </FieldGroup>
    )
  }}
</form.Field>

// Searchable dropdown — Combobox in enum mode
<form.Field name="currency">
  {field => (
    <FieldGroup>
      <FieldLabel htmlFor={field.name}>Currency</FieldLabel>
      <Combobox
        enum={CurrencyCode}
        i18nPrefix="enums.CurrencyCode"
        value={field.state.value}
        onValueChange={field.handleChange}
        placeholder="common.selectCurrency"
        id={field.name}
      />
    </FieldGroup>
  )}
</form.Field>

// Segmented control — ToggleGroup in enum mode (≤ 4 values)
<form.Field name="flow">
  {field => (
    <FieldGroup>
      <FieldLabel>Flow</FieldLabel>
      <ToggleGroup
        enum={OperationalCostFlowEnum}
        i18nPrefix="enums.OperationalCostFlow"
        value={field.state.value}
        onValueChange={field.handleChange}
      />
    </FieldGroup>
  )}
</form.Field>
```

Do NOT hand-roll a `Select` + `Object.values(SomeEnum).map(...)` + `` t(`enums.X.${v}`) `` per form. Use the enum-driven mode and keep the cast-free invariant. The only remaining sanctioned `as <Enum>` cast is if a third-party element emits `string` and no project primitive covers that use case (FRM-P05).

### Money Field — `CurrencyInput` (A12)

Any field that maps to a `{ amountCents: number; currency: CurrencyCode }` shape (Money / SignedMoney) MUST use `<CurrencyInput>`. Never hand-roll a currency `<Select>` + amount `<Input>` pair, and never hardcode a currency string.

```typescript
import { CurrencyInput } from '@/components/ui/currency-input'

<form.Field name="targetAmount">
  {field => (
    <FieldGroup>
      <FieldLabel htmlFor={field.name}>Target amount</FieldLabel>
      <CurrencyInput
        amountCents={field.state.value?.amountCents ?? 0}
        currency={field.state.value?.currency ?? CurrencyCodeEnum.BRL}
        onAmountChange={cents =>
          field.handleChange({ ...field.state.value, amountCents: cents })
        }
        onCurrencyChange={c =>
          field.handleChange({ ...field.state.value, currency: c })
        }
      />
      {field.state.meta.isTouched && !field.state.meta.isValid && (
        <FieldError errors={field.state.meta.errors} />
      )}
    </FieldGroup>
  )}
</form.Field>
```

---

## Mutation Hook Patterns (H1 / H2 / H3)

### Declare `onSuccess` on the hook (H1)

Put `onSuccess` inside `mutation: { onSuccess }` on the hook declaration — not on each `mutateAsync` call site. This fires for every call to that mutation regardless of where it originates, keeps call sites clean, and reads top-to-bottom.

```typescript
const updateGoal = useUpdateGoal({
  mutation: {
    onSuccess: () => {
      toast.success(t('dashboard.goal.updateSuccess'))
      invalidateGoalQueries()   // H3: named helper
      hide()
    },
  },
})

// clean call site:
await updateGoal.mutateAsync({ id, data: result.data })
```

**Do NOT add `onError` here.** The global `MutationCache({ onError: handleApiError })` (in `router.tsx`) already toasts the translated, code-specific domain error. A per-mutation `onError` toast double-toasts with a more generic message. Only add a local `onError` when you deliberately want to suppress or replace the global handler for that specific mutation.

### Combined `isPending` for multi-mutation forms (H2)

When a form controls more than one mutation (create + update + delete), combine their `isPending` flags into one variable so submit/disable logic stays in one place:

```typescript
const isPending = createGoal.isPending || updateGoal.isPending || deleteGoal.isPending
```

### Named invalidation helper (H3)

When multiple mutations on the same form all invalidate the same query set, extract the invalidation into a named function to avoid repetition:

```typescript
const queryClient = useQueryClient()
const invalidateGoalQueries = () => {
  queryClient.invalidateQueries({ queryKey: getGoalQueryKey() })
  queryClient.invalidateQueries({ queryKey: getGoalProgressQueryKey() })
}
// Each mutation's onSuccess calls invalidateGoalQueries()
```

---

## Submit Button Patterns [FRM-P19, FRM-P20]

### Standard Pattern (safeParse-driven)

All forms use `schema.safeParse(values).success` to control the submit button. This ensures the button is only enabled when all required fields pass schema validation:

```typescript
<form.Subscribe selector={state => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting, values: state.values })}>
  {({ canSubmit, isSubmitting, values }) => {
    const isDisabled = !canSubmit || isSubmitting || mutation.isPending || !schema.safeParse(values).success
    return (
      <Button type="submit" disabled={isDisabled}>
        {(isSubmitting || mutation.isPending) && <Spinner className="mr-2" />}
        Save
      </Button>
    )
  }}
</form.Subscribe>
```

### With Tooltip (sign-up / public forms)

For forms where a disabled tooltip is useful:

```typescript
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

<form.Subscribe selector={state => ({ canSubmit: state.canSubmit, isSubmitting: state.isSubmitting, values: state.values })}>
  {({ canSubmit, isSubmitting, values }) => {
    const isDisabled = !canSubmit || isSubmitting || !schema.safeParse(values).success
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-block w-full">
              <Button disabled={isDisabled} className="w-full" type="submit">
                {isSubmitting && <Spinner className="mr-2" />}
                Submit
              </Button>
            </span>
          }
        />
        {isDisabled && <TooltipContent>Fill all fields to continue</TooltipContent>}
      </Tooltip>
    )
  }}
</form.Subscribe>
```

**IMPORTANT: `form.state.values` is NOT reactive (bp-16)**

Never read `form.state.values` directly in the component body — it's a static snapshot that won't trigger re-renders. Always use `form.Subscribe` with a `selector` to get reactive derived values.

---

## Input Masking [FRM-C02, bp-08]

Use **Maskito** (`@maskito/react`) for formatted inputs.

### Key Rules

1. Always use `onInput` (not `onChange`) — Maskito formats before `onInput` fires
2. Check the SDK schema to decide: store formatted or unmasked value?

### Approach 1: Store formatted value (`value` + `onInput`)

When the backend accepts the formatted value as-is:

```typescript
const maskRef = useMaskito({ options: maskOptions })

<Input
  ref={maskRef}
  value={field.state.value ?? ''}
  onBlur={field.handleBlur}
  onInput={e => field.handleChange(e.currentTarget.value)}
/>
```

### Approach 2: Store digits only (`defaultValue` + `unmask`)

When the backend expects clean digits:

```typescript
import { unmask } from '@/lib'

const maskRef = useMaskito({ options: maskOptions })

<Input
  ref={maskRef}
  defaultValue={field.state.value || ''}
  onInput={e => field.handleChange(unmask(e.currentTarget.value))}
  onBlur={field.handleBlur}
/>
```

### Common Masks (from `@/lib/masks`)

| Field | Import | Placeholder |
|-------|--------|-------------|
| Phone | `phoneMaskOptions` | `(00) 00000-0000` |
| CPF | `cpfMaskOptions` | `000.000.000-00` |
| CNPJ | `cnpjMaskOptions` | `00.000.000/0000-00` |
| CPF/CNPJ (dynamic) | `documentMaskOptions` | `000.000.000-00` |
| CEP | `zipCodeMaskOptions` | `00000-000` |
| CRM | `crmMaskOptions` | `123456` |
| RQE | `rqeMaskOptions` | `12345` |

---

## Critical Rules [bp-06, bp-07, bp-14, bp-15, bp-16, bp-17]

### Compose `ComponentProps<'form'>` on every form component (A15)

Form components must forward `className` and native form attributes so parents can place, style, and test-target them. Use the same pattern as component/primitive skills:

```typescript
type XFormProps = React.ComponentProps<'form'> & { /* domain props */ }
function XForm({ domainProp, className, ...props }: XFormProps) {
  return <form className={cn(yourClasses, className)} {...props} onSubmit={...}>
```

Keep the form's own `onSubmit` last in the spread so it always wins over any `onSubmit` in `...props`.

### Never pass a type arg to `useForm` (A6)

`useForm<T>(...)` causes `TS2558 Expected 12 type arguments` and collapses every field type to `never`. Type the `defaultValues` const instead — TanStack infers `TFormData` from it:

```typescript
// WRONG
const form = useForm<FormValues>({ defaultValues })

// RIGHT
const defaultValues: DeepPartial<CreateItemMutationRequest> = { name: '' }
const form = useForm({ defaultValues, ... })  // TFormData inferred from defaultValues
```

### Discriminated/union body — member-driven, NEVER a flat catch-all (A3 / FRM-P43)

When the SDK body is a discriminated/variant union (ShippingFee by `mode`, ConnectIntegration's per-platform credentials), the discriminant is a **selector** and each variant is validated against its **concrete SDK member**. Do NOT flatten the union into an all-optional `uiSchema` or a `z.record(z.string(), z.string())` catch-all that re-declares its members — that discards the contract and hand-rolls shapes (incl. money). That catch-all is a bad practice (`bp-31`).

**(a) The union is a FIELD of the body** → make the form field BE the SDK union via `.pick()`; the discriminant drives conditional rendering, the value comes from the member (no hand-rolled money) — see `ShippingFeeForm`:

```typescript
const formSchema = updateFeesMutationRequestSchema.pick({ shippingFee: true })
const form = useForm({
  defaultValues: { shippingFee: { mode, value: { amountCents, currency } } } as DeepPartial<z.infer<typeof formSchema>>,
  validators: { onChange: formSchema },
})
// ...
<form.Field name="shippingFee.mode">{/* discriminant selector */}</form.Field>
{MODES_WITH_VALUE.includes(mode) && <form.Field name="shippingFee.value">{/* CurrencyInput, SDK-derived */}</form.Field>}
// submit: updateFeesMutationRequestSchema.safeParse({ ...value, effectiveFrom })
```

**(b) The union IS the body** → one small form component per variant (duplication is fine — it keeps each fully typed), typed via `Extract`, validated by the SDK union at submit — see `ConnectIntegrationSheet/CredentialForms`:

```typescript
type ShopifyVariant = Extract<ConnectIntegrationMutationRequest, { platform: 'SHOPIFY'; connectionMode: 'CREDENTIALS' }>
function ShopifyCredentialsForm({ onConnected }: CredentialFormProps) {
  const defaultValues: DeepPartial<ShopifyVariant> = { platform: 'SHOPIFY', connectionMode: 'CREDENTIALS', credentials: { shopDomain: '', clientId: '', clientSecret: '' } }
  const form = useForm({ defaultValues, onSubmit: async ({ value }) => {
    const r = connectIntegrationMutationRequestSchema.safeParse(value) // narrows to the member
    if (!r.success) return
    await connect.mutateAsync({ data: r.data })
  } })
  // ...explicit, concretely-typed fields...
}
// dispatch by variant — a map, never if-chains:
const CREDENTIAL_FORMS = { 'SHOPIFY:CREDENTIALS': ShopifyCredentialsForm, 'TICTO:CREDENTIALS': TictoCredentialsForm }
```

The **whole-member** schema can't be a TanStack `validators.onChange` (`TS2322`) — so shape (b) gates the submit button + submit on `pickUnionVariant(...).safeParse(...)` (which also narrows to the active member). **BUT** when the form edits a single field of the member (the common case — e.g. the `credentials` object), that field's sub-schema (`pickUnionVariantField(...)`) **IS** a valid `onChange`: its input type matches the flat form value. Drive the whole thing with the `@/lib/union` helpers — see **FRM-P44** below.

### Drive a discriminated union with `@/lib/union` helpers (FRM-P44)

When a form drives a discriminated SDK union, reach for the generic helpers in `@/lib/union` instead of hand-rolling introspection or maintaining a parallel schema. Three helpers, one per need:

- **`unionVariantValues(union, 'connectionMode')`** — the discriminant's possible values across all members. Use it to drive a selector.
- **`pickUnionVariant(union, { platform, connectionMode }).safeParse(envelope)`** — validates the **whole** member. This is the submit gate for a union-as-body form (shape (b)). It is **not** a `validators.onChange` (the member type can't satisfy that — `TS2322`).
- **`pickUnionVariantField(union, { platform, connectionMode }, 'credentials')`** — that member's **field** sub-schema. Because its input type matches the flat field value, it **IS** a valid `validators.onChange`. It also doubles as the `.safeParse` source for that field **and** the form's value type via `type ShopifyCredentials = z.infer<typeof credentialsSchema>` — one source for type, validation, and parse.

So a single-field connect form (e.g. `credentials`) validates the field on change with `pickUnionVariantField(...)`, derives its value type from that same schema, then on submit builds the envelope and validates the whole member with `pickUnionVariant(...).safeParse(...)`. Never hand-roll the union introspection, an all-optional catch-all, or an `Extract<>` type sitting next to a separately hand-written validation schema — those drift from the contract.

See `packages/app/react/src/lib/union.ts` for the helpers, and the exemplars: `ConnectIntegrationSheet/platforms/{shopify,shopify-payments,ticto}/credentials.tsx` (field sub-schema as `onChange`) and `ShippingFeeForm.tsx` (union-as-field via `.pick()`).

### Use SDK Schema for Validation — NEVER manual rules

See `bp-05` and `FRM-01` in registry.yaml for the wrong/right pattern.

### Use Project Primitives — NEVER native HTML elements (bp-07)

See `bp-07` in registry.yaml for the wrong/right pattern.

### Check Invalid State Properly

See `FRM-P04` in registry.yaml for the pattern.

### Always Invalidate Cache After Mutation — use query key functions (A4)

Use the SDK-generated query key function, never a hardcoded object literal:

```typescript
// WRONG
queryClient.invalidateQueries({ queryKey: [{ url: '/api/products' }] })

// RIGHT
queryClient.invalidateQueries({ queryKey: listProductsQueryKey() })
```

See `FRM-P09` in registry.yaml for the wrong/right pattern.

### Never add per-mutation `onError` toast (H1-caveat)

The global `MutationCache({ onError: handleApiError })` (in `router.tsx`) already toasts the translated domain error. A local `onError` toast double-toasts with a more generic message. Keep errors global.

See `bp-06` in registry.yaml for the wrong/right pattern.

### Default String Fields to `''` When Using `.refine()` (bp-15)

Zod evaluates checks in order: `z.string()` → `.min()` → `.refine()`. If the value is `undefined`, it fails at `z.string()` with a generic error and the `.refine()` custom error never shows.

See `bp-15` in registry.yaml for the wrong/right pattern.

### Always Use `?? ''` on Input `value` Props (bp-17)

When default values are `undefined` (as required by DeepPartial defaults), `field.state.value` starts as `undefined`. React treats `value={undefined}` as an uncontrolled input. When the user types, it becomes `value="text"` (controlled), triggering the React warning: "A component is changing an uncontrolled input to be controlled."

Always use `?? ''` to ensure the input is always controlled. For Combobox/Select fields, use `|| null` instead (already the existing pattern).

See `bp-17` in registry.yaml for the wrong/right pattern.

### Use Maskito Masks for Formatted Fields (bp-08)

CPF, RG, phone, CNPJ, CEP fields MUST use Maskito masks from `@/lib/masks`.

### Extract Step Schemas from Complete/Strict Schema (bp-13)

Never extract from save/draft schemas (all fields optional). Always from the complete mutation schema to enforce required fields at each step.

### Manual Zod Validation in Steps (bp-12)

When defaults are partial/empty and `validators.onChange` conflicts with `DeepPartial` types, validate manually:

```typescript
import { type DeepKeys } from '@tanstack/react-form'

const form = useForm({
  defaultValues: formDefaults,    // DeepPartial<StepData>
  // NO validators.onChange here
  onSubmit: async form => {
    const parsed = StepSchema.safeParse(form.value)
    if (!parsed.success) {
      const errorsByField: Record<string, string[]> = {}
      for (const issue of parsed.error.issues) {
        const fieldPath = issue.path.map(String).join('.')
        if (!errorsByField[fieldPath]) errorsByField[fieldPath] = []
        errorsByField[fieldPath].push(issue.message)
      }
      for (const [fieldPath, messages] of Object.entries(errorsByField)) {
        form.setFieldMeta(fieldPath as DeepKeys<typeof formDefaults>, prev => ({
          ...prev,
          errorMap: { onChange: messages.join(', ') },
        }))
      }
      return
    }
    onSubmit(parsed.data)
  },
})
```

---

## Checklist

- [ ] All `when: always` patterns present (FRM-01 through FRM-03 — verify against registry.yaml)
- [ ] Each conditional pattern evaluated (FRM-C01 through FRM-C05 — check which apply)
- [ ] No `bad_practices` violations (bp-01 through bp-17 — verify against registry.yaml)
- [ ] Form component typed as `ComponentProps<'form'> & { …domain }`, forwards `className` + `...props` (A15)
- [ ] `useForm` has no type argument; `defaultValues` const is typed `DeepPartial<Req>` (A6)
- [ ] `onSuccess` declared on the mutation hook, not on `mutateAsync` call sites (H1)
- [ ] No `onError` toast on the mutation — global `MutationCache` handles it (H1-caveat)
- [ ] Enum fields use enum-driven mode on `<Select>` / `<Combobox>` / `<ToggleGroup>` with `enum=` + `i18nPrefix=` (A13 / FRM-P09)
- [ ] Money fields use `<CurrencyInput>` (A12)
- [ ] Edit form receives entity as `NonNullable<GetXQueryResponse['x']>` prop, not a hand-rolled interface (A14)

## Composition Pattern — Multi-step wizard (onboarding)

**Behavior example.** A new doctor signs up in 4 steps: personal data → specialty + CRM → link to clinics → review.

**Recipe.**
- Frontend
  - `route` `/onboarding/doctor`
  - `component` `DoctorOnboardingWizard` — orchestrates steps via state
  - `form` `DoctorOnboardingForm` — multi-step with field arrays
  - `store` `doctorOnboardingStore` — holds partial data across steps (Zustand, with the `persist` middleware nuances in the `/store` skill)
- Backend
  - `controller` `POST /doctors/onboarding/start` (creates draft)
  - `controller` `POST /doctors/onboarding/finalize` (commits everything)
  - `usecase` `StartDoctorOnboarding`, `FinalizeDoctorOnboarding`
  - `entity` `Doctor` with state `ONBOARDING` → `ACTIVE`
  - `value-object` `CRM` (with validation)

Instead of partial saves on the backend, the local store holds state; only the `finalize` step round-trips. The partial data is **client state**, not server state, until the user confirms.

---

## Quick-reference: canon deviations

The table below maps every issue code from the dossier to its canonical rule in this doc. Use it when reviewing or fixing existing forms.

| Code | Issue | Canonical rule |
|------|-------|----------------|
| A1 | Local `z.object` redefining SDK body | SDK schema in `validators.onChange`; no local `z.object` in form files |
| A2 | Flat field names for nested body | Dot-notation field names (`name="revenueTax.type"`) match the schema shape |
| A3 | Discriminated/union body | Member-driven: `.pick()` the union field (discriminant selector + conditional member fields) OR one form per variant typed via `Extract`, validated by the SDK union's `safeParse`. NEVER a flat catch-all / `z.record` (`bp-31`) — see "Discriminated/union body" rule |
| A4 | Hardcoded `queryKey` object literal | Always use `listXQueryKey()` / `getXQueryKey(args)` from the SDK |
| A5 | `as DeepPartial`, `as FormValues`, `as never` casts | Typed `const defaultValues: DeepPartial<Req>` — no casts |
| A6 | `useForm<T>(...)` type argument | Never pass a type arg to `useForm`; type `defaultValues` instead |
| A12 | Split currency `<Select>` + amount `<Input>` | Use `<CurrencyInput>` for any `{ amountCents, currency }` field |
| A13 | Per-form `Object.values(Enum).map(…)` + `as <Enum>` cast at `onValueChange` | Use enum-driven mode: `<Select enum={XEnum} i18nPrefix="enums.X" … />` / `<Combobox enum=…>` / `<ToggleGroup enum=…>` — `isEnumValue` guard, no cast |
| A14 | Hand-rolled `*InitialValues` interface | `props: NonNullable<GetXQueryResponse['x']>`; `defaultValues: DeepPartial<WriteDto>` |
| A15 | Form root ignores `className` / native attrs | `type Props = ComponentProps<'form'> & { domain }` + `cn(…, className)` + `{...props}` |
| H1 | `onSuccess` on `mutateAsync` call sites | Declare in `mutation: { onSuccess }` on the hook |
| H1-caveat | Per-mutation `onError` toast | Remove — global `MutationCache.onError` handles it |
| H2 | Scattered `isPending` per mutation | `const isPending = a.isPending \|\| b.isPending` |
| H3 | Duplicated `invalidateQueries` calls | Extract named helper `invalidateXQueries()` |

## References

- `packages/app/react/src/routes/onboarding/` — Multi-step wizard: parent orchestration, step config, progressive save
- `packages/app/react/src/routes/onboarding/-stores/useOnboardingStore.ts` — Navigation store
- `packages/app/react/src/routes/onboarding/-components/DoctorInfoStep/` — Schema extraction, array fields, form type inference
- `packages/app/react/src/routes/onboarding/-components/ClinicStep/` — Schema extraction with `.pick()`
- `packages/app/react/src/routes/onboarding/-components/UnitStep/` — Nested object fields (address)
- `packages/app/react/src/routes/sign-up/-components/SignUpForm/` — Single form with masks and schema extension
- `packages/app/react/src/routes/(app)/patients/-components/PatientListSection/CreatePatientDialog/` — Create dialog with multiple masks
- `packages/app/react/src/routes/(app)/services/-components/LeftColumn/ServiceList/CreateServiceDialog/` — Create dialog with Select, number fields
- `packages/app/react/src/routes/(app)/settings/-components/UpdateUnitDialog/` — Edit dialog with address fields
- `packages/app/react/src/routes/(app)/agenda/-components/CreateAppointmentDialog/` — Complex form with extracted field components, Zustand store, conditional schemas
