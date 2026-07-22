# Auth HTTP Surface + Transactional Emails — Implementation Plan

> **For agentic workers:** Execute via `/build`. Steps use checkbox
> (`- [ ]`) syntax for tracking. Each Task wraps one observable
> behavior in an outer RED→GREEN cycle (Matt Pocock vertical slicing).

**Goal:** A user can sign up, sign in, request a reset, and reset their password end-to-end against the TS API, receiving an account-created email on signup and a reset email on request — delivery stubbed to the console for offline dev.

**Architecture:** Real auth runs through a better-auth `/authentication/*` passthrough controller; four `mockController=true` controllers shape the SDK contract only. Transactional emails reuse core's `MailSender`/`ConsoleMailSender` (bound in DI, never re-declared); two react-email TSX templates render to core's `{ to, subject, body }` shape and are sent from better-auth's `sendResetPassword` callback (reset) and `databaseHooks.user.create.after` hook (account-created).

**Tech Stack:** TypeScript, Bun, Drizzle, tsyringe, better-auth, Zod, @react-email/render

**Spec:** .specs/2026-05-29-auth-controllers-transactional-emails-design.md
**Tasks:** 7
**Estimated minutes:** 150

---

## Task T1: Better-auth passthrough — sign-in works end-to-end

**Files to write:**
- Create: `packages/api/typescript/src/auth/controllers/AuthController.ts`
- Modify: `packages/api/typescript/src/auth/controllers/index.ts` — add `AuthController` export
- Test: `packages/api/typescript/src/auth/controllers/AuthController.test.ts`

**Files to read:**
- `packages/api/typescript/src/auth/controllers/GetSession.ts`
- `packages/api/typescript/src/auth/services/Authentication/BetterAuth.identity-bridge.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller, /test
**Depends on:** (none)

### Step T1.1 — Write the failing test

The passthrough's job is to forward the raw Web `Request` to `betterAuth.auth.handler` and return its `Response` untouched. Test it for real: sign a user up through the controller, then sign them in through the controller, and assert a session token comes back. `executeController` returns a `Response` directly when `handle()` returns one.

Create `packages/api/typescript/src/auth/controllers/AuthController.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Config } from '@template/core-typescript'
import type { HttpControllerRequest } from '@template/core-typescript'
import { AuthController } from './AuthController'

// Build the HttpControllerRequest shape the router passes to executeController.
// Only `.raw` (the Web Request) matters for the passthrough.
function controllerRequest(raw: Request): HttpControllerRequest<unknown> {
	return { raw, ctx: {}, body: undefined, query: {}, params: {}, headers: {}, cookies: {} } as unknown as HttpControllerRequest<unknown>
}

describe('AuthController (better-auth passthrough)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let controller: AuthController

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
		controller = testBed.resolve(AuthController)
	})
	beforeEach(async () => {
		await testBed.reset()
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('forwards sign-up then sign-in to better-auth and returns a session', async () => {
		const signUp = await controller.handle(
			controllerRequest(
				new Request(`${Config.env.BETTER_AUTH_URL}/sign-up/email`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email: 'pass@b.com', password: 'StrongPass1!', name: 'Pass Through' }),
				}),
			),
		)
		expect(signUp).toBeInstanceOf(Response)
		expect((signUp as unknown as Response).status).toBeLessThan(500)

		const signIn = (await controller.handle(
			controllerRequest(
				new Request(`${Config.env.BETTER_AUTH_URL}/sign-in/email`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ email: 'pass@b.com', password: 'StrongPass1!' }),
				}),
			),
		)) as unknown as Response
		expect(signIn).toBeInstanceOf(Response)
		expect(signIn.status).toBe(200)
		const body = (await signIn.json()) as { token?: string; user?: { email: string } }
		expect(body.user?.email).toBe('pass@b.com')
	})
})
```

### Step T1.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test src/auth/controllers/AuthController.test.ts`
Expected: FAIL with `Cannot find module './AuthController'`

### Step T1.3 — Write the passthrough controller

Create `packages/api/typescript/src/auth/controllers/AuthController.ts`:

```typescript
// Better-auth passthrough. Mounts under /v1/authentication/* (MainRouter prepends
// the /v1 version prefix to the version-relative `/authentication/*` path), matching
// Config.env.BETTER_AUTH_URL and the frontend auth client's baseURL. Forwards the raw
// Web Request to better-auth and returns its Response untouched — executeController
// detects `instanceof Response` and returns it directly.
import { injectable } from 'tsyringe-neo'
import { z, Controller, BaseError, tryCatchAsync } from '@template/core-typescript'
import type { HttpMethod, BaseInterfaceErrors } from '@template/core-typescript'
import { BetterAuth } from '../services/Authentication/BetterAuth'

export const AuthControllerInput = z.unknown().example([{}])
export const AuthControllerOutput = z.unknown().example([{}])

@injectable()
export class AuthController extends Controller<typeof AuthControllerInput, typeof AuthControllerOutput> {
	readonly path = '/authentication/*'
	readonly method: HttpMethod[] = ['get', 'post']
	readonly description = 'Auth operations (better-auth passthrough)'
	readonly inputSchema = AuthControllerInput
	readonly outputSchema = AuthControllerOutput

	constructor(private betterAuth: BetterAuth) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const result = await tryCatchAsync<Response>(() => this.betterAuth.auth.handler(request.raw))
		if (!result.success) throw new BaseError<BaseInterfaceErrors>('UNAUTHORIZED', result.error.message)
		// executeController detects Response instances and returns them directly;
		// the double cast satisfies the Controller output signature.
		return result.data as unknown as this['output']
	}
}
```

If `tryCatchAsync` / `BaseError` / `Controller` are not all exported from the `@template/core-typescript` barrel root, import each from the path GetSession.ts uses (verified during planning: `Controller`, `z`, `HttpMethod` come from the barrel root). Adjust only if `bun tsc` reports a missing export.

### Step T1.4 — Register the controller in the barrel

Modify `packages/api/typescript/src/auth/controllers/index.ts`:

```diff
  export { GetSessionController } from './GetSession'
+ export { AuthController } from './AuthController'
```

### Step T1.5 — Run test to verify it passes

Run: `cd packages/api/typescript && bun test src/auth/controllers/AuthController.test.ts`
Expected: PASS — 1 test passes

### Step T1.6 — Type check + lint

Run: `cd packages/api/typescript && bun tsc && cd ../../.. && bun lint`
Expected: 0 errors

### Step T1.7 — Commit

```bash
git add packages/api/typescript/src/auth/controllers/AuthController.ts \
        packages/api/typescript/src/auth/controllers/index.ts \
        packages/api/typescript/src/auth/controllers/AuthController.test.ts
git commit -m "feat(auth): better-auth passthrough controller (Task T1)"
```

---

## Task T2: Reset + account-created email templates

**Files to write:**
- Create: `packages/api/typescript/src/auth/services/MailSender/components/Layout.tsx`
- Create: `packages/api/typescript/src/auth/services/MailSender/ResetPasswordEmail.tsx`
- Create: `packages/api/typescript/src/auth/services/MailSender/AccountCreatedEmail.tsx`
- Create: `packages/api/typescript/src/auth/services/MailSender/index.ts`
- Modify: `packages/api/typescript/package.json` — add `@react-email/render` + `react` deps
- Test: `packages/api/typescript/src/auth/services/MailSender/Emails.test.ts`

**Files to read:**
- `packages/api/typescript/core/src/services/MailSender/MailSender.ts` (the `MailMessage` shape templates target)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** (none)

### Step T2.1 — Add the rendering dependencies

Modify `packages/api/typescript/package.json` — add to `dependencies` (api-ts tsconfig already sets `jsx: react-jsx` + `jsxImportSource: react`):

```diff
  "dependencies": {
+   "@react-email/render": "^1.0.0",
    "better-auth": "^1.4.6",
+   "react": "^19.0.0",
    ...
  }
```

Then install:

Run: `cd /Users/gabrielaraujo/Desktop/Projetos/pessoal/template-fullstack && bun install`
Expected: lockfile updates; `@react-email/render` + `react` resolve.

### Step T2.2 — Write the failing test

Create `packages/api/typescript/src/auth/services/MailSender/Emails.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { renderResetPasswordEmail, renderAccountCreatedEmail } from './index'

describe('auth email templates', () => {
	it('reset password email contains the name and the reset url', async () => {
		const msg = await renderResetPasswordEmail({ name: 'Alice', url: 'http://localhost:5173/reset-password?token=abc123' })
		expect(msg.subject.length).toBeGreaterThan(0)
		expect(msg.body).toContain('Alice')
		expect(msg.body).toContain('http://localhost:5173/reset-password?token=abc123')
	})

	it('account-created email contains the name', async () => {
		const msg = await renderAccountCreatedEmail({ name: 'Bob' })
		expect(msg.subject.length).toBeGreaterThan(0)
		expect(msg.body).toContain('Bob')
	})
})
```

### Step T2.3 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test src/auth/services/MailSender/Emails.test.ts`
Expected: FAIL with `Cannot find module './index'` (or the render exports)

### Step T2.4 — Write the shared Layout

Create `packages/api/typescript/src/auth/services/MailSender/components/Layout.tsx`:

```tsx
import type { ReactNode } from 'react'

interface LayoutProps {
	children: ReactNode
}

export function Layout({ children }: LayoutProps) {
	return (
		<>
			<head></head>
			<div
				style={{
					width: '600px',
					color: '#0a0a0a',
					fontFamily: 'sans-serif',
					fontSize: '14px',
					margin: '0 auto',
					boxSizing: 'border-box',
					fontWeight: 400,
					backgroundColor: '#ffffff',
					lineHeight: '17px',
					textAlign: 'left',
				}}
			>
				<div style={{ height: '130px', textAlign: 'center' }}>bk-dash</div>
				<div style={{ textAlign: 'justify', padding: '20px 60px 70px' }}>
					<div style={{ padding: '0 28px' }}>{children}</div>
				</div>
				<div style={{ textAlign: 'center', padding: '20px 60px 40px', borderTop: '1px solid #e5e5e5' }}>
					<p style={{ margin: 0, fontSize: '12px', color: '#737373' }}>© bk-dash. Todos os direitos reservados.</p>
				</div>
			</div>
		</>
	)
}
```

### Step T2.5 — Write the ResetPasswordEmail template

Create `packages/api/typescript/src/auth/services/MailSender/ResetPasswordEmail.tsx`:

```tsx
import { render } from '@react-email/render'
import type { MailMessage } from '@template/core-typescript'
import { Layout } from './components/Layout'

interface ResetPasswordEmailProps {
	name: string
	url: string
}

function ResetPasswordEmailHtml({ name, url }: ResetPasswordEmailProps) {
	return (
		<Layout>
			<div>
				<p>
					<strong>Olá, {name}!</strong>
				</p>
				<p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
				<p>Clique no botão abaixo para criar uma nova senha:</p>
				<div style={{ textAlign: 'center', margin: '30px 0' }}>
					<a
						href={url}
						target="_blank"
						style={{
							backgroundColor: '#3b82f6',
							color: '#ffffff',
							padding: '12px 24px',
							borderRadius: '6px',
							textDecoration: 'none',
							fontWeight: 'bold',
							display: 'inline-block',
						}}
					>
						Redefinir Senha
					</a>
				</div>
				<p>Se você não solicitou a redefinição, ignore este e-mail. Sua senha permanecerá inalterada.</p>
			</div>
		</Layout>
	)
}

export async function renderResetPasswordEmail(props: ResetPasswordEmailProps): Promise<Omit<MailMessage, 'to'>> {
	return {
		subject: 'bk-dash — Redefina sua senha',
		body: await render(<ResetPasswordEmailHtml {...props} />),
	}
}
```

### Step T2.6 — Write the AccountCreatedEmail template

Create `packages/api/typescript/src/auth/services/MailSender/AccountCreatedEmail.tsx`:

```tsx
import { render } from '@react-email/render'
import type { MailMessage } from '@template/core-typescript'
import { Layout } from './components/Layout'

interface AccountCreatedEmailProps {
	name: string
}

function AccountCreatedEmailHtml({ name }: AccountCreatedEmailProps) {
	return (
		<Layout>
			<div>
				<p>
					<strong>Olá, {name}!</strong>
				</p>
				<p>Sua conta foi criada com sucesso. Agora você pode acessar todos os recursos da plataforma.</p>
				<p>Se tiver alguma dúvida, é só responder este e-mail.</p>
			</div>
		</Layout>
	)
}

export async function renderAccountCreatedEmail(props: AccountCreatedEmailProps): Promise<Omit<MailMessage, 'to'>> {
	return {
		subject: 'Bem-vindo(a) ao bk-dash!',
		body: await render(<AccountCreatedEmailHtml {...props} />),
	}
}
```

### Step T2.7 — Write the barrel

Create `packages/api/typescript/src/auth/services/MailSender/index.ts`:

```typescript
export { renderResetPasswordEmail } from './ResetPasswordEmail'
export { renderAccountCreatedEmail } from './AccountCreatedEmail'
```

### Step T2.8 — Run test to verify it passes

Run: `cd packages/api/typescript && bun test src/auth/services/MailSender/Emails.test.ts`
Expected: PASS — 2 tests pass

### Step T2.9 — Type check + lint

Run: `cd packages/api/typescript && bun tsc && cd ../../.. && bun lint`
Expected: 0 errors. If `bun tsc` reports `MailMessage` is not exported from the barrel root, import it from `@template/core-typescript` — confirmed exported via `core/src/index.ts` line `export * from './services/MailSender'`.

### Step T2.10 — Commit

```bash
git add packages/api/typescript/src/auth/services/MailSender/ \
        packages/api/typescript/package.json \
        bun.lock
git commit -m "feat(auth): reset + account-created email templates (Task T2)"
```

---

## Task T3: Sign-up sends account-created email; request-reset sends reset email

**Files to write:**
- Modify: `packages/api/typescript/src/shared/registry.ts` — bind `MailSender → ConsoleMailSender` in all 3 env arrays
- Modify: `packages/api/typescript/src/auth/services/Authentication/BetterAuth.ts` — inject `MailSender`, add `sendResetPassword`, send account-created email in `user.create.after`
- Test: `packages/api/typescript/src/auth/services/Authentication/BetterAuth.emails.test.ts`

**Files to read:**
- `packages/api/typescript/core/src/services/MailSender/MailSender.ts`
- `packages/api/typescript/src/auth/services/Authentication/BetterAuth.identity-bridge.test.ts`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /service, /test
**Depends on:** T2

### Step T3.1 — Write the failing test

This test runs in `integration` mode (real better-auth + PGlite DB) and overrides `MailSender` with an inline spy registered on `testContainer` **before** `BetterAuth` is resolved, so the singleton picks it up. It also asserts the production binding resolves to core's `ConsoleMailSender` (AC-6).

Create `packages/api/typescript/src/auth/services/Authentication/BetterAuth.emails.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, injectable, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Config, MailSender, ConsoleMailSender, type MailMessage } from '@template/core-typescript'
import { BetterAuth } from './BetterAuth'

@injectable()
class SpyMailSender extends MailSender {
	readonly sent: MailMessage[] = []
	async sendMail(message: MailMessage): Promise<void> {
		this.sent.push(message)
	}
}

describe('BetterAuth → transactional emails (integration)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let betterAuth: BetterAuth
	let spy: SpyMailSender

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
		// Override the core MailSender binding with the spy BEFORE first resolving
		// BetterAuth (a @singleton), so its constructor injects the spy.
		spy = new SpyMailSender()
		testContainer.registerInstance(MailSender, spy)
		betterAuth = testBed.resolve(BetterAuth)
	})
	beforeEach(async () => {
		await testBed.reset()
		spy.sent.length = 0
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('binds MailSender to core ConsoleMailSender in the real registry (AC-6)', async () => {
		// Fresh container with no spy override → production binding from shared/registry.
		const prodContainer = container.createChildContainer()
		const prodBed = await TestBed.create('integration', { testContainer: prodContainer })
		expect(prodBed.resolve(MailSender)).toBeInstanceOf(ConsoleMailSender)
		await prodBed.destroy()
	})

	it('sign-up sends an account-created email to the new user (AC-2)', async () => {
		await betterAuth.auth.handler(
			new Request(`${Config.env.BETTER_AUTH_URL}/sign-up/email`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: 'welcome@b.com', password: 'StrongPass1!', name: 'Welcomed' }),
			}),
		)
		const welcome = spy.sent.find(m => m.to === 'welcome@b.com')
		expect(welcome).toBeDefined()
		expect(welcome!.body).toContain('Welcomed')
	})

	it('request-password-reset sends a reset email with the reset url (AC-3)', async () => {
		await betterAuth.auth.handler(
			new Request(`${Config.env.BETTER_AUTH_URL}/sign-up/email`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: 'reset@b.com', password: 'StrongPass1!', name: 'Reset Me' }),
			}),
		)
		spy.sent.length = 0

		const res = await betterAuth.auth.handler(
			new Request(`${Config.env.BETTER_AUTH_URL}/request-password-reset`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ email: 'reset@b.com', redirectTo: 'http://localhost:5173/reset-password' }),
			}),
		)
		expect(res.status).toBeLessThan(500)
		const reset = spy.sent.find(m => m.to === 'reset@b.com')
		expect(reset).toBeDefined()
		expect(reset!.body).toContain('http://localhost:5173/reset-password')
		expect(reset!.body).toContain('token=')
	})
})
```

> Note on the better-auth route: this plan uses `POST /request-password-reset` (the route behind the `auth.requestPasswordReset(...)` client method the frontend already calls). If `bun test` returns a 404 / "no route", the installed better-auth version exposes it as `/forget-password` — switch the path in the test and keep going; the callback wiring in T3.3 is identical either way.

### Step T3.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test src/auth/services/Authentication/BetterAuth.emails.test.ts`
Expected: FAIL — `spy.sent` is empty (no `sendResetPassword`, no account-created send) and the binding assertion fails (no `MailSender` binding).

### Step T3.3 — Bind MailSender in the registry

Modify `packages/api/typescript/src/shared/registry.ts`:

Add to the core import from `@template/core-typescript`:

```diff
  LoggingService,
  MockLoggingService,
+ MailSender,
+ ConsoleMailSender,
  Config,
```

Append one entry after the `LoggingService` entry in **each** of `CORE_ENTRIES_MOCK`, `CORE_ENTRIES_INTEGRATION`, and `CORE_ENTRIES_REAL`:

```typescript
{ token: MailSender, instance: ConsoleMailSender },
```

### Step T3.4 — Wire MailSender into BetterAuth

Modify `packages/api/typescript/src/auth/services/Authentication/BetterAuth.ts`.

Add the imports:

```diff
- import { DrizzleClient, Config, Id } from '@template/core-typescript'
+ import { DrizzleClient, Config, Id, MailSender } from '@template/core-typescript'
+ import { renderResetPasswordEmail, renderAccountCreatedEmail } from '@auth/services/MailSender'
```

Inject `MailSender` into the constructor (the `@singleton` already takes `client` + `identityHooks`):

```diff
  constructor(
  	private client: DrizzleClient,
  	private identityHooks: IdentityAuthHooks,
+ 	private mailSender: MailSender,
  ) {
```

Replace the `emailAndPassword` block to add the reset callback. better-auth passes `{ user, url, token }` to `sendResetPassword`; `url` is built from the client's `redirectTo` + token:

```diff
- 			emailAndPassword: {
- 				enabled: true,
- 			},
+ 			emailAndPassword: {
+ 				enabled: true,
+ 				sendResetPassword: async ({ user, url }) => {
+ 					const { subject, body } = await renderResetPasswordEmail({ name: user.name ?? user.email, url })
+ 					await this.mailSender.sendMail({ to: user.email, subject, body })
+ 				},
+ 			},
```

In `databaseHooks.user.create.after`, send the account-created email after the identity hook (the `user` object carries `name` + `email`):

```diff
  				create: {
  					after: async user => {
  						await this.identityHooks.onUserCreated({
  							userId: user.id,
  							email: user.email,
  						})
+ 						const { subject, body } = await renderAccountCreatedEmail({ name: user.name ?? user.email })
+ 						await this.mailSender.sendMail({ to: user.email, subject, body })
  					},
  				},
```

### Step T3.5 — Run test to verify it passes

Run: `cd packages/api/typescript && bun test src/auth/services/Authentication/BetterAuth.emails.test.ts`
Expected: PASS — 3 tests pass

### Step T3.6 — Guard the existing bridge test still passes

The bridge test resolves `BetterAuth`, which now requires a `MailSender`; the registry binding (T3.3) supplies `ConsoleMailSender`, so it resolves cleanly.

Run: `cd packages/api/typescript && bun test src/auth/services/Authentication/BetterAuth.identity-bridge.test.ts`
Expected: PASS — existing tests still green

### Step T3.7 — Type check + lint

Run: `cd packages/api/typescript && bun tsc && cd ../../.. && bun lint`
Expected: 0 errors

### Step T3.8 — Commit

```bash
git add packages/api/typescript/src/shared/registry.ts \
        packages/api/typescript/src/auth/services/Authentication/BetterAuth.ts \
        packages/api/typescript/src/auth/services/Authentication/BetterAuth.emails.test.ts
git commit -m "feat(auth): send reset + account-created emails via better-auth (Task T3)"
```

---

## Task T4: Password reset round-trip — token to new password to sign-in

**Files to write:**
- Test: `packages/api/typescript/src/auth/services/Authentication/BetterAuth.reset.test.ts`

**Files to read:**
- `packages/api/typescript/src/auth/services/Authentication/BetterAuth.emails.test.ts` (reuse the spy + handler harness)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /test
**Depends on:** T3

### Step T4.1 — Write the round-trip test

The reset token is delivered only through the reset email (T3 wired `sendResetPassword`). Capture it from the email body, reset the password, then prove sign-in works with the new password and fails with the old one. better-auth's reset flow only functions because `sendResetPassword` is now defined.

Create `packages/api/typescript/src/auth/services/Authentication/BetterAuth.reset.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test'
import { container, injectable, type DependencyContainer } from 'tsyringe-neo'
import { TestBed } from '@test/support'
import { Config, MailSender, type MailMessage } from '@template/core-typescript'
import { BetterAuth } from './BetterAuth'

@injectable()
class SpyMailSender extends MailSender {
	readonly sent: MailMessage[] = []
	async sendMail(message: MailMessage): Promise<void> {
		this.sent.push(message)
	}
}

const post = (auth: BetterAuth, path: string, body: unknown) =>
	auth.auth.handler(
		new Request(`${Config.env.BETTER_AUTH_URL}${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
		}),
	)

describe('BetterAuth password reset round-trip (integration, AC-4)', () => {
	let testBed: TestBed
	let testContainer: DependencyContainer
	let betterAuth: BetterAuth
	let spy: SpyMailSender

	beforeAll(async () => {
		testContainer = container.createChildContainer()
		testBed = await TestBed.create('integration', { testContainer })
		spy = new SpyMailSender()
		testContainer.registerInstance(MailSender, spy)
		betterAuth = testBed.resolve(BetterAuth)
	})
	beforeEach(async () => {
		await testBed.reset()
		spy.sent.length = 0
	})
	afterAll(async () => {
		await testBed.destroy()
	})

	it('reset with the emailed token updates the password and lets the user sign in', async () => {
		await post(betterAuth, '/sign-up/email', { email: 'rt@b.com', password: 'OldPass1!', name: 'Round Trip' })
		spy.sent.length = 0

		await post(betterAuth, '/request-password-reset', { email: 'rt@b.com', redirectTo: 'http://localhost:5173/reset-password' })
		const resetEmail = spy.sent.find(m => m.to === 'rt@b.com')
		expect(resetEmail).toBeDefined()
		const token = new URL(resetEmail!.body.match(/https?:\/\/[^\s"']+token=[^\s"'&]+/)![0]).searchParams.get('token')
		expect(token).toBeTruthy()

		const reset = await post(betterAuth, '/reset-password', { token, newPassword: 'NewPass1!' })
		expect(reset.status).toBeLessThan(500)

		const withNew = await post(betterAuth, '/sign-in/email', { email: 'rt@b.com', password: 'NewPass1!' })
		expect(withNew.status).toBe(200)

		const withOld = await post(betterAuth, '/sign-in/email', { email: 'rt@b.com', password: 'OldPass1!' })
		expect(withOld.status).toBeGreaterThanOrEqual(400)
	})
})
```

### Step T4.2 — Run the test

Run: `cd packages/api/typescript && bun test src/auth/services/Authentication/BetterAuth.reset.test.ts`
Expected: PASS — 1 test passes. If the reset route differs, apply the same `/forget-password` fallback noted in T3.1; if the reset-confirm route is `/reset-password/:token`, pass the token in the URL instead of the body (better-auth accepts either by version).

### Step T4.3 — Type check + lint

Run: `cd packages/api/typescript && bun tsc && cd ../../.. && bun lint`
Expected: 0 errors

### Step T4.4 — Commit

```bash
git add packages/api/typescript/src/auth/services/Authentication/BetterAuth.reset.test.ts
git commit -m "test(auth): password reset round-trip end-to-end (Task T4)"
```

---

## Task T5: Auth contract exposed via SDK-shaping controllers

**Files to write:**
- Create: `packages/api/typescript/src/auth/controllers/SignIn.ts`
- Create: `packages/api/typescript/src/auth/controllers/SignUp.ts`
- Create: `packages/api/typescript/src/auth/controllers/RequestPasswordReset.ts`
- Create: `packages/api/typescript/src/auth/controllers/ResetPassword.ts`
- Modify: `packages/api/typescript/src/auth/controllers/index.ts` — export the 4
- Modify: `packages/api/typescript/src/auth/errors/index.ts` — add `PASSWORDS_DONT_MATCH`
- Test: `packages/api/typescript/src/auth/controllers/AuthDocSchemas.test.ts`

**Files to read:**
- `packages/api/typescript/src/auth/controllers/GetSession.ts`
- `packages/api/typescript/src/analytics/controllers/DeleteGoalController.ts` (clean `z.void()` return shape)

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** sonnet
**Skills:** /controller, /schema, /errors, /test
**Depends on:** T1

> These controllers are `mockController = true` — they exist only to shape the OpenAPI/SDK contract;
> the real `/v1/authentication/*` traffic is handled by T1's passthrough. They register at distinct
> paths (`/sign-up`, `/sign-in`, `/req-password-reset`, `/reset-pass`) so they never collide with the
> passthrough. Outputs are `z.void()` (the frontend consumes the real responses via the better-auth
> client, not these mock endpoints). Because bk-dash's `mockController` path throws
> `INVALID_CONTROLLER_EXAMPLES` when executed with no truthy output example, each defines
> `getMockResponse()` returning `{ status: OK, data: undefined }` — which the base class uses *instead*
> of the example lookup — so they never throw, never cast, and `handle()` returns the clean
> `{ status, data: undefined }` void shape (same as `DeleteGoalController`).

### Step T5.1 — Write the failing schema test

The contract-shaping value is the input schemas; AC-7 asserts the cross-field password refine. Create `packages/api/typescript/src/auth/controllers/AuthDocSchemas.test.ts`:

```typescript
import { describe, it, expect } from 'bun:test'
import { SignUpInputSchema } from './SignUp'
import { ResetPasswordInputSchema } from './ResetPassword'

describe('auth doc-controller schemas', () => {
	it('SignUp rejects mismatched passwords with PASSWORDS_DONT_MATCH', () => {
		const result = SignUpInputSchema.safeParse({
			body: { name: 'A', email: 'a@b.com', password: 'StrongPass1', confirmPassword: 'Different1' },
		})
		expect(result.success).toBe(false)
		expect(JSON.stringify(result.error)).toContain('PASSWORDS_DONT_MATCH')
	})

	it('SignUp accepts matching passwords', () => {
		const result = SignUpInputSchema.safeParse({
			body: { name: 'A', email: 'a@b.com', password: 'StrongPass1', confirmPassword: 'StrongPass1' },
		})
		expect(result.success).toBe(true)
	})

	it('ResetPassword rejects mismatched passwords with PASSWORDS_DONT_MATCH', () => {
		const result = ResetPasswordInputSchema.safeParse({
			body: { token: 't', newPassword: 'StrongPass1', confirmNewPassword: 'Different1' },
		})
		expect(result.success).toBe(false)
		expect(JSON.stringify(result.error)).toContain('PASSWORDS_DONT_MATCH')
	})
})
```

### Step T5.2 — Run test to verify it fails

Run: `cd packages/api/typescript && bun test src/auth/controllers/AuthDocSchemas.test.ts`
Expected: FAIL with `Cannot find module './SignUp'`

### Step T5.3 — Register the PASSWORDS_DONT_MATCH error

Modify `packages/api/typescript/src/auth/errors/index.ts`:

```diff
- export type AuthInterfaceErrors = never
+ export type AuthInterfaceErrors = 'PASSWORDS_DONT_MATCH'
  export type InterfaceErrors = BaseInterfaceErrors | AuthInterfaceErrors
```

Add to the `registerErrorCodes({...})` call:

```diff
  	INVALID_AUTH_TOKEN: HttpStatusCode.UNAUTHORIZED,
  	INVALIDATED_AUTH_TOKEN: HttpStatusCode.UNAUTHORIZED,
+ 	PASSWORDS_DONT_MATCH: HttpStatusCode.BAD_REQUEST,
  })
```

### Step T5.4 — Write the SignUp doc controller

Create `packages/api/typescript/src/auth/controllers/SignUp.ts`:

```typescript
import { injectable } from 'tsyringe-neo'
import { z, Controller, HttpStatusCode } from '@template/core-typescript'
import type { InterfaceErrors } from '@auth/errors'

export const SignUpInputSchema = z
	.object({
		body: z.object({
			name: z.string().min(2),
			email: z.email(),
			password: z.string().min(8).max(64),
			confirmPassword: z.string().min(8).max(64),
		}),
	})
	.refine(data => data.body.password === data.body.confirmPassword, {
		error: 'PASSWORDS_DONT_MATCH' as InterfaceErrors,
		path: ['body', 'confirmPassword'],
	})
	.example([{ body: { name: 'John Doe', email: 'user@example.com', password: 'password123', confirmPassword: 'password123' } }])

export const SignUpOutputSchema = z.void()

@injectable()
export class SignUpController extends Controller<typeof SignUpInputSchema, typeof SignUpOutputSchema> {
	readonly path = '/sign-up'
	readonly method = 'post' as const
	readonly description = 'Create a new user account (contract surface; handled by better-auth passthrough)'
	readonly inputSchema = SignUpInputSchema
	readonly outputSchema = SignUpOutputSchema
	override readonly mockController = true

	protected override getMockResponse() {
		return { status: HttpStatusCode.OK, data: undefined }
	}

	async handle(_request: this['input']): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: undefined }
	}
}
```

### Step T5.5 — Write the SignIn doc controller

Create `packages/api/typescript/src/auth/controllers/SignIn.ts`:

```typescript
import { injectable } from 'tsyringe-neo'
import { z, Controller, HttpStatusCode } from '@template/core-typescript'

export const SignInInputSchema = z
	.object({
		body: z.object({
			email: z.email(),
			password: z.string().min(8).max(64),
		}),
	})
	.example([{ body: { email: 'user@example.com', password: 'password123' } }])

export const SignInOutputSchema = z.void()

@injectable()
export class SignInController extends Controller<typeof SignInInputSchema, typeof SignInOutputSchema> {
	readonly path = '/sign-in'
	readonly method = 'post' as const
	readonly description = 'Sign in with email and password (contract surface; handled by better-auth passthrough)'
	readonly inputSchema = SignInInputSchema
	readonly outputSchema = SignInOutputSchema
	override readonly mockController = true

	protected override getMockResponse() {
		return { status: HttpStatusCode.OK, data: undefined }
	}

	async handle(_request: this['input']): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: undefined }
	}
}
```

### Step T5.6 — Write the RequestPasswordReset doc controller

Create `packages/api/typescript/src/auth/controllers/RequestPasswordReset.ts`:

```typescript
import { injectable } from 'tsyringe-neo'
import { z, Controller, HttpStatusCode } from '@template/core-typescript'

export const RequestPasswordResetInputSchema = z
	.object({
		body: z.object({
			email: z.email(),
			redirectTo: z.url().optional(),
		}),
	})
	.example([{ body: { email: 'user@example.com', redirectTo: 'http://localhost:5173/reset-password' } }])

export const RequestPasswordResetOutputSchema = z.void()

@injectable()
export class RequestPasswordResetController extends Controller<
	typeof RequestPasswordResetInputSchema,
	typeof RequestPasswordResetOutputSchema
> {
	readonly path = '/req-password-reset'
	readonly method = 'post' as const
	readonly description = 'Request a password reset email (contract surface; handled by better-auth passthrough)'
	readonly inputSchema = RequestPasswordResetInputSchema
	readonly outputSchema = RequestPasswordResetOutputSchema
	override readonly mockController = true

	protected override getMockResponse() {
		return { status: HttpStatusCode.OK, data: undefined }
	}

	async handle(_request: this['input']): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: undefined }
	}
}
```

### Step T5.7 — Write the ResetPassword doc controller

Create `packages/api/typescript/src/auth/controllers/ResetPassword.ts`:

```typescript
import { injectable } from 'tsyringe-neo'
import { z, Controller, HttpStatusCode } from '@template/core-typescript'
import type { InterfaceErrors } from '@auth/errors'

export const ResetPasswordInputSchema = z
	.object({
		body: z.object({
			token: z.string().min(1),
			newPassword: z.string().min(8).max(64),
			confirmNewPassword: z.string().min(8).max(64),
		}),
	})
	.refine(data => data.body.newPassword === data.body.confirmNewPassword, {
		error: 'PASSWORDS_DONT_MATCH' as InterfaceErrors,
		path: ['body', 'confirmNewPassword'],
	})
	.example([{ body: { token: 'reset-token-123', newPassword: 'newpassword123', confirmNewPassword: 'newpassword123' } }])

export const ResetPasswordOutputSchema = z.void()

@injectable()
export class ResetPasswordController extends Controller<typeof ResetPasswordInputSchema, typeof ResetPasswordOutputSchema> {
	readonly path = '/reset-pass'
	readonly method = 'post' as const
	readonly description = 'Reset password with a token (contract surface; handled by better-auth passthrough)'
	readonly inputSchema = ResetPasswordInputSchema
	readonly outputSchema = ResetPasswordOutputSchema
	override readonly mockController = true

	protected override getMockResponse() {
		return { status: HttpStatusCode.OK, data: undefined }
	}

	async handle(_request: this['input']): Promise<this['output']> {
		return { status: HttpStatusCode.OK, data: undefined }
	}
}
```

### Step T5.8 — Register the 4 controllers in the barrel

Modify `packages/api/typescript/src/auth/controllers/index.ts`:

```diff
  export { GetSessionController } from './GetSession'
  export { AuthController } from './AuthController'
+ export { SignInController } from './SignIn'
+ export { SignUpController } from './SignUp'
+ export { RequestPasswordResetController } from './RequestPasswordReset'
+ export { ResetPasswordController } from './ResetPassword'
```

### Step T5.9 — Run test to verify it passes

Run: `cd packages/api/typescript && bun test src/auth/controllers/AuthDocSchemas.test.ts`
Expected: PASS — 3 tests pass

### Step T5.10 — Type check + lint

Run: `cd packages/api/typescript && bun tsc && cd ../../.. && bun lint`
Expected: 0 errors

### Step T5.11 — Commit

```bash
git add packages/api/typescript/src/auth/controllers/SignIn.ts \
        packages/api/typescript/src/auth/controllers/SignUp.ts \
        packages/api/typescript/src/auth/controllers/RequestPasswordReset.ts \
        packages/api/typescript/src/auth/controllers/ResetPassword.ts \
        packages/api/typescript/src/auth/controllers/index.ts \
        packages/api/typescript/src/auth/errors/index.ts \
        packages/api/typescript/src/auth/controllers/AuthDocSchemas.test.ts
git commit -m "feat(auth): SDK-shaping auth doc controllers + PASSWORDS_DONT_MATCH (Task T5)"
```

---

## Task T6: Fix BETTER_AUTH_URL in .env.example

**Files to write:**
- Modify: `.env.example` — correct the better-auth base path

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** (none)
**Depends on:** (none)

### Step T6.1 — Correct the env var

Modify `.env.example`:

```diff
- BETTER_AUTH_URL=http://localhost:3030/v1/auth
+ BETTER_AUTH_URL=http://localhost:3030/v1/authentication
```

### Step T6.2 — Verify

Run: `grep -n 'BETTER_AUTH_URL' .env.example`
Expected: prints `BETTER_AUTH_URL=http://localhost:3030/v1/authentication` (matches the code default in `core/src/utils/Config.ts` and the frontend auth client's `/v1/authentication` baseURL).

### Step T6.3 — Commit

```bash
git add .env.example
git commit -m "fix(auth): align .env.example BETTER_AUTH_URL with /v1/authentication (Task T6)"
```

---

## Task T7: Contract Lock — SDK regen

**Files to write:**
- Regen: `packages/api/typescript/public/docs/openapi.json`
- Regen: `packages/client/dist/**`

**Agent:** backend-developer
**Reviewer:** spec-compliance-reviewer → code-reviewer
**Model:** haiku
**Skills:** /sdk
**Depends on:** T5

### Step T7.1 — Regenerate OpenAPI + SDK

```bash
bun emit-openapi && bun sdk
```

### Step T7.2 — Verify regen produced the auth contract

```bash
git diff --stat packages/client/dist/ packages/api/typescript/public/docs/openapi.json
grep -l -iE 'sign-?up|sign-?in|req-password-reset|reset-pass' packages/api/typescript/public/docs/openapi.json
```

Expected: `openapi.json` changed and contains the new auth paths; `packages/client/dist/**` regenerated with the `SignUp`/`SignIn`/`RequestPasswordReset`/`ResetPassword` schemas (AC-5).

### Step T7.3 — Type-check after regen

Run: `bun tsc`
Expected: 0 errors across all workspaces.

### Step T7.4 — Commit

```bash
git add packages/api/typescript/public/docs/openapi.json packages/client/dist/
git commit -m "chore(sdk): regenerate openapi+sdk for auth contract (Task T7)"
```

---

## Final Validation

- [ ] `bun tsc` — full type check clean
- [ ] `bun lint` — lint clean
- [ ] `bun run test` — backend suites pass (TS + Go)
- [ ] AC mapping (every spec AC → ≥1 test path):
  - AC-1 → `packages/api/typescript/src/auth/controllers/AuthController.test.ts:"forwards sign-up then sign-in to better-auth and returns a session"`
  - AC-2 → `packages/api/typescript/src/auth/services/Authentication/BetterAuth.emails.test.ts:"sign-up sends an account-created email to the new user (AC-2)"`
  - AC-3 → `packages/api/typescript/src/auth/services/Authentication/BetterAuth.emails.test.ts:"request-password-reset sends a reset email with the reset url (AC-3)"`
  - AC-4 → `packages/api/typescript/src/auth/services/Authentication/BetterAuth.reset.test.ts:"reset with the emailed token updates the password and lets the user sign in"`
  - AC-5 → T7.2 verification (openapi.json + `packages/client/dist/**` contain the 4 auth schemas)
  - AC-6 → `packages/api/typescript/src/auth/services/Authentication/BetterAuth.emails.test.ts:"binds MailSender to core ConsoleMailSender in the real registry (AC-6)"` + `packages/api/typescript/src/auth/services/MailSender/Emails.test.ts`
  - AC-7 → `packages/api/typescript/src/auth/controllers/AuthDocSchemas.test.ts:"SignUp rejects mismatched passwords with PASSWORDS_DONT_MATCH"`
  - AC-8 → T6.2 verification (`grep BETTER_AUTH_URL .env.example`)

## Notes

- **New dependencies (T2):** `@react-email/render` + `react` added to `packages/api/typescript/package.json`. The api-ts tsconfig already sets `jsx: react-jsx` + `jsxImportSource: react`, so no tsconfig change is needed. Run `bun install` after editing.
- **No new env vars:** the reset link uses better-auth's callback-provided `url` (built from the form's `redirectTo`), so no `APP_URL`/`BASE_APP_URL` is introduced.
- **MailSender reuse:** `MailSender` (abstract, `sendMail({ to, subject, body })`) and `ConsoleMailSender` are reused from `@template/core-typescript` — never re-declared. This plan only binds `MailSender → ConsoleMailSender` in `shared/registry.ts` (T3.3). The `SpyMailSender` used in tests is defined inline in each test file (test-only; production keeps `ConsoleMailSender`).
- **better-auth route names:** the email/reset tests use `POST /request-password-reset` and `POST /reset-password` (behind the `auth.requestPasswordReset` / `auth.resetPassword` client methods the frontend already calls). If the installed better-auth version differs, the `/forget-password` fallback is noted inline in T3.1 / T4.2 — adjust the test path; the wiring is unaffected.
- **mockController shape:** the 4 doc controllers use `z.void()` output + `mockController = true` + a `getMockResponse()` returning `{ status: OK, data: undefined }`. The base class uses `getMockResponse()` *instead of* the output-example lookup, so they never hit the `INVALID_CONTROLLER_EXAMPLES` throw, never cast, and `handle()` returns the clean void shape (matches `DeleteGoalController`). They are never hit in normal operation (the passthrough owns `/v1/authentication/*`); the frontend consumes real responses via the better-auth client. The review-plan `CTRL-06`/`bp-07` (barrel) findings are snippet-mode false positives (the 4 are exported in T5.8); `CTRL-P11` (skipMiddlewares) is a false positive (the auth context applies no default middlewares).
- **AuthController cast (T1):** `result.data as unknown as this['output']` is the required passthrough idiom — output is `z.unknown()`, and `executeController` detects the returned `Response` and returns it directly. It mirrors medscall's `Auth.ts`. The review-plan `CTRL-05`/`bp-03`/`cc-bp-04`/`CTRL-C03` findings on this file are accepted-idiom false positives (the framework's `handle` signature cannot express "returns a `Response` the runtime intercepts").
