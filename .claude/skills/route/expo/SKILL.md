---
name: route (mobile)
description: Create an Expo Router screen in the mobile/Expo/React Native app (packages/app/expo/app/). Use when adding tab screens, dynamic detail screens, sheet routes, and layouts. Covers typed routes, useTypedSearchParams, <Protected>, Stack / NativeTabs / pageSheet presentation.
---

> **Parent**: [`../SKILL.md`](../SKILL.md) — cross-platform mental model.
> **BEFORE IMPLEMENTING**: Open [`./registry.yaml`](./registry.yaml) and read `patterns` + `bad_practices`.

# Create Expo Router Screen

Creates a new screen in `packages/app/expo/app/` with proper Expo Router configuration, typed routes, Zod-validated query params, and (when needed) session gating via `<Protected>`.

## Why screens are thin shells

- Screens define the URL contract: pathname (file path), dynamic segments (`[id].tsx`), validated query params.
- Screens render layout and decide WHICH components appear based on state.
- Screens do NOT fetch data for components — each component owns its own SDK hook.
- Components read params via `useLocalSearchParams` or `useTypedSearchParams`, navigate via `useRouter`.
- Types come from the SDK (`@codedm/client-typescript/typescript`). Inline route-specific types in the screen file.

## When to use this skill

- Adding a new screen the user can navigate to (a tab screen, a dynamic detail screen, a sheet route).
- Wrapping a screen group with a layout (`_layout.tsx` for nested Stack / NativeTabs).
- Adding URL-driven state (selected tab, filter ID, pagination).

## When NOT to use this skill

- UI components → `/component` (mobile)
- Design system primitives → `/primitive` (mobile)
- Forms → `/form`
- Zustand stores → `/store`

## Prerequisites

- SDK is generated. Hooks/types live in `@codedm/client-typescript/typescript`.
- `experiments.typedRoutes: true` is enabled in `packages/app/expo/app.json`. This gives `expo-router` compile-time path safety (no string typos in `router.push({ pathname })`).
- For type-safe **query params**, use the project helper `useTypedSearchParams` from `packages/app/expo/lib/typed-route.ts` — Expo Router does not auto-type query params even with typed routes on.

## Key Principles [RTE-01..RTE-04]

1. **Screen is a thin shell** — defines navigation contract + layout. Components fetch their own data.
2. **SDK is law** — Zod schemas from the SDK validate query params. Never hardcode types.
3. **URL state for deep-linkable filters / tabs** — encode into query params; use Zustand only for ephemeral UI state.
4. **Components own data** — each component calls its own SDK hook. React Query deduplicates.
5. **Auth gating is a screen-level concern** — use `<Protected>` for individual screens. The entry-point redirect in `app/index.tsx` handles initial routing.

## File layout

```
packages/app/expo/app/
├── _layout.tsx               # Root Stack — registers tabs, sheet routes, full-screen modals
├── index.tsx                 # Auth-redirect entry (isAuthenticated → /(tabs)/home, else /(auth)/login)
├── (auth)/
│   └── login.tsx             # Group route, no path segment
├── (tabs)/
│   ├── _layout.tsx           # NativeTabs (iOS native bottom tabs with liquid glass)
│   ├── home/
│   │   ├── _layout.tsx       # Per-tab Stack — header config (Pattern A or B)
│   │   └── index.tsx         # Screen body
│   └── progress/
│       ├── _layout.tsx
│       ├── index.tsx
│       ├── -components/      # Route-private components (dash prefix)
│       │   └── PeriodPicker/
│       │       └── index.tsx
│       └── -stores/          # Route-private Zustand stores (NOT _stores)
│           └── period-store.ts
├── (sheets)/                 # Group route for native iOS sheet presentations
│   ├── add-exercise.tsx
│   └── start-session.tsx
└── active-exercise/
    └── [id].tsx              # Dynamic detail screen
```

**Folder convention (mobile-specific, same as web):**
- `-components/` for route-private components (dash prefix marks them private)
- `-stores/` for Zustand stores (the previous `_stores` variant was deleted — do not use it)
- `-hooks/` for route-private hooks

## Process

### Step 1: Decide the route shape

| Shape                | File                                                         | Example                                              |
| -------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| Tab screen           | `app/(tabs)/<tab>/index.tsx` + `_layout.tsx`                 | `app/(tabs)/progress/index.tsx`                      |
| Detail screen        | `app/<feature>/[id].tsx`                                     | `app/active-exercise/[id].tsx`                       |
| Sheet (native iOS)   | `app/(sheets)/<name>.tsx` + register in `app/_layout.tsx`    | `app/(sheets)/add-exercise.tsx`                      |
| Auth flow            | `app/(auth)/<name>.tsx`                                      | `app/(auth)/login.tsx`                               |
| Group (no segment)   | Wrap files in `(group-name)/`                                | `(tabs)`, `(auth)`, `(sheets)`                       |
| Layout               | `_layout.tsx` at the group/folder root                       | `app/_layout.tsx`, `app/(tabs)/progress/_layout.tsx` |

### Step 2: Screen body

A typical tab screen:

```tsx
// packages/app/expo/app/(tabs)/progress/index.tsx
import { ScrollView, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useGetProgress } from '@codedm/client-typescript/typescript'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { HalftoneBandsPattern } from '@/components/ui/HalftoneBandsPattern'
import { ScreenError } from '@/components/ui/ScreenError'
import { usePeriodStore } from './-stores/period-store'
import { PeriodPicker } from './-components/PeriodPicker'
import { BigStatsRow } from './-components/BigStatsRow'

export default function ProgressTab() {
  const { t } = useTranslation()
  const period = usePeriodStore(s => s.period)
  const { error, refetch } = useGetProgress({ params: { period } })

  if (error) return <ScreenError onRetry={() => void refetch()} />

  return (
    <View className="flex-1 bg-bg-0">
      <HalftoneBandsPattern strength={0.55} />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} className="flex-1">
        <View className="px-5 pb-4"><Eyebrow>{t('progress.eyebrow')}</Eyebrow></View>
        <PeriodPicker />
        <BigStatsRow />
      </ScrollView>
    </View>
  )
}
```

Note: the screen orchestrates layout + a single `useGetProgress` call to know whether to render `<ScreenError>`. Each row component (`BigStatsRow`, `CalendarSection`, `PRsSection`) fetches its own data when needed.

### Step 3: Type-safe query params with `useTypedSearchParams`

`expo-router`'s `experiments.typedRoutes` types pathnames and dynamic segments but NOT query params. Use the project helper at `packages/app/expo/lib/typed-route.ts`:

```tsx
import { z } from 'zod'
import { useTypedSearchParams } from '@/lib/typed-route'

const schema = z.object({
  tab: z.enum(['workouts', 'prs']).default('workouts'),
  page: z.coerce.number().int().min(1).default(1),
})

export default function Screen() {
  const [{ tab, page }, setParams] = useTypedSearchParams(schema)

  return (
    <View>
      {/* ... */}
      <Button label="Next" onPress={() => setParams({ page: page + 1 })} />
    </View>
  )
}
```

Rules:
- Every field must have a `.default(...)` — the hook falls back to `schema.parse({})` on invalid input, which keeps screens crash-free when a deep link arrives with garbage params.
- For SDK-backed schemas, compose: `sdkSchema.merge(z.object({ ...frontendOnly }))`.

### Step 4: Path params via `useLocalSearchParams`

Dynamic segments (`[id].tsx`) use `useLocalSearchParams` directly:

```tsx
import { useLocalSearchParams } from 'expo-router'

export default function ActiveExerciseScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data } = useGetExercise({ params: { id } })
  // ...
}
```

### Step 5: Navigation

```tsx
import { useRouter } from 'expo-router'

const router = useRouter()
router.push({ pathname: '/active-exercise/[id]', params: { id: exerciseId } })
router.push('/(tabs)/home')                                 // typedRoutes catches typos
router.back()
```

### Step 6: Session gating with `<Protected>`

The entry-point redirect lives in `app/index.tsx`:

```tsx
// packages/app/expo/app/index.tsx
import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useSession } from '@/lib/auth'
import { fg } from '@/lib/tokens'

export default function Index() {
  const { isLoading, isAuthenticated } = useSession()
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-bg-0">
        <ActivityIndicator color={fg.fg0} />
      </View>
    )
  }
  return <Redirect href={isAuthenticated ? '/(tabs)/home' : '/(auth)/login'} />
}
```

For individual screens, use the declarative gate at `packages/app/expo/components/Protected.tsx`:

```tsx
import { Protected } from '@/components/Protected'

export default function ProfileScreen() {
  return (
    <Protected>
      <ProfileContent />
    </Protected>
  )
}
```

`<Protected>` reads `useSession()` once, renders a centered `ActivityIndicator` during boot, and `<Redirect>`s unauthenticated users to `/(auth)/login`. It defends against mid-session expiry, deep links into private routes, and direct navigations that bypass the index.

## Layouts (`_layout.tsx`)

### Root Stack — `app/_layout.tsx`

Registers every screen and configures presentation. This is also where **sheet routes** are wired with `presentation: 'pageSheet'`:

```tsx
// packages/app/expo/app/_layout.tsx (excerpt)
import { Stack } from 'expo-router'
import { fg, surfaces } from '@/lib/tokens'

export default function RootLayout() {
  // ... fonts, query client, push registration

  return (
    <QueryClientProvider client={queryClient}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: 'transparent' },
          headerTintColor: fg.fg0,
          contentStyle: { backgroundColor: surfaces.bg0 },
          animation: 'default',
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ headerShown: false, animation: 'fade' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

        {/* Sheet routes — registered with pageSheet presentation */}
        <Stack.Screen
          name="(sheets)/add-exercise"
          options={{
            presentation: 'pageSheet',
            headerShown: false,
            sheetGrabberVisible: true,
            sheetAllowedDetents: [0.6, 0.95],
            sheetCornerRadius: 24,
            sheetExpandsWhenScrolledToEdge: false,
            contentStyle: { backgroundColor: surfaces.surface1 },
          }}
        />
        {/* ...more (sheets) ... */}

        {/* Dynamic detail screen */}
        <Stack.Screen
          name="active-exercise/[id]"
          options={{
            headerShown: true,
            headerTransparent: true,
            headerStyle: { backgroundColor: 'transparent' },
            headerTitle: '',
            headerBackTitle: 'Voltar',
          }}
        />
      </Stack>
    </QueryClientProvider>
  )
}
```

### Tabs — `app/(tabs)/_layout.tsx`

Use `NativeTabs` from `expo-router/unstable-native-tabs` (SDK 55+) for native iOS bottom tabs with liquid-glass material:

```tsx
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { fg, font, fs } from '@/lib/tokens'

export default function TabLayout() {
  return (
    <NativeTabs
      blurEffect="systemUltraThinMaterialDark"
      backgroundColor="rgba(10,10,11,0.55)"
      tintColor={fg.fg0}
      labelStyle={{ fontFamily: font.sansBold, fontSize: fs.micro }}
    >
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Label>Início</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="progress">
        <NativeTabs.Trigger.Label>Progresso</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.bar.fill" />
      </NativeTabs.Trigger>
      {/* ... */}
    </NativeTabs>
  )
}
```

`NativeTabs.Trigger.Icon` takes `sf="<SF Symbol name>"` — these are real UIKit SF Symbols, not bundled assets.

### Per-tab Stack — `app/(tabs)/<tab>/_layout.tsx`

`NativeTabs` does not nest stacks for its triggers — each tab is a leaf inside the tab navigator. To get a per-tab native nav header (large title + transparent + blur, with scroll-collapse) every tab lives in its own folder with a local `_layout.tsx`:

```tsx
// packages/app/expo/app/(tabs)/progress/_layout.tsx
import { Stack } from 'expo-router'
import { LogoMark } from '@/components/ui/LogoMark'
import { fg, surfaces } from '@/lib/tokens'
import { headerLargeTitleStyle, headerTitleStyle } from '@/lib/screen-styles'

export default function ProgressTabLayout() {
  return (
    <Stack
      screenOptions={{
        headerTransparent: true,
        headerStyle: { backgroundColor: 'transparent' },
        headerLargeStyle: { backgroundColor: 'transparent' },
        headerTintColor: fg.fg0,
        headerTitleStyle,
        headerLargeTitleStyle,
        contentStyle: { backgroundColor: surfaces.bg0 },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          headerLargeTitle: true,
          headerTitle: 'Progresso',
          headerLeft: () => <LogoMark />,
        }}
      />
    </Stack>
  )
}
```

Two header patterns (per `FRONTEND_ARCHITECTURE.md` §7.1):

- **Pattern A — large-title nav** (`progress`, `history`, `profile`): `headerLargeTitle: true`, large Anton title collapses on scroll.
- **Pattern B — transparent nav with custom items** (`home`, `workout`): `headerLargeTitle: false`, custom `headerLeft` / `headerRight` (or `unstable_headerRightItems` for native UIKit bar buttons).

## Sheets (mobile = pageSheet, NEVER "dialog")

Mobile modals are **sheets** — register them as `Stack.Screen` with `presentation: 'pageSheet'` in `app/_layout.tsx`. The screen body itself is a normal React Native component; presentation comes from the Stack options:

```tsx
// packages/app/expo/app/(sheets)/start-session.tsx
import { View } from 'react-native'
import { Text } from '@/components/ui/Text'
import { Button } from '@/components/ui/Button'

export default function StartSessionSheet() {
  return (
    <View className="flex-1 px-5 py-6 gap-4">
      <Text variant="title">Iniciar treino</Text>
      {/* ... sheet content ... */}
      <Button label="Iniciar" onPress={() => { /* ... */ }} />
    </View>
  )
}
```

Open from any component:

```tsx
import { useRouter } from 'expo-router'
const router = useRouter()
router.push('/(sheets)/start-session')
```

Common sheet options used in this project (from `app/_layout.tsx`):

```ts
{
  presentation: 'pageSheet',
  headerShown: false,
  sheetGrabberVisible: true,            // iOS grabber handle at the top
  sheetAllowedDetents: [0.6, 0.95],     // snap points
  sheetCornerRadius: 24,
  sheetExpandsWhenScrolledToEdge: false,
  contentStyle: { backgroundColor: surfaces.surface1 },
}
```

For takeover-style flows (`edit-profile`), use `presentation: 'fullScreenModal'` with `animation: 'slide_from_right'` instead.

When you need an **in-page** bottom sheet that doesn't change the URL (e.g. a filter sheet on a tab screen), use the `Sheet` primitive from `packages/app/expo/components/ui/Sheet.tsx` — see the primitive/mobile skill.

## Critical Rules

### URL state for filters — never useState

```tsx
// WRONG
const [page, setPage] = useState(1)

// CORRECT — Zod-validated query params
const [{ page }, setParams] = useTypedSearchParams(schema)
setParams({ page: page + 1 })
```

### Components own their data

```tsx
// WRONG — screen fetches and passes data down
const { data } = useListWorkouts({ params: { period } })
return <WorkoutList data={data} />

// CORRECT — screen renders, component fetches
return <WorkoutList />

// In WorkoutList:
const period = usePeriodStore(s => s.period)
const { data } = useListWorkouts({ params: { period } })
```

### Sheets, not dialogs

```tsx
// WRONG — using "dialog" terminology / pattern from the web stack
import { Dialog } from '@/components/ui/Dialog'  // doesn't exist on mobile

// CORRECT
router.push('/(sheets)/my-sheet')               // native iOS pageSheet route
// or, for in-page modal without changing URL:
import { Sheet } from '@/components/ui/Sheet'
<Sheet open={open} onClose={() => setOpen(false)}>...</Sheet>
```

### Stores folder is `-stores`, never `_stores`

```
progress/
├── -stores/
│   └── period-store.ts     // CORRECT
└── _stores/                // WRONG — was removed from the repo
```

### `<Protected>` on private screens

```tsx
// WRONG — bare screen accessible to anyone who deep-links
export default function ProfileScreen() { return <ProfileContent /> }

// CORRECT
import { Protected } from '@/components/Protected'
export default function ProfileScreen() {
  return <Protected><ProfileContent /></Protected>
}
```

## File Naming Conventions

| File                              | Purpose                                                                |
| --------------------------------- | ---------------------------------------------------------------------- |
| `<route>/index.tsx`               | Main screen component (default-exported)                               |
| `<route>/_layout.tsx`             | Layout wrapper for nested screens (Stack / NativeTabs / Drawer)        |
| `<route>/[id].tsx`                | Dynamic segment — read via `useLocalSearchParams<{ id: string }>()`    |
| `<route>/[...rest].tsx`           | Catch-all segment                                                      |
| `(group)/`                        | Route group with no path segment (`(tabs)`, `(auth)`, `(sheets)`)      |
| `<route>/-components/<Name>/`     | Route-private component folder                                         |
| `<route>/-stores/`                | Route-private Zustand stores (NOT `_stores`)                           |
| `<route>/-hooks/`                 | Route-private hooks                                                    |

## Checklist

- [ ] All `when: always` patterns present (verify against registry.yaml)
- [ ] Each conditional pattern evaluated
- [ ] No `bad_practices` violations
- [ ] Screen is a thin shell — no data fetching that belongs to a component
- [ ] Query params validated via `useTypedSearchParams(zodSchema)` with `.default(...)` on every field
- [ ] Private/auth-required screen wrapped in `<Protected>`
- [ ] Modal screens registered as `Stack.Screen` with `presentation: 'pageSheet'` (or `fullScreenModal`)
- [ ] Stores folder is `-stores` (not `_stores`)
- [ ] If using `router.push({ pathname })`, `pathname` is a typed-routes string (no typos)

## References

- `packages/app/expo/app/_layout.tsx` — Root Stack + sheet registrations
- `packages/app/expo/app/(tabs)/_layout.tsx` — NativeTabs
- `packages/app/expo/app/(tabs)/progress/_layout.tsx` — Per-tab Stack (Pattern A large title)
- `packages/app/expo/app/(tabs)/progress/index.tsx` — Tab screen body
- `packages/app/expo/app/(tabs)/progress/-components/PeriodPicker/index.tsx` — Route-private component
- `packages/app/expo/app/(tabs)/progress/-stores/period-store.ts` — Route-private store
- `packages/app/expo/app/index.tsx` — Auth-redirect entry
- `packages/app/expo/components/Protected.tsx` — Declarative session gate
- `packages/app/expo/lib/typed-route.ts` — `useTypedSearchParams`
- `packages/app/expo/FRONTEND_ARCHITECTURE.md` — Header patterns + atomic dependency graph
- `packages/app/expo/app.json` — `experiments.typedRoutes: true`
- `/component` (mobile) — route-private components
- `/store` — Zustand stores
- `/primitive` (mobile) — `Sheet` for in-page bottom sheets
