---

> **Test data is created through the API request context — NEVER through UI click-paths.**
> k=2 measured (P0 composition iter1+iter2): builders set up fixtures by driving the UI,
> which couples every test to unrelated screens and triples runtime. The canonical setup:
> `const ctx = await request.newContext(...)` (or the suite's api fixture) → POST the
> entities → THEN open the page under test. UI interaction is only for the behavior the
> test asserts.
name: e2e
description: Use when writing E2E tests, creating e2e given helpers, mocking API routes, or debugging test failures with network diagnostics and Grafana traces. Use this skill for any Playwright test work in the packages/e2e/ workspace.
---

# E2E Testing

Write and debug E2E tests using Playwright, SDK types, and composable given helpers.

## Core Principles

1. **SDK calls for setup, Playwright for interaction.** E2E givens call real API endpoints via the SDK — same as the frontend. No direct DB access, no backend imports.
2. **No shared label constants.** Use inline strings in tests. The test string IS the contract. If a label changes in the component, the test breaks — that's the test doing its job.
3. **Fail fast on API errors.** The `network` fixture rejects immediately when any API call returns 4xx/5xx. No 30-second timeouts waiting for navigation that will never happen.
4. **Type-safe mocking.** `mockRoute<ResponseType>(page, queryKey, data)` forces the mock to match the SDK response type. If the API contract changes, the mock won't compile.
5. **Investigate failures, don't guess.** When a test fails, check the network log attachment, then check Grafana Tempo traces for the error's root cause.
6. **If the frontend doesn't help, fix it.** When a selector is hard to write (regex, `.first()`, `waitForTimeout`), the component is missing testability. Add `id={field.name}` on compound inputs, `htmlFor` on labels, `data-slot` on containers. Don't hack the test — fix the source.
7. **Read the component before writing the test.** Don't guess selectors from screenshots. Read the route, the component, and the form structure to understand what labels, roles, and slots exist.
9. **Selectors are role/label/text — NEVER `getByTestId`.** Find elements by what the USER perceives:
   `getByRole('button', { name })`, `getByLabel(...)`, `getByText(...)`. `getByTestId` couples the
   test to an implementation detail (a `data-testid` prop) instead of the user-visible contract — a
   test that passes with the wrong label is worthless. If a role/label selector is hard to write, the
   component lacks testability (principle 6) — fix the source, don't reach for a testid.
8. **Author the spec COMPLETE — never stub it, even when you can't run it.** A spec is correct as a *written artifact*: real `request.*` setup + active `await expect(...)` assertions. Do NOT commit a commented-out body, a `expect(true).toBe(true)` placeholder, or `.skip`/`.fixme` because the dev server isn't up in your context. If you cannot run Playwright where you're working, write the real spec anyway — an unrun-but-complete spec is correct; a stubbed one is the single most common e2e failure and reads as "no test." Reviews and gates read the spec; they do not require you to have run it.

## Two Test Modes: E2E vs Demo

This project has two distinct Playwright projects configured in `playwright.config.ts`:

| | **E2E** (normal) | **Demo** (promotional) |
|---|---|---|
| **Purpose** | Validate features work | Record promotional videos |
| **Speed** | Fast — instant `.fill()`, no slowMo | Human-paced — sequential typing, animated cursor |
| **Cursor** | Native (invisible in headless) | macOS-style animated overlay via CDP |
| **Location** | `packages/e2e/stories/*.spec.ts` | `packages/e2e/stories/demo/*.spec.ts` |
| **Interaction** | `page.getByLabel().fill()`, `page.getByRole().click()` | `cursor.fill()`, `cursor.click()`, `cursor.type()` |
| **Video** | No | Yes — `packages/e2e/recordings/` |
| **Run command** | `bun e2e` | `bun --cwd packages/e2e test:demo` |

**When writing a test, decide which mode first.** This determines the interaction API:
- **E2E**: Use Playwright's native locator methods directly
- **Demo**: Import `createDemoCursor` from `packages/e2e/utils/cursor.ts` and use `cursor.click()`, `cursor.fill()`, `cursor.type()`

### E2E Test Example

```ts
import { test, expect } from '../utils/test'

test('Complete onboarding', async ({ page, goto, given }) => {
  await given.freshUser({ name: 'Gerente Teste' })
  await goto('/onboarding')
  await page.getByRole('button', { name: 'Gerente de clínica' }).click()
  await page.getByLabel('Nome da Clínica').fill('Clínica Teste')
  // ... instant, no animation
})
```

### Demo Test Example

```ts
import { test, expect } from '../../utils/test'
import { createDemoCursor } from '../../utils/cursor'

test('Demo: Complete onboarding', async ({ page, goto, given }) => {
  const cursor = await createDemoCursor(page)
  await given.freshUser({ name: 'Gerente Teste' })
  await goto('/onboarding')
  await cursor.click(page.getByRole('button', { name: 'Gerente de clínica' }), { circulate: true })
  await cursor.fill(page.getByLabel('Nome da Clínica'), 'Clínica Teste')
  // ... animated, human-like
})
```

## Demo Cursor (`e2e/utils/cursor.ts`)

The demo cursor uses CDP (Chrome DevTools Protocol) for direct mouse control with macOS-style cursor SVGs. Playwright's native `.click()` teleports instantly — CDP allows smooth Bezier movement.

### API

| Method | Behavior |
|--------|----------|
| `cursor.click(locator, options?)` | Move to element, hover, click. Detects input-like elements and adjusts cursor origin. |
| `cursor.fill(locator, text)` | Move to input, click, type sequentially (~30-55ms/char) |
| `cursor.type(locator, text, delay?)` | Move to input, click, type char-by-char with custom delay |

**Click options:** `{ circulate: true }` draws a circle around the element before clicking (for emphasis on key actions). `{ circulateRadius: 30 }` overrides default radius.

### Humanization Strategies

1. **Click positioning**: Buttons use pointer origin offset `[12, 4]`, inputs use text cursor origin `[14, 14]` — the visual hotspot lands on target center
2. **Horizontal jitter**: Buttons vary 25-45% of width. Inputs use width-adaptive skewed distribution: wide inputs (400px+) click at 20-45% skewed left, narrow inputs (~100px) click at 60-80% to avoid covering text
3. **Timing**: Buttons get longer hover (150-250ms), inputs get shorter (80-140ms). Post-click pause 150-250ms
4. **Bezier arcs**: Movement follows quadratic Bezier curves with perpendicular arc offset (max ~15deg). Arc is skewed off-center (30-70% along the line) for natural asymmetry
5. **Ease-in-out**: Quadratic easing — smooth acceleration and deceleration, no discontinuities
6. **Velocity-proportional wobble**: Micro-jitter scales with movement velocity (zero at start/end, subtle mid-movement, capped at 0.8px)
7. **Circulate**: Orbits element with ease-in-out angular speed. First 20% blends from current position onto the circle via smoothstep — no snap

### Cursor Overlay

- Real macOS cursor SVGs in `e2e/assets/cursors/` (default, handpointing, textcursor, notallowed)
- Hides native cursor via `* { cursor: none !important }`
- Auto-transitions between cursor types based on hovered element (input → text, button → pointer, disabled → notAllowed)
- Scale animation on mousedown (0.85) / mouseup (1.0)

## Directory Structure

```
e2e/                          # Workspace with its own tsconfig + package.json
├── playwright.config.ts      # Two projects: e2e (fast) and demo (slowMo + video)
├── tsconfig.json
├── package.json
├── assets/
│   └── cursors/              # macOS cursor SVGs for demo overlay
├── utils/
│   ├── test.ts               # Custom test with goto, loginAs, given, network fixtures
│   ├── cursor.ts             # Demo cursor with CDP movement + humanization
│   ├── mock.ts               # mockRoute, mockSSE, mockRouteError
│   ├── diagnostics.ts        # Network logger (auto-attaches, fail-fast)
│   ├── generators.ts         # generateCpf, generateEmail, generatePhone
│   └── given/
│       ├── api.ts            # apiSignUp, injectSession, authenticated SDK client
│       ├── user.ts           # givenOnboardedUser, givenFreshUser
│       ├── doctor.ts         # givenOnboardedDoctor, givenDoctorReadyForAppointments
│       ├── patient.ts        # givenUserWithPatient
│       └── index.ts
├── stories/
│   ├── onboarding.spec.ts    # E2E tests (fast, no cursor)
│   ├── dashboard.spec.ts
│   ├── patients.spec.ts
│   ├── chat.spec.ts
│   └── demo/                 # Demo tests (animated cursor, video recording)
│       ├── onboarding.spec.ts
│       └── doctor-flow.spec.ts
└── recordings/               # Video output for demo project
```

## Writing a Spec

### Selector Helpers (`e2e/utils/selectors.ts`)

| Helper | Usage | Purpose |
|--------|-------|---------|
| `field(scope, label)` | `field(page, 'Cidade').getByRole('textbox')` | Scope to `[data-slot="field"]` containing label text |
| `dialog(page)` | `dialog(page).getByRole('button', { name: 'Criar' })` | Scope to active `[role="dialog"]` |
| `header(page)` | `header(page).getByText('Pacientes')` | Scope to page header |
| `pickOptionByValue(page, value)` | `await pickOptionByValue(page, PlanNameEnum.PRO)` | **Preferred for enum-bound Selects** — locates the option via `[role=option][data-value=KEY]`, immune to label translation drift and substring collisions. Our SelectItem primitive forwards `value` as `data-value`. (E2E-C10, bp-e2e-10) |
| `pickOption(page, name)` | `await pickOption(page, 'Brasil')` | Label-based fallback for **non-enum** dropdowns (free-form items). Uses `{ exact: true }` internally so `'Brasil'` doesn't collide with `'Brasileiro'`. (E2E-C11) |
| `routeParams(page, route)` | `const { unitId } = routeParams(page, '/units/$unitId')` | Extract typed params from current URL |

**Use `field()` for form interactions** — it scopes to the correct field by label, avoiding ambiguity when multiple inputs exist on the same page. Combine with role selectors:

```ts
await field(page, 'Estado').getByRole('combobox').click()
await field(page, 'Preço mínimo (centavos)').getByRole('spinbutton').fill('20000')
```

### With API Mocking (External Dependencies)

```ts
import type { Page } from 'playwright'
import { test, expect } from '../utils/test'
import { mockRoute, mockSSE } from '../utils/mock'
import { listNotificationsQueryKey, type ListNotificationsQueryResponse } from '@template/client-typescript/typescript'
import { listenEventsQueryKey } from '@template/client-typescript/typescript'

// Type-safe mock data — must satisfy SDK response type
const mockNotifications: ListNotificationsQueryResponse = {
  items: [{ id: 'notif-1', title: 'Order received', ... }]
}

test('View notifications', async ({ page, goto, given }) => {
  await given.onboardedUser()

  // Static URL → use SDK query key (type-safe)
  await mockRoute<ListNotificationsQueryResponse>(page, listNotificationsQueryKey, mockNotifications)

  // Parameterized URL → use glob string (query key would produce /notifications/undefined)
  await mockRoute(page, '**/notifications/notif-id-here*', mockNotification)

  // SSE streams → mock to prevent retry loops
  await mockSSE(page, listenEventsQueryKey)

  await goto('/notifications')
  await expect(page.getByText('Order received')).toBeVisible()
})
```

### Testing Onboarding (Fresh User)

```ts
// E2E test — fast, native Playwright
test('Complete onboarding', async ({ page, goto, given }) => {
  await given.freshUser({ name: 'Gerente Teste' })
  await goto('/onboarding')
  await page.getByRole('button', { name: 'Gerente de clínica' }).click()
  await page.getByLabel('Nome da Clínica').fill('Clínica Teste')
  // ...
})

// Demo test — animated cursor, sequential typing
test('Demo: Complete onboarding', async ({ page, goto, given }) => {
  const cursor = await createDemoCursor(page)
  await given.freshUser({ name: 'Gerente Teste' })
  await goto('/onboarding')
  await cursor.click(page.getByRole('button', { name: 'Gerente de clínica' }), { circulate: true })
  await cursor.fill(page.getByLabel('Nome da Clínica'), 'Clínica Teste')
  // ...
})
```

## Fixtures

| Fixture | Purpose |
|---------|---------|
| `goto(route)` | Type-safe navigation from `FileRouteTypes['to']` |
| `loginAs({ email, password })` | Fill sign-in form, fail fast on API error |
| `given.onboardedUser(params?)` | Sign up + complete onboarding + inject cookies |
| `given.freshUser(params?)` | Sign up only, no onboarding (for testing onboarding flow) |
| `given.userWithPatient(params?)` | Onboarded user + patient created via SDK |
| `network` | Auto-captures all API calls; on failure attaches network log |

## E2E Givens

### Why SDK Calls, Not Direct DB

| Approach | Pros | Cons |
|----------|------|------|
| **SDK calls (HTTP)** | Tests full stack, no runtime coupling, same contract as frontend | Slower, needs running app |
| **Backend givens (DB)** | Fast, isolated | Coupled to Bun runtime, bypasses validation, fragile |

E2E givens call real endpoints — if the SDK works in tests, it works in the app. Only the sign-up uses raw `fetch` (Better Auth's endpoint isn't in the SDK).

### Adding a New Given

1. Create `e2e/utils/given/<name>.ts`
2. Import SDK functions + types
3. Call endpoints using `session.client` (authenticated SDK client)
4. Return typed result
5. Export from `e2e/utils/given/index.ts`
6. Add to the `given` fixture in `e2e/utils/test.ts`

```ts
import { createOwner, type CreateOwnerMutationRequest } from '@template/client-typescript/typescript'
import { givenOnboardedUser, type OnboardedUser } from './user'

export async function givenUserWithSomething(context: BrowserContext, params?: {...}): Promise<...> {
  const user = await givenOnboardedUser(context, params?.user)
  await createOwner({ data: {...} }, { client: user.session.client })
  return { ...user, something: {...} }
}
```

### Onboarding State Machine

`givenOnboardedUser` must mirror the frontend's onboarding flow — the backend enforces step transitions:

```
getOnboarding → creates record at TYPE_SELECTION
saveOnboardingState({ type: COLLABORATOR, currentStep: CLINIC_INFO })
saveOnboardingState({ currentStep: UNIT_INFO })
completeOnboarding({ data }) → UNIT_INFO → COMPLETED
```

Skipping steps causes `INVALID_STEP_TRANSITION`. Check `VALID_TRANSITIONS` in `packages/api/typescript/src/ui/entities/Onboarding.ts` if adding new paths.

## Labels and Selectors

### Two Mechanisms

| Element | How to find | Component needs |
|---------|-------------|-----------------|
| Icon-only button | `page.getByRole('button', { name: 'Send message' })` | `aria-label="Send message"` |
| Form field | `page.getByLabel('Cidade')` | `<FieldLabel htmlFor={field.name}>` + `<Input id={field.name}>` |
| Button with text | `page.getByRole('button', { name: 'Entrar' })` | Nothing — text is the label |
| List | `page.getByLabel('Lista de pacientes')` | `role="list" aria-label="..."` |
| Section | `page.getByLabel('Chat panel')` | `<section aria-label="...">` |

### Rules

- **No shared constants file.** Inline strings in both components and tests.
- **`aria-label`** only for elements without visible text (icon buttons, containers, lists).
- **Form fields** use `id={field.name}` + `<FieldLabel htmlFor={field.name}>`. Compound inputs (Combobox, Select) must forward `id` to their trigger/input element.
- **`page.getByLabel()`** finds both `aria-label` attributes and `htmlFor` label associations.
- **Use SDK enums for values** — when filling or selecting enum values (states, statuses, currencies), import the SDK enum instead of hardcoding strings. The enum value IS the visible option text for selects/comboboxes.

```ts
import { PlanNameEnum, NotificationCategoryEnum } from '@template/client-typescript/typescript'
import { enumLabel } from '../../app/src/lib/enums'

// Enum values that ARE the visible text (plans, statuses)
await page.getByLabel('Plano').pressSequentially(PlanNameEnum.PRO)
await page.getByRole('option', { name: PlanNameEnum.PRO }).click()

// Enum values with i18n labels (categories, statuses)
const category = enumLabel('NotificationCategory', NotificationCategoryEnum.ORDER_RECEIVED)
await page.getByPlaceholder('Selecione a categoria').pressSequentially(category)
await page.getByRole('option', { name: category }).click()
```

**When to use which:**
- **Enum value directly** — when the UI renders the raw enum value (plans: `PRO`, statuses: `PENDING`)
- **`enumLabel` from `packages/app/react/src/lib/enums`** — when the UI maps enum to translated text (categories, statuses). `enumLabel` is app code both the UI and tests depend on.

## Mocking

### When to Mock

- **External services** (WhatsApp/channel backend): always mock — the Go backend isn't running in e2e.
- **SSE/EventSource endpoints**: always mock with `mockSSE` — prevents infinite retry loops that block rendering.
- **Internal API calls**: never mock — test the real stack.

### Type-Safe URL Resolution

SDK query key functions contain `{ url: '/v1/...' }`. Pass them directly to `mockRoute`:

```ts
// Static URL — query key resolves to '**​/v1/ui/notifications*'
await mockRoute<ResponseType>(page, listNotificationsQueryKey, data)

// Parameterized URL — query key would produce '/notifications/undefined', use glob
await mockRoute(page, '**/notifications/some-id*', data)
```

### SDK Types Give Structural Safety, Not Semantic Safety

The SDK types `string` for fields like `lastMessageTimestamp`, but the component expects Unix seconds. The type compiles but the render crashes with `Invalid time value`. Always check the component's parsing logic when mocking data.

## Debugging Failures

### Step 1: Check Network Log

On failure, the `network` fixture attaches a `network-log` artifact:

```
[OK] GET /v1/authentication/get-session → 200
[FAIL] POST /v1/ui/onboarding/complete → 404
  → {"code":"ONBOARDING_NOT_FOUND","message":"..."}
```

### Step 2: Check Browser Console

Run `--headed` and check DevTools console. Rendering crashes (like `Invalid time value`) don't appear in the network log.

### Step 3: Check Grafana Tempo Traces

Query Tempo for error traces:

```bash
# Find recent 4xx/5xx traces
curl -s 'http://localhost:3000/api/datasources/proxy/uid/P214B5B846CF3925F/api/search?tags=http.status_code%3D404&limit=5&start=EPOCH&end=EPOCH'

# Get trace detail
curl -s 'http://localhost:3000/api/datasources/proxy/uid/P214B5B846CF3925F/api/traces/TRACE_ID'
```

The trace reveals the actual business error (e.g., `ONBOARDING_NOT_FOUND`, `INVALID_STEP_TRANSITION`, `NOT_A_DOCTOR`) which the HTTP response may obscure as a generic 500.

### Step 4: Understand the Business Logic

The trace tells you WHAT failed. Read the use case/entity code to understand WHY. Examples from this project:

- `NOT_A_DOCTOR` → sign-in hook requires doctor/collaborator record → user hasn't completed onboarding yet
- `ONBOARDING_NOT_FOUND` → `completeOnboarding` called before `getOnboarding` (which creates the record)
- `INVALID_STEP_TRANSITION` → onboarding state machine wasn't advanced through required steps

## Running Tests

```bash
# One-time setup
bun e2e:setup                  # Create test database

# Run E2E tests (fast, no animation) — Playwright's webServer auto-spins dev servers
bun e2e                                     # All e2e specs
bun --cwd packages/e2e test:headed          # Visible browser

# Run demo tests (animated cursor, video recording)
bun --cwd packages/e2e test:demo            # All demo specs with slowMo + video
# Or run a specific demo spec headed:
bun x playwright test stories/demo/onboarding.spec.ts --config packages/e2e/playwright.config.ts --project=demo --headed --timeout 120000

# Type check
bun x nx run e2e:tsc
```

### Environment

- `.env.e2e` overrides `DATABASE_URL` and `REDIS_URL` to isolated test instances
- Test DB: `postgresql://postgres:postgres@localhost:5432/test`
- Test Redis: `redis://localhost:6379/1` (DB 1, dev uses DB 0)

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `page.getByPlaceholder()` | Use `field(page, 'Label').getByRole('textbox')` or `page.getByLabel()` — placeholder text is not a stable selector |
| Using `page.getByLabel().fill()` in demo specs | Use `cursor.fill()` — demo specs must use the animated cursor API |
| Using `cursor.fill()` in normal e2e specs | Use `page.getByLabel().fill()` — e2e specs should be fast, no animation |
| Importing from `@/lib/aria-labels` in tests | Use inline strings — the test IS the contract |
| Using `page.goto('/patients')` directly | Use `goto('/patients')` fixture — type-safe from route tree |
| Calling `completeOnboarding` without `getOnboarding` first | The record must exist — call `getOnboarding` to create it |
| Skipping onboarding steps | Advance through `saveOnboardingState` before `completeOnboarding` |
| Mocking with ISO timestamp for `lastMessageTimestamp` | Component expects Unix seconds string — check parsing logic |
| `ComboboxInput` without `id={field.name}` | `getByLabel()` can't find it — label isn't connected |
| Waiting 30s for navigation after API error | Use `network.waitForFailure()` in `Promise.race` to fail fast |
| Hardcoded test data (email, CPF) | Use `generateEmail()`, `generateCpf()` — unique per test |
