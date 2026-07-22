---
name: primitive (mobile)
description: Create a mobile/Expo/React Native primitive UI component with Uniwind (NativeWind-style className) + CVA. Use when building reusable design system components for the Expo app at packages/app/expo/components/ui/ — Button, Card, Input, Sheet, Pill, etc.
---

> **Parent**: [`../SKILL.md`](../SKILL.md) — read it for the cross-platform mental model first.
> **BEFORE IMPLEMENTING**: Open [`./registry.yaml`](./registry.yaml) and read:
> 1. **`patterns`** — all `when: always` are mandatory; evaluate each conditional (`when: <condition>`) before coding
> 2. **`bad_practices`** — keep these violations in mind throughout implementation

# Create Mobile Primitive (React Native + Uniwind + CVA)

Creates a reusable primitive in `packages/app/expo/components/ui/<Name>.tsx` using React Native primitives, Uniwind (NativeWind-style `className` on RN elements), and `class-variance-authority`.

The atomic dependency graph (from `packages/app/expo/FRONTEND_ARCHITECTURE.md`):

```
lib/tokens.ts  →  components/ui/* (primitives)  →  components/<feature>/* (composed)  →  app/<route>.tsx (screens)
```

## Key Principles [PRM-01..PRM-04, PRM-P01, PRM-P04]

1. **Stateless** — props in, JSX out. No data fetching, no SDK hooks, no domain types.
2. **`forwardRef<View, ...>`** for primitives that wrap a `Pressable` / `View` / `TextInput` (RN forwards a `View` ref everywhere it matters). Mandatory whenever the primitive may be animated by a parent (`Animated.createAnimatedComponent`) or composed inside another primitive.
3. **CVA for variants** — one primitive per family (one `Button`, one `Card`, one `Sheet`), variants via `variant` / `size` props.
4. **Named exports** — `export { Card, CardHeader, CardBody }`, never `Card.Header`.
5. **No `data-slot`** — there's no DOM. You **may** keep `data-slot="..."` as a string prop for parity with the web pattern (`<Pressable data-slot="button" />` is harmless on RN), but never rely on it for behavior.
6. **PascalCase file names** — `Button.tsx`, `Card.tsx`, `Sheet.tsx`.

## What's different from web (read once, then forget)

| Concern               | Web (Base UI + HTML)                                | Mobile (RN + Uniwind)                                                                              |
| --------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Element library       | `@base-ui/react/*` + `<button>`, `<input>`, `<div>` | `react-native`: `Pressable`, `View`, `Text`, `TextInput`, `Modal`                                  |
| `forwardRef` target   | `HTMLButtonElement`, `HTMLDivElement`               | `View` (Pressable forwards a View ref)                                                             |
| Styling escape hatch  | `style={{...}}` (rare)                              | `style={[...]}` for things Uniwind can't express (shadows, exact letter-spacing, transforms, gradients via `<LinearGradient>`) |
| Tokens                | Tailwind theme from `SYSTEM.md`                     | `packages/app/expo/lib/tokens.ts` (`surfaces`, `fg`, `accent`, `gradients`, `radius`, `fs`, `space`)   |
| Modal primitive       | `Dialog` / `AlertDialog` from Base UI               | **Sheet** — bottom sheet built on `Modal`. See `Sheet.tsx`. **Do not say "dialog" on mobile.**     |
| Polymorphism          | Base UI `render={<Button />}`                       | `Animated.createAnimatedComponent(Pressable)` composition + `forwardRef`                           |
| Press feedback        | CSS `:active` + Tailwind transitions                | `useAnimatedPress({ opacityTo: 0.8 })` + `react-native-nitro-haptics` (`Haptics.impact('medium')`) |
| Native iOS variants   | n/a                                                 | `@expo/ui/swift-ui` `Button` / `ContextMenu` when the platform widget reads better (see Button.tsx) |

## When to create a mobile primitive

- A reusable UI atom that appears across multiple screens (`Button`, `Pill`, `Card`, `Sheet`, `Input`, `Pattern`).
- Wrapping a `react-native` primitive (`Pressable` / `View` / `TextInput`) with project tokens and CVA variants.

**Don't** create a primitive for:

- A screen-specific composition → use `/component` (lives in `app/<route>/-components/...`).
- A form → use `/form`.
- A route layout / sheet route → use `/route` (mobile child).

## Process

### Step 1: Check existing primitives

```bash
ls packages/app/expo/components/ui/
```

Existing primitives at the time of writing: `Avatar`, `Button`, `Card`, `DisplayTitle`, `EmptyState`, `Eyebrow`, `GradientCard`, `Icons`, `Input`, `KeyboardAware`, `LiquidGlass`, `LogoMark`, `NumField`, `Pill`, `ScreenError`, `ScreenSkeleton`, `Separator`, `Sheet`, `StatCard`, `SummaryCard`, `Text`, `ToggleRow`, `*Pattern` (background art).

### Step 2: Read the tokens

`packages/app/expo/lib/tokens.ts` is the **only** source of truth for colors / radius / type. Use Uniwind classes that map to those tokens (e.g. `bg-bg-0`, `text-fg-0`, `border-white/[0.16]`, `rounded-pill`) rather than reaching for `style={{}}`.

### Step 3: Implement

#### Simple primitive (Card)

Source: `packages/app/expo/components/ui/Card.tsx`

```tsx
import { forwardRef } from 'react'
import { View, type ViewProps } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const cardVariants = cva('rounded-lg border', {
  variants: {
    variant: {
      surface1: 'bg-surface-1 border-white/[0.08]',
      surface2: 'bg-surface-2 border-white/[0.16]',
      outlined: 'bg-transparent border-white/[0.16]',
    },
    padding: { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' },
  },
  defaultVariants: { variant: 'surface1', padding: 'md' },
})

export interface CardProps extends ViewProps, VariantProps<typeof cardVariants> {
  className?: string
}

export const Card = forwardRef<View, CardProps>(function Card(
  { className, variant, padding, ...props },
  ref,
) {
  return (
    <View
      ref={ref}
      data-slot="card"
      className={cn(cardVariants({ variant, padding }), className)}
      {...props}
    />
  )
})

export function CardHeader({ className, ...props }: ViewProps & { className?: string }) {
  return <View data-slot="card-header" className={cn('flex-row items-center justify-between mb-3', className)} {...props} />
}

export function CardBody({ className, ...props }: ViewProps & { className?: string }) {
  return <View data-slot="card-body" className={cn('flex-col gap-2', className)} {...props} />
}
```

#### Interactive primitive (Button)

Source: `packages/app/expo/components/ui/Button.tsx` (truncated for clarity).

```tsx
import { forwardRef } from 'react'
import { Animated, Pressable, type PressableProps, View } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { Haptics } from 'react-native-nitro-haptics'
import { cn } from '@/lib/utils'
import { useAnimatedPress } from '@/lib/use-animated-press'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

const buttonVariants = cva('flex-row items-center justify-center gap-2 rounded-pill', {
  variants: {
    variant: {
      chrome: '',                                              // gradient handled via inner LinearGradient
      success: 'bg-accent-success/10 border border-accent-success/40',
      destructive: 'bg-accent-danger/10 border border-accent-danger/40',
      ghost: 'border border-white/[0.16] bg-transparent',
      link: 'bg-transparent rounded-none',
    },
    size: { sm: 'h-10 px-5', md: 'h-12 px-6', lg: 'h-14 px-7' },
    fullWidth: { true: 'w-full', false: '' },
  },
  defaultVariants: { variant: 'chrome', size: 'md', fullWidth: false },
})

interface ButtonProps
  extends Omit<PressableProps, 'children' | 'style'>,
    Pick<VariantProps<typeof buttonVariants>, 'variant' | 'size' | 'fullWidth'> {
  label?: string
  leading?: React.ReactNode
  trailing?: React.ReactNode
  className?: string
}

export const Button = forwardRef<View, ButtonProps>(function Button(
  { label, leading, trailing, variant, size, fullWidth, className, onPress, disabled, ...props },
  ref,
) {
  const { animatedStyle, onPressIn, onPressOut } = useAnimatedPress({ opacityTo: 0.8 })
  const handlePress: PressableProps['onPress'] = e => {
    if (disabled) return
    Haptics.impact('medium')
    onPress?.(e)
  }
  return (
    <AnimatedPressable
      ref={ref}
      onPress={handlePress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      className={cn(buttonVariants({ variant, size, fullWidth }), disabled && 'opacity-40', className)}
      style={animatedStyle}
      {...props}
    >
      {leading}
      {label ? <Text className="font-sans-bold uppercase">{label}</Text> : null}
      {trailing}
    </AnimatedPressable>
  )
})
```

Notes from the real `Button.tsx`:

- `Animated.createAnimatedComponent(Pressable)` keeps the `Pressable` as the outer element (preserving layout box and ref forwarding) while letting `transform` / `opacity` animate natively.
- `Haptics.impact('medium')` from `react-native-nitro-haptics` is the project's haptic primitive — wire it in `onPress` for tactile feedback.
- iOS-only branches (`@expo/ui/swift-ui` `Button`) are acceptable for variants where the native widget reads better. Keep the Pressable + className path as the cross-platform fallback.
- For chrome (white gradient) buttons, use `<LinearGradient colors={gradients.chrome} ... />` from `expo-linear-gradient` inside the Pressable — Uniwind can't express composite gradients.

#### Text input primitive (Input)

Source: `packages/app/expo/components/ui/Input.tsx`.

```tsx
import { Text, TextInput, View, type TextInputProps } from 'react-native'
import { fg, fs } from '@/lib/tokens'
import { textInputStyle } from '@/lib/text-styles'
import { cn } from '@/lib/utils'

const SIZE_TO_FS = { sm: fs.sm, base: fs.base, lg: fs.lg } as const
type InputSize = keyof typeof SIZE_TO_FS

export function Input({ size = 'base', className, style, ...rest }: TextInputProps & { size?: InputSize }) {
  const fontSize = SIZE_TO_FS[size]
  return (
    <TextInput
      placeholderTextColor={fg.fg3}
      autoCorrect={false}
      spellCheck={false}
      {...rest}
      style={[{ padding: 0, ...textInputStyle(fontSize) }, style]}
      className={cn('flex-1 text-fg-0 font-sans', className)}
    />
  )
}

export function InputGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return <View className={cn('bg-white/[0.08] rounded-[10px] px-4 py-3 flex-row items-center gap-2', className)}>{children}</View>
}
```

Notes:

- `placeholderTextColor` is an RN prop, not a Tailwind class — fall back to tokens (`fg.fg3`) here.
- The `padding: 0` + `textInputStyle(fontSize)` combo neutralizes iOS's invisible internal `TextInput` padding so descenders aren't clipped and the input baseline-aligns with sibling `<Text>` adornments inside an `<InputGroup>`.

#### Text primitive

Source: `packages/app/expo/components/ui/Text.tsx`.

```tsx
import { Text as RNText, type TextProps } from 'react-native'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const textVariants = cva('text-fg-0', {
  variants: {
    variant: {
      hero: 'font-display text-6xl leading-tight',
      title: 'font-display text-2xl',
      kicker: 'text-[11px] font-sans-semi tracking-eyebrow uppercase text-fg-2',
      body: 'text-base leading-relaxed',
      label: 'text-sm',
      caption: 'text-xs text-fg-2',
      amount: 'font-mono text-base font-sans-medium tabular-nums',
      'amount-hero': 'font-display text-5xl leading-none tabular-nums',
    },
  },
  defaultVariants: { variant: 'body' },
})

export function Text({ className, variant, ...props }: TextProps & VariantProps<typeof textVariants>) {
  return <RNText className={cn(textVariants({ variant }), className)} {...props} />
}
```

## Sheets, not dialogs

**Mobile modals are sheets.** Two layers exist:

1. **`Sheet` primitive** (`packages/app/expo/components/ui/Sheet.tsx`) — a JS-driven bottom sheet built on `Modal` + `Animated.timing` + `LinearGradient` backdrop. Useful for in-page sheets that are NOT a navigation destination (e.g. a filter sheet that appears over a tab screen without changing the URL).

2. **Sheet *routes*** — registered as `Stack.Screen` with `presentation: 'pageSheet'` in `app/_layout.tsx`. These are real native iOS sheets with grabber, snap detents, and corner radius. See the route/mobile skill.

When in doubt, prefer the route-based sheet (`(sheets)/<name>.tsx`) — it gives you the native iOS UISheetPresentationController behavior for free.

The `Sheet` primitive's anatomy:

```tsx
<Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
  {/* dim backdrop */}
  <Animated.View style={[StyleSheet.absoluteFill, { opacity: overlayOpacity }]}>
    <Pressable className="flex-1 bg-black/60" onPress={onClose} accessibilityLabel="Fechar" />
  </Animated.View>

  {/* sheet body, slides up from the bottom */}
  <Animated.View
    className={cn(sheetVariants({ size: resolvedSize ?? 'auto' }), className)}
    style={[{ transform: [{ translateY }] }, /* shadow */]}
  >
    <LinearGradient colors={[surfaces.surface2, surfaces.bg0]} style={StyleSheet.absoluteFill} />
    <View className="w-10 h-1 rounded-md bg-white/20 self-center mb-3.5" /> {/* grabber */}
    {title ? <View className="flex-row items-center justify-between mb-4">{/* ... */}</View> : null}
    <View className="flex-1">{children}</View>
  </Animated.View>
</Modal>
```

CVA shape:

```ts
const sheetVariants = cva(
  'absolute left-0 right-0 bottom-0 px-5 pb-7 pt-2.5 rounded-t-xl border-t border-white/[0.16] overflow-hidden',
  { variants: { size: { auto: '', tall: 'h-[560px]', full: 'h-[80%]' } }, defaultVariants: { size: 'auto' } },
)
```

## Critical Rules [PRM-P05, bp-01..bp-04]

### Use `forwardRef<View, ...>` whenever the primitive can be animated or composed

```tsx
// WRONG — breaks Animated.createAnimatedComponent and consumer ref needs
export function Button({ ... }) { return <Pressable ... /> }

// CORRECT
export const Button = forwardRef<View, ButtonProps>(function Button({ ... }, ref) {
  return <Pressable ref={ref} ... />
})
```

### Extend the underlying RN component's props

```tsx
// WRONG
interface ButtonProps { onPress?: () => void; label: string }

// CORRECT — extend PressableProps and add variant typing
interface ButtonProps extends Omit<PressableProps, 'children' | 'style'>, Pick<VariantProps<typeof buttonVariants>, 'variant' | 'size'> { ... }
```

### Use `cn()` so consumer className wins

```tsx
<Pressable className={cn(buttonVariants({ variant, size }), className)} />
```

### Use tokens, not hex codes

```tsx
// WRONG
style={{ backgroundColor: '#0A0A0B' }}

// CORRECT — Uniwind class mapped to the token
className="bg-bg-0"

// CORRECT — when you must use style (gradients, shadows, exact letter-spacing), import from tokens.ts
import { surfaces } from '@/lib/tokens'
style={{ backgroundColor: surfaces.bg0 }}
```

### Accessibility

```tsx
// Icon-only Pressable — accessibilityLabel is mandatory
<Pressable onPress={onClose} accessibilityLabel="Fechar" hitSlop={10}>
  <IconClose size={iconSize.xl} color={fg.fg0} />
</Pressable>

// Labelled inputs — accessibilityLabel on TextInput, or wrap in a labelled Group
```

### Haptics on tactile actions

```tsx
import { Haptics } from 'react-native-nitro-haptics'
// inside onPress
Haptics.impact('medium')
```

## Checklist

- [ ] PascalCase file name in `packages/app/expo/components/ui/`
- [ ] All `when: always` patterns present (PRM-01..PRM-04, PRM-P01, PRM-P04, PRM-P05)
- [ ] Each conditional pattern evaluated
- [ ] No `bad_practices` violations (bp-01..bp-04)
- [ ] No `StyleSheet.create({...})` for static styling — use `className` (`style={...}` only for things Uniwind can't express)
- [ ] Modal-like UI uses `Sheet` primitive OR a `(sheets)/` route — never the word "dialog" on mobile

## References

- `packages/app/expo/components/ui/` — Existing primitives (`Button.tsx`, `Card.tsx`, `Input.tsx`, `Sheet.tsx`, `Text.tsx`, ...)
- `packages/app/expo/lib/tokens.ts` — Design tokens (single source of truth)
- `packages/app/expo/lib/utils.ts` — `cn()` helper
- `packages/app/expo/lib/use-animated-press.ts` — Press feedback hook
- `packages/app/expo/FRONTEND_ARCHITECTURE.md` — The atomic dependency graph and Uniwind rules
- `react-native-nitro-haptics` — Haptic feedback API
- `expo-linear-gradient` — Used for chrome / vignette gradients
- CVA: https://cva.style/
