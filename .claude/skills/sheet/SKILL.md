---
name: sheet
description: Create an Expo Router sheet route (mobile-only). A sheet is a route under packages/app/expo/app/(sheets)/<name>/ registered with presentation 'pageSheet' (in-page modal sheet) or 'fullScreenModal' (takeover flow) in app/_layout.tsx. Use when adding modal screens — edit profile, device pickers, filter sheets, confirmation flows.
---

> **MOBILE-ONLY SKILL.** Sheets are an Expo Router pattern — they do not exist on the web stack. If you're working under `packages/app/react/**`, this skill does not apply.
>
> **BEFORE IMPLEMENTING**: Open [`./registry.yaml`](./registry.yaml) and read `patterns` + `bad_practices`.

# Create Sheet Route (Expo Router `(sheets)` group)

Creates a modal sheet — a route under `packages/app/expo/app/(sheets)/<name>/` whose presentation is configured at the root Stack level in `app/_layout.tsx`. The route IS the modal; opening it (`router.push('/(sheets)/<name>')`) presents the sheet, dismissing it (`router.back()` / `router.dismiss()`) closes it.

## Why sheets, not dialogs

Mobile modals on this stack are **always sheets**, never "dialogs":

- iOS exposes `UISheetPresentationController` (the native pageSheet) with grabber, snap detents, and corner radius.
- Sheets share the navigation stack — they're routes with URLs, so deep linking + back gestures work for free.
- The web term "dialog" implies a centered DOM overlay — none of those concepts apply here.

There are TWO sheet shapes in this codebase. Pick the right one:

| Shape                | Use when                                                                  | Presentation               | Example                              |
| -------------------- | ------------------------------------------------------------------------- | -------------------------- | ------------------------------------ |
| **pageSheet**        | In-page modal sheet (grabs at the top, dims background, snaps to detents) | `presentation: 'pageSheet'`     | `(sheets)/devices`                   |
| **formSheet**        | Form-heavy sheet — auto-adjusts height when keyboard appears (SDK 50+ alias for medium-detent pageSheet) | `presentation: 'formSheet'` | `(sheets)/create-item` |
| **fullScreenModal**  | Takeover flow (full screen, slides in, has its own internal nav header)   | `presentation: 'fullScreenModal'` | `(sheets)/edit-profile`              |

If you only need an **in-page bottom sheet that doesn't change the URL** (e.g. a transient filter sheet inside a tab), use the `Sheet` primitive from `@/components/ui/Sheet` instead — see `/primitive` (mobile).

## File structure

```
packages/app/expo/app/(sheets)/<name>/
├── index.tsx          # Sheet body (the screen)
└── _layout.tsx        # Optional: per-sheet inner nav (back arrow + title)
```

| File              | When required                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------- |
| `index.tsx`       | Always — the screen body.                                                                    |
| `_layout.tsx`     | For `fullScreenModal` flows that need a header with a back button (iOS fullScreenModal has no native chrome). Optional for `pageSheet` flows where the grabber + parent context is enough. |

Compose multi-step sheets with sub-routes:

```
(sheets)/onboarding/
├── _layout.tsx        # Inner Stack — drives "Next/Back" navigation between steps
├── index.tsx          # Step 1
├── step-2.tsx         # Step 2
└── step-3.tsx         # Step 3
```

## Process

### Step 1: Register the sheet in `app/_layout.tsx`

`Stack.Screen` registrations in the root layout drive presentation. **Always set `presentation` explicitly.**

For an in-page pageSheet (background dims, content slides up from bottom):

```tsx
// packages/app/expo/app/_layout.tsx
<Stack.Screen
  name="(sheets)/devices"
  options={{
    presentation: 'pageSheet',
    headerShown: false,
    sheetGrabberVisible: true,
    sheetAllowedDetents: [0.5, 0.95],
    sheetCornerRadius: 24,
    sheetExpandsWhenScrolledToEdge: false,
    contentStyle: { backgroundColor: surfaces.surface1 },
  }}
/>
```

For a fullScreenModal takeover (no grabber, slides in from the side, owns the screen):

```tsx
<Stack.Screen
  name="(sheets)/edit-profile"
  options={{
    presentation: 'fullScreenModal',
    headerShown: false,
    contentStyle: { backgroundColor: surfaces.surface1 },
    animation: 'slide_from_right',
  }}
/>
```

Key options:

| Option                              | Purpose                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `presentation`                      | `'pageSheet'` for native iOS sheet · `'fullScreenModal'` for takeover         |
| `headerShown: false`                | Suppresses the root Stack header — the sheet either has its own (via `_layout.tsx`) or none |
| `sheetGrabberVisible: true`         | Shows the iOS grabber pill at the top (pageSheet only)                       |
| `sheetAllowedDetents: [0.5, 0.95]`  | Snap heights (fractions of screen). `[1]` for full-height pageSheet          |
| `sheetCornerRadius: 24`             | Corner radius of the sheet surface                                           |
| `sheetExpandsWhenScrolledToEdge`    | `false` to keep the sheet at its current detent on overscroll                |
| `contentStyle.backgroundColor`      | Always set to `surfaces.surface1` so the sheet body has the project surface  |
| `animation: 'slide_from_right'`     | fullScreenModal entrance — sides better than `default` for takeover          |
| `gestureEnabled: true`              | Default true for pageSheet; set false during in-progress operations          |

### Step 2: Write the sheet body (`index.tsx`)

Default-export a screen component. If the sheet contains text inputs, wrap in `KeyboardAware`.

For a content-only pageSheet:

```tsx
// packages/app/expo/app/(sheets)/devices/index.tsx
import { Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { fs } from '@/lib/tokens'

export default function DevicesSheet() {
  const { t } = useTranslation()

  return (
    <View className="flex-1 px-5 pt-4 pb-6">
      <Text
        className="text-fg-0 font-sans-bold text-center mb-2"
        style={{ fontSize: fs.headerTitle }}
      >
        {t('profile.eyebrows.devices')}
      </Text>
      {/* sheet body */}
    </View>
  )
}
```

For a settings-list fullScreenModal:

```tsx
// packages/app/expo/app/(sheets)/edit-profile/index.tsx
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { IconChevron } from '@/components/ui/Icons'
import { KeyboardAware } from '@/components/ui/KeyboardAware'
import { accent, fg, iconSize, surfaces } from '@/lib/tokens'
import { useSignOut } from '@/lib/auth'

export default function EditProfileSheet() {
  const { t } = useTranslation()
  const signOut = useSignOut()

  return (
    <KeyboardAware style={{ backgroundColor: surfaces.surface1 }}>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
        <View className="px-5 pt-6 pb-4">
          <Eyebrow>{t('editProfile.sectionPersonal')}</Eyebrow>
        </View>
        {/* ... rows ... */}
        <View className="bg-surface-2 mx-5 rounded-md overflow-hidden">
          <SettingsRow
            label={t('editProfile.rowDevices')}
            onPress={() => router.push('/(sheets)/devices')}
            isFirst
            isLast
          />
        </View>

        <View className="px-5 pt-6">
          <Pressable onPress={() => void signOut()} accessibilityRole="button" className="py-4 items-center">
            <Text style={{ color: accent.iosRed }} className="font-sans-semi text-base">
              {t('editProfile.rowSignOut')}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAware>
  )
}
```

### Step 3: Optional `_layout.tsx` (for fullScreenModal with internal nav)

fullScreenModal flows often need their own header chrome — the parent Stack has `headerShown: false`, so the inner layout owns the back arrow + title:

```tsx
// packages/app/expo/app/(sheets)/edit-profile/_layout.tsx
import { Pressable } from 'react-native'
import { Stack, router } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { IconBack } from '@/components/ui/Icons'
import { fg, surfaces } from '@/lib/tokens'
import { headerTitleStyle } from '@/lib/screen-styles'

export default function EditProfileLayout() {
  const { t } = useTranslation()
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: t('editProfile.title'),
        headerStyle: { backgroundColor: surfaces.surface1 },
        headerTintColor: fg.fg0,
        headerTitleStyle,
        headerLeft: () => (
          <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" hitSlop={12}>
            <IconBack size={22} color={fg.fg0} />
          </Pressable>
        ),
        contentStyle: { backgroundColor: surfaces.surface1 },
      }}
    />
  )
}
```

For a pageSheet that's a leaf screen (no internal navigation), `_layout.tsx` is often just a `<Slot />`:

```tsx
// packages/app/expo/app/(sheets)/devices/_layout.tsx
import { Slot } from 'expo-router'
export default function DevicesLayout() {
  return <Slot />
}
```

### Step 4: Open / dismiss

Open from any component:

```tsx
import { useRouter } from 'expo-router'
const router = useRouter()
router.push('/(sheets)/edit-profile')
router.push('/(sheets)/devices')
```

Dismiss from inside the sheet:

```tsx
import { router } from 'expo-router'
router.back()       // pageSheet — slides back down
router.dismiss()    // fullScreenModal — slides back out
```

### Step 5: Sheet-as-form

When the sheet body IS a form (edit profile, create entity, settings panel), follow the `/form` (mobile) skill. The key compositions:

- Wrap the body in `<KeyboardAware>`.
- On `mutation.onSuccess`, fire `Haptics.notification('success')` THEN `router.back()` / `router.dismiss()` to dismiss the sheet.
- Use `keyboardShouldPersistTaps="handled"` on any `ScrollView` inside the sheet so tapping a Button while the keyboard is open doesn't get swallowed.

See `/form` (mobile) for full form patterns.

### Step 6: State scope

The sheet body reads state the same way other screens do:

- URL params (deep-linkable) → `useTypedSearchParams(schema)` from `@/lib/typed-route`
- Local interactive state (current step, selection inside the sheet) → route-scoped Zustand store in `app/(sheets)/<name>/-stores/<x>-store.ts`
- Server data → SDK hooks (`useGetX`, `useListX`)

```
(sheets)/edit-profile/
├── index.tsx
├── _layout.tsx
└── -stores/
    └── edit-profile-store.ts     # Zustand — current step, draft values, etc.
```

## Critical rules

### Always set `presentation` explicitly

```tsx
// WRONG — no presentation set, falls back to push (sheet behaves as a regular screen, no modal chrome)
<Stack.Screen name="(sheets)/devices" options={{ headerShown: false }} />

// CORRECT
<Stack.Screen
  name="(sheets)/devices"
  options={{ presentation: 'pageSheet', headerShown: false, sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: surfaces.surface1 } }}
/>
```

### Sheets only inside `(sheets)/`

The `(sheets)` group is for modal routes ONLY. Don't put non-modal routes there.

```
// WRONG
app/(sheets)/settings/index.tsx    // settings is a tab, not a modal

// CORRECT
app/(tabs)/settings/index.tsx
```

### Dismiss matches presentation

```tsx
// pageSheet → router.back()
// fullScreenModal → router.dismiss()  (or router.back() — both work, dismiss is explicit)
```

### Background color on the content

```tsx
// In the root _layout.tsx Stack.Screen options:
contentStyle: { backgroundColor: surfaces.surface1 }
```

A missing `contentStyle.backgroundColor` makes the sheet body transparent over `surfaces.bg0`, which looks broken on iOS.

### Multi-step sheets — internal Stack, NOT separate sheet routes

```
// WRONG — each step is a separate top-level sheet route
(sheets)/onboarding-step-1.tsx
(sheets)/onboarding-step-2.tsx

// CORRECT — one sheet, internal Stack drives step navigation
(sheets)/onboarding/
├── _layout.tsx       // Stack with gestureEnabled toggled per step
├── index.tsx         // Step 1
├── step-2.tsx
└── step-3.tsx
```

## Checklist

- [ ] Route lives under `packages/app/expo/app/(sheets)/<name>/`
- [ ] `Stack.Screen` registration in `app/_layout.tsx` with explicit `presentation: 'pageSheet'` OR `'fullScreenModal'`
- [ ] `headerShown: false` on the root Stack.Screen (sheet either has no header or owns one via `_layout.tsx`)
- [ ] `contentStyle: { backgroundColor: surfaces.surface1 }` set on the root Stack.Screen
- [ ] Body screen wrapped in `<KeyboardAware>` if it contains text inputs
- [ ] Sheet-as-form dismisses via `router.back()` / `router.dismiss()` on success
- [ ] Opening uses `router.push('/(sheets)/<name>')` with the typed-routes pathname
- [ ] No code outside `(sheets)/` uses sheet presentation options (they belong to root Stack)

## References

- `packages/app/expo/app/_layout.tsx` — Root Stack with `(sheets)/edit-profile` (fullScreenModal) + `(sheets)/devices` (pageSheet)
- `packages/app/expo/app/(sheets)/edit-profile/_layout.tsx` — Inner Stack with custom back arrow
- `packages/app/expo/app/(sheets)/edit-profile/index.tsx` — Settings-list sheet body
- `packages/app/expo/app/(sheets)/devices/_layout.tsx` — Minimal `<Slot />` layout
- `packages/app/expo/app/(sheets)/devices/index.tsx` — Content-only pageSheet
- `packages/app/expo/components/ui/KeyboardAware.tsx` — Keyboard wrapper
- `/route` (mobile) — Screen scaffolding
- `/form` (mobile) — Sheet-as-form pattern
- `/primitive` (mobile) — `Sheet` primitive for in-page bottom sheets that don't change the URL
