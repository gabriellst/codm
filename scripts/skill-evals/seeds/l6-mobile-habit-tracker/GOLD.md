# L6 Gold Rubric — mobile habit-tracker (app #4, the MOBILE canon-transfer test)

> The frozen "definition of the core" for L6 app #4 — the FIRST mobile (Expo) app-from-idea probe.
> Its novelty is breadth across the **mobile canon** the mobile-canon program established: realtime
> (`realtime/expo`), onboarding (`onboarding/expo`), push (`push/expo`), sheets (`sheet/expo`),
> social auth (better-auth socialProviders), and scheduled reminders (`scheduler`). The point is to
> measure whether a fresh agent **transfers** those canons into a new mobile app, not whether it can
> invent them. Grade SOUNDNESS, not exact match.

## App in one line (the probe's input)

"Build a minimal mobile habit tracker: a user signs in with Google or Apple, is onboarded on first
launch, creates habits (CRUD) via a sheet, checks them off daily, gets a live view that updates when
a habit is checked off on another device, registers for push, and gets scheduled reminders to do a
habit. Auth + the realtime/onboarding/push/sheet/scheduler canons are provided by the template."

## Core bounded contexts (gold BC set — names may differ; grade SOUNDNESS)

- **`habit`** — the Habit aggregate (its own context): identity + lifecycle + invariants (a habit
  has a schedule/cadence; a check-in is recorded once per period — checking off the same habit twice
  in one period is rejected with a named domain error). Owns its check-ins as value objects / child
  records OR a sibling `HabitCheckIn` aggregate if check-ins have their own lifecycle — grade the
  call, not the name. Raises `HabitCheckedOff` (integration, carries `storeId`/owner for realtime).
- **Read side (`ui` BFF)** — a `HabitListProjection` / query: the user's habits + today's check-in
  state, driven by a projector from the habit events.

### Anti-patterns the BC grader penalizes
- A god `tracker` context owning habit + check-in + reminder + everything → FAIL.
- Check-in modeled as its own aggregate when it has no independent lifecycle (it's a VO/child on the
  habit's period) → over-model.
- The reminder/schedule modeled as a persisted aggregate instead of using the **scheduler canon**
  (`scheduledAt` on a notification + deliver-due) → FAIL.

## Core canon-transfer axes (the novel test — each maps to a template skill)

1. **Realtime** (`realtime/expo`): exactly one `useServerEvents(<habit checked-off event>…)` in the
   live habits view that **invalidates** the SDK query key (no `setQueryData`, no `refetchInterval`);
   `useServerEventSource` mounted once via `<ServerEventsMount/>` in the authed layout (not per-screen).
2. **Onboarding** (`onboarding/expo`): a first-launch wizard under `app/(onboarding)/` (routes, NOT a
   `useState` step index), completion persisted to SecureStore, gated by an `<OnboardingGate>`.
3. **Sheets** (`sheet/expo`): the create-habit form is an Expo Router **sheet** (`(sheets)/…`,
   `presentation: 'formSheet'`/`pageSheet`), data via the SDK mutation schema — not a full-screen route.
4. **Push** (`push/expo`): a single `<PushRegistration/>` mount that requests permission → gets the
   Expo token → registers via `useRegisterFcmToken` with the SDK `FcmPlatform` enum (no per-screen
   registration, no hardcoded platform string).
5. **Scheduled reminders** (`scheduler`): a reminder is a notification with a future `scheduledAt`
   persisted SCHEDULED + delivered via the deliver-due seam — NOT a `setTimeout` in a handler.
6. **Social auth**: sign-in via `auth.signIn.social({ provider: 'google' | 'apple' })` against the
   configured `socialProviders` (both providers offered on the login screen).

## Core flows (must WORK — graded by reading the code + a judge)

1. Sign in with Google or Apple → onboarded on first launch.
2. Create a habit via a sheet; it appears in the list (CRUD create).
3. Check off a habit today; checking it off twice the same period is rejected (the invariant).
4. The live habits view updates when a `HabitCheckedOff` event arrives — `useServerEvents` →
   invalidate, no reload.
5. A scheduled reminder for a habit is persisted with a future `scheduledAt` (SCHEDULED), not
   delivered immediately.
6. Push registration runs once in the authed area.

## Frontend (Expo, canon-clean)
A tabs app: a live habits list (data-owning, owns the GetHabits query + the one realtime
subscription), a create-habit sheet, the onboarding wizard, the push mount, the social login screen.
All labels via the typed `t()` catalog in BOTH locales; every actionable button wired; SDK enums
typed end to end (no widening).

## Stage thresholds ("without failing too much")
- **model**: Habit is its own aggregate with a real check-in invariant; no god-context; reminder uses
  the scheduler canon (not a persisted aggregate).
- **build**: backend + app-expo tsc green; the detect suite clean.
- **canon-transfer**: ≥5 of the 6 axes (realtime, onboarding, sheets, push, scheduler, social)
  genuinely transferred (consume the template canon, not reinvented).
- **test**: a colocated Habit-aggregate invariant test + a CreateHabit/CheckOff use-case test, green.
- **Aggregate**: PASS if model + build clear AND ≥4/6 core flows covered AND ≥5/6 canon axes transferred.
