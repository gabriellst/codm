# onboarding (expo) — first-launch wizard canon for mobile

A first-launch onboarding flow on Expo is a **multi-step wizard built from routes**, with
**persisted completion** and a **gate** that redirects un-onboarded users — never a single screen
with `useState` step counters, never hardcoded text.

## The wizard is a route group (ONB-01)

Steps live under `app/(onboarding)/` (a Stack), one screen per step. Navigate forward with
`router.push('/(onboarding)/<next>')`; the final "finish" step `router.replace('/(tabs)/home')`
after marking complete. Each step is a route — NOT a `useState` index swapping components in one
screen (that loses deep-linkability + back-button + the platform transition).

## Completion is persisted + gated (ONB-02)

- A `useOnboardingComplete()` hook (in `lib/`) reads/writes the completion flag via
  `expo-secure-store` (the same store auth uses): `{ complete: boolean | null, setComplete }`.
  `null` while the async read is in flight.
- An `<OnboardingGate>` component (mirrors `<Protected>` / `<BiometricGate>`): renders a spinner
  while `complete === null`, `<Redirect href="/(onboarding)/welcome" />` when `false`, children
  when `true`. Wire it into the authed area (inside `<Protected>`, around the tabs) so an
  authed-but-un-onboarded user lands on the wizard.
- The finish button calls `setComplete()` THEN navigates — the flag is the single source of truth
  for "has onboarded", read on every launch.

## Every string via t(), every actionable button wired (ONB-03)

All user-facing copy comes from `t('onboarding.*')` in BOTH locales — never an inline literal. The
finish button carries a wired `onPress` (a text-only button is a dead-UI defect).

## Anti-patterns

- Onboarding step state in `useState` instead of routes → loses back/deep-link/transition.
- Completion in component state / not persisted → the wizard re-shows every launch.
- Gating onboarding with a manual `if` in a screen instead of a declarative `<OnboardingGate>`.
- Hardcoded onboarding copy; an unwired finish button.
