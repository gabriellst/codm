---
name: component (mobile)
description: Create a React Native component for the Expo app (packages/app/expo/app/<route>/-components/) that owns its own data. Reads URL via useLocalSearchParams / useTypedSearchParams, fetches via SDK hooks, navigates via useRouter. Use for tab sections, lists, cards, filter rows in the mobile stack.
---

> **Parent**: [`../SKILL.md`](../SKILL.md) — cross-platform mental model.
> **BEFORE IMPLEMENTING**: Open [`./registry.yaml`](./registry.yaml) and read `patterns` + `bad_practices`.

# Create Mobile Component (route-scoped, RN + Uniwind)

Creates a React Native component that owns its data and actions, living under `packages/app/expo/app/<route>/-components/<Name>/index.tsx`.

## Core Mental Model

| Need                                       | Source                            | How                                                                                  |
| ------------------------------------------ | --------------------------------- | ------------------------------------------------------------------------------------ |
| Dynamic segment (`[id]`)                   | Path params                       | `const { id } = useLocalSearchParams<{ id: string }>()`                              |
| Query params (filters, tab, page)          | Typed query params (zod)          | `const [{ tab }, setParams] = useTypedSearchParams(schema)` from `@/lib/typed-route` |
| Update URL state                           | Router                            | `router.push({ pathname, params })` from `useRouter()` or `setParams(...)`           |
| Client state (UI toggles, shared IDs)      | Zustand store                     | `useStore(s => s.value)`                                                             |
| Server data                                | React Query / SDK hook            | `useListX(...)` / `useGetX(...)`                                                     |
| Mutations                                  | React Query / SDK mutation hook   | `useMutation(...)` / SDK mutation hook                                               |

**No prop drilling.** React Query deduplicates duplicate query keys — if `BigStatsRow` and `CalendarSection` both call `useGetProgress({ params: { period } })`, only one network request fires.

## Decision rule: owns query vs receives props

**"Am I rendered N times in a `.map()`?"**
- **No** → owns its query.
- **Yes** → receives a single item via props.

The leaf component CAN own mutations (delete button, toggle) but doesn't re-fetch the item it received.

## Folder structure

```
app/(tabs)/progress/
├── index.tsx
├── _layout.tsx
├── -components/
│   ├── PeriodPicker/index.tsx              # Reads store, writes store — no SDK call
│   ├── BigStatsRow/index.tsx               # Owns its useGetProgress call
│   ├── CalendarSection/index.tsx
│   └── PRsSection/
│       ├── index.tsx                       # Owns the list query
│       └── PRCard/index.tsx                # Leaf — receives one PR via props
└── -stores/
    └── period-store.ts                     # NOT _stores
```

Conventions:
- **Folder per component** (`PeriodPicker/index.tsx`), not `PeriodPicker.tsx`.
- **PascalCase folders**.
- **Dash prefix on `-components`, `-stores`, `-hooks`** to mark them as route-private. (The `_stores` variant was removed from the repo.)

## Process

### Step 1: Check existing primitives

**Always** check `packages/app/expo/components/ui/` first. Run `ls packages/app/expo/components/ui/` BEFORE creating any component.

#### RN/HTML-like → Primitive Mapping

| What you'd naively reach for          | Primitive                              | Import                                                                |
| ------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| `<Pressable>` styled like a CTA       | `Button`                               | `@/components/ui/Button`                                              |
| `<View>` styled as a card             | `Card` / `CardHeader` / `CardBody`     | `@/components/ui/Card`                                                |
| Raised gradient-stroked card          | `GradientCard`                         | `@/components/ui/GradientCard`                                        |
| Status pill / chip                    | `Pill`                                 | `@/components/ui/Pill`                                                |
| `<TextInput>` standalone or grouped   | `Input`, `InputGroup`, `InputPrefix`   | `@/components/ui/Input`                                               |
| `<Text>` with design typography       | `Text` (with `variant` prop)           | `@/components/ui/Text`                                                |
| Eyebrow / kicker label                | `Eyebrow`                              | `@/components/ui/Eyebrow`                                             |
| Big display number / title            | `DisplayTitle`                         | `@/components/ui/DisplayTitle`                                        |
| In-page bottom sheet (no URL change)  | `Sheet`                                | `@/components/ui/Sheet`                                               |
| Tab-screen empty state                | `EmptyState`                           | `@/components/ui/EmptyState`                                          |
| Screen-level error / retry            | `ScreenError`                          | `@/components/ui/ScreenError`                                         |
| Screen-level skeleton                 | `ScreenSkeleton`                       | `@/components/ui/ScreenSkeleton`                                      |
| Toggle row in settings                | `ToggleRow`                            | `@/components/ui/ToggleRow`                                           |
| Stat card                             | `StatCard`                             | `@/components/ui/StatCard`                                            |
| Numeric form field                    | `NumField`                             | `@/components/ui/NumField`                                            |
| Iconography                           | `Icons` (project SVG set)              | `@/components/ui/Icons`                                               |
| Liquid-glass blur surface             | `LiquidGlass`                          | `@/components/ui/LiquidGlass`                                         |

### Step 2: Read params + fetch data inside the component

#### Reading query params (typed)

For screens that already use `useTypedSearchParams` in the route, components can either:

- Re-read params via the same hook with the same schema (cheap — the hook memoizes on `raw`), **or**
- Read them via plain `useLocalSearchParams` if they only need the raw value.

```tsx
import { z } from 'zod'
import { useTypedSearchParams } from '@/lib/typed-route'

const schema = z.object({
  tab: z.enum(['workouts', 'prs']).default('workouts'),
})

export function ProgressPRSection() {
  const [{ tab }, setParams] = useTypedSearchParams(schema)
  const { data } = useListPRs({ params: { tab } })
  // ...
}
```

#### Reading path params

```tsx
import { useLocalSearchParams } from 'expo-router'

export function ExerciseDetailHeader() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data } = useGetExercise({ params: { id } })
  // ...
}
```

#### Reading client state (Zustand)

This is the exact pattern from `packages/app/expo/app/(tabs)/progress/-components/PeriodPicker/index.tsx`:

```tsx
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PeriodEnum, type Period } from '@template/client-typescript/typescript'
import { Card } from '@/components/ui/Card'
import { letterSpacingPt } from '@/lib/tokens'
import { usePeriodStore } from '@/app/(tabs)/progress/-stores/period-store'

export function PeriodPicker() {
  const period = usePeriodStore(s => s.period)
  const setPeriod = usePeriodStore(s => s.setPeriod)

  return (
    <View className="flex-row gap-2 px-4 mb-4">
      {Object.values(PeriodEnum).map(p => (
        <PeriodChip key={p} period={p} active={period === p} onPress={() => setPeriod(p)} />
      ))}
    </View>
  )
}

interface PeriodChipProps {
  period: Period
  active: boolean
  onPress: () => void
}

function PeriodChip({ period, active, onPress }: PeriodChipProps) {
  const { t } = useTranslation()
  return (
    <Card
      variant={active ? 'surface2' : 'surface1'}
      padding="none"
      className={['flex-1 py-2 items-center', active ? 'border-white/30' : ''].join(' ')}
      onTouchEnd={onPress}
    >
      <Text
        className={['font-sans-bold text-[10px] uppercase', active ? 'text-fg-0' : 'text-fg-2'].join(' ')}
        style={{ letterSpacing: letterSpacingPt(0.18, 10) }}
      >
        {t(`enums.period.${period}`)}
      </Text>
    </Card>
  )
}
```

Note how `PeriodPicker` itself uses iteration over `PeriodEnum` (the SDK enum) and `PeriodChip` is a local leaf component receiving the single `period`/`active` props — exactly the parent-owns-list / leaf-receives-item pattern.

The store at `packages/app/expo/app/(tabs)/progress/-stores/period-store.ts`:

```tsx
import { create } from 'zustand'
import { PeriodEnum, type Period } from '@template/client-typescript/typescript'

interface PeriodState { period: Period }
interface PeriodActions { setPeriod: (period: Period) => void }
type PeriodStore = PeriodState & PeriodActions

export const usePeriodStore = create<PeriodStore>(set => ({
  period: PeriodEnum.P_8W,
  setPeriod: period => set({ period }),
}))
```

### Step 3: Render with skeleton → empty → list ternary

```tsx
import { View, ScrollView } from 'react-native'
import { Text } from '@/components/ui/Text'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { useListWorkouts } from '@template/client-typescript/typescript'
import { WorkoutCard } from './WorkoutCard'

function SkeletonRows() {
  return (
    <View className="flex-col gap-3 px-5">
      {[1, 2, 3, 4].map(key => (
        <View key={key} className="h-24 rounded-lg bg-surface-1/60" />
      ))}
    </View>
  )
}

export function WorkoutList() {
  const { data } = useListWorkouts()

  return (
    <View className="flex-col gap-3">
      {/* Static UI always visible */}
      <Text variant="kicker" className="px-5">Treinos</Text>

      {/* Data-dependent area */}
      {data ? (
        data.items.length === 0 ? (
          <EmptyState title="Nenhum treino" />
        ) : (
          data.items.map(w => <WorkoutCard key={w.id} workout={w} />)
        )
      ) : (
        <SkeletonRows />
      )}
    </View>
  )
}
```

The `SkeletonRows` function is local, never exported — exactly the rule from the web side.

### Step 4: Navigate / open sheets / push detail screens

```tsx
import { useRouter } from 'expo-router'

export function WorkoutCard({ workout }: { workout: WorkoutItem }) {
  const router = useRouter()
  return (
    <Pressable onPress={() => router.push({ pathname: '/workout/[id]', params: { id: workout.id } })}>
      {/* ... */}
    </Pressable>
  )
}

// Opening a sheet route (NOT a "dialog"):
const router = useRouter()
router.push('/(sheets)/start-session')
```

With `experiments.typedRoutes: true`, the `pathname` is type-checked.

### Step 5: Mutations — `mutateAsync` + haptic + invalidate

```tsx
import { useQueryClient } from '@tanstack/react-query'
import { Haptics } from 'react-native-nitro-haptics'
import { useDeleteWorkout, listWorkoutsQueryKey } from '@template/client-typescript/typescript'

export function WorkoutCard({ workout }: { workout: WorkoutItem }) {
  const deleteWorkout = useDeleteWorkout()
  const queryClient = useQueryClient()

  const handleDelete = async () => {
    await deleteWorkout.mutateAsync({ id: workout.id }, {
      onSuccess: () => Haptics.notification('success'),
      onSettled: () => queryClient.invalidateQueries({ queryKey: listWorkoutsQueryKey() }),
    })
  }
  // ...
}
```

Use haptics for tactile feedback instead of toast (which doesn't exist as a primitive on this stack).

## State Decision Guide

| State Type                              | Where             | Example                                      |
| --------------------------------------- | ----------------- | -------------------------------------------- |
| Filters / selected tab / pagination     | Query params      | `?tab=workouts&page=2`                       |
| Shared IDs / current selection          | Zustand store     | `period` in `usePeriodStore`, `channelId`    |
| UI toggles spanning multiple components | Zustand store     | `isAddSheetOpen`, `isEditing`                |
| Ephemeral UI (hover, focus, animation)  | `useState`        | `isExpanded`, `hovered`                      |

## Critical Rules

### Open/Closed — derive options from SDK enums

```tsx
import { PeriodEnum, type Period } from '@template/client-typescript/typescript'
{Object.values(PeriodEnum).map(p => <PeriodChip key={p} period={p} ... />)}

// or, when the labels live in i18n:
const { t } = useTranslation()
<Text>{t(`enums.period.${period}`)}</Text>
```

### DRY local — extract repeated JSX

```tsx
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-center justify-between py-2">
      <Text variant="kicker">{label}</Text>
      <Text variant="amount">{value}</Text>
    </View>
  )
}
```

### Use `cn()` for conditional classes

```tsx
import { cn } from '@/lib/utils'

<View className={cn('rounded-lg p-4', isActive && 'border border-white/30', error && 'bg-accent-danger/10')} />
```

### Accessibility on icon-only Pressables

```tsx
<Pressable onPress={onClose} accessibilityLabel="Fechar" hitSlop={10}>
  <IconClose size={iconSize.xl} color={fg.fg0} />
</Pressable>
```

**No shared constants file** for `accessibilityLabel`s — use inline strings.

### Sheets, not dialogs

```tsx
// WRONG — there is no Dialog primitive on mobile
import { Dialog } from '@/components/ui/Dialog'

// CORRECT — push a sheet route
const router = useRouter()
router.push('/(sheets)/start-session')

// or — use the in-page Sheet primitive for ephemeral filters
import { Sheet } from '@/components/ui/Sheet'
<Sheet open={open} onClose={() => setOpen(false)} title="Filtros">
  {/* sheet body */}
</Sheet>
```

### Store folder is `-stores`, never `_stores`

```
progress/
├── -stores/period-store.ts   # CORRECT
└── _stores/                  # WRONG — was removed from the repo
```

## File Naming & Structure

- **Folder per component**: `ComponentName/index.tsx`
- **PascalCase folders**
- **Colocate subcomponents** under their parent folder
- **`-components/`, `-stores/`, `-hooks/`** — dash prefix for route-private files

## Checklist

- [ ] All `when: always` patterns present (verify against registry.yaml)
- [ ] Each conditional pattern evaluated
- [ ] No `bad_practices` violations
- [ ] Ran `ls packages/app/expo/components/ui/` BEFORE creating component
- [ ] Component fetches its own data (no data props from parent)
- [ ] Query params via `useTypedSearchParams(schema)` or path params via `useLocalSearchParams`
- [ ] Mutations handled internally with haptic + invalidate
- [ ] Icon-only Pressables have `accessibilityLabel`
- [ ] No `StyleSheet.create({...})` for static styling — use `className`
- [ ] Stores folder is `-stores` (not `_stores`)
- [ ] Modals are sheets (route-based or `Sheet` primitive) — never "dialog"

## References

- `packages/app/expo/components/ui/` — Primitive components
- `packages/app/expo/app/(tabs)/progress/-components/PeriodPicker/index.tsx` — Reference (store-driven leaf-renderer)
- `packages/app/expo/app/(tabs)/progress/-stores/period-store.ts` — Route-private store
- `packages/app/expo/lib/tokens.ts` — Tokens
- `packages/app/expo/lib/typed-route.ts` — `useTypedSearchParams`
- `packages/app/expo/FRONTEND_ARCHITECTURE.md`
- `/route` (mobile), `/store`, `/primitive` (mobile), `/form` skills
