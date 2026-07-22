# Auth HTTP Surface + Transactional Emails — Design Spec

**Date:** 2026-05-29
**Status:** Draft
**Bounded Context:** `auth` (+ new `shared/services/MailSender` infrastructure)
**Kind:** feature
**Story Points:** 5 — one BC end-to-end (better-auth passthrough + 4 mock/doc controllers + one error + SDK regen) plus a self-contained new `shared` MailSender subsystem (abstract + console stub + 2 TSX templates + Layout) wired into better-auth callbacks; no migration, no entity, no cross-service contract.

## Context

The `auth` bounded context currently exposes a single HTTP surface: `GetSessionController`
(`packages/api/typescript/src/auth/controllers/GetSession.ts`). Authentication itself is owned by
better-auth, configured in `packages/api/typescript/src/auth/services/Authentication/BetterAuth.ts`
(`emailAndPassword: { enabled: true }`, `databaseHooks` bridging to
`packages/api/typescript/src/identity/services/IdentityAuthHooks.ts`, a `customSession` plugin).

The React app's auth screens **already exist and are wired to the better-auth client**:
`packages/app/react/src/routes/{sign-in,sign-up,reset-password}/` with their `-components/*Form`
calling `auth.signIn.email(...)`, `auth.signUp.email(...)`, `auth.requestPasswordReset(...)`,
`auth.resetPassword(...)` (`packages/app/react/src/lib/auth.ts`, `createAuthClient` against
`${Config.baseUrl}/v1/authentication`). But **no server-side passthrough is mounted** —
`betterAuth.auth.handler` is referenced only in a test
(`auth/services/Authentication/BetterAuth.identity-bridge.test.ts`), and no controller declares a
catch-all path. `MainRouter` auto-prepends the `/v1` version prefix to version-relative controller
paths (`packages/api/typescript/src/index.ts`), and `Config.env.BETTER_AUTH_URL` **defaults to**
`http://localhost:3030/v1/authentication` (`core/src/utils/Config.ts`), matching the client.

`@template/core-typescript` **already ships** the email abstraction —
`core/src/services/MailSender/` exports an abstract `MailSender` (`sendMail(message: MailMessage)`,
where `MailMessage = { to, subject, body }`) and a `ConsoleMailSender` impl (logs via `console.info`),
re-exported from the core barrel and covered by a core test. It is just **not bound in DI** anywhere,
and nothing sends transactional auth emails. `BetterAuth.ts` has no `sendResetPassword` callback.
`IdentityAuthHooks.onUserCreated` already raises `UserRegisteredEvent` and provisions
`UserProfile`/`UserPreferences`.

This work mirrors the reference implementation in
`/Users/gabrielaraujo/Desktop/Projetos/medscall/monorepo` (`packages/api/src/auth`): 4 doc
controllers with `mockController = true` (`SignUp`, `SignIn`, `RequestPasswordReset`, `ResetPassword`),
a `/*` passthrough `AuthController` forwarding to `betterAuth.auth.handler`, and `.tsx` email
templates rendered via `@react-email/render`. bk-dash differs from medscall in two ways we keep: the
`MailSender` lives in core with a flatter `{ to, subject, body }` shape (no `EmailTemplate` interface —
templates render to a `body` string), and the simplified `User` entity (`auth/entities/User.ts` —
`{ name?, email, emailVerified, image? }`, no document/phone/language).

## Problem

1. No server-side better-auth passthrough → the `/v1/authentication/*` sign-in/sign-up/reset endpoints
   are not served, so the existing frontend forms cannot complete a request.
2. `requestPasswordReset` mints a reset token but nothing delivers it — `BetterAuth.ts` has no
   `sendResetPassword` callback.
3. No account-created email; core ships `MailSender`/`ConsoleMailSender` but nothing binds it in DI
   or sends transactional auth emails.
4. The SDK carries no typed auth contract; the frontend forms redefine local Zod schemas instead of
   consuming SDK-shaped ones.
5. `.env.example` pins `BETTER_AUTH_URL=http://localhost:3030/v1/auth`, which mismatches the code
   default and the frontend client (`/v1/authentication`) → a copied `.env` breaks the better-auth
   basePath.

## Goal

A user can sign up, sign in, request a password reset, and reset their password end-to-end against
the TypeScript API. They receive an account-created email when they sign up and a reset email when
they request one — with delivery stubbed to the console so the flow works fully offline.

## Decisions

1. **Passthrough controller.** Add `AuthController` in `auth/controllers/` at the version-relative
   path `/authentication/*` (so `MainRouter` mounts it at `/v1/authentication/*`), methods `['get','post']`,
   forwarding `request.raw` to `betterAuth.auth.handler` and returning the `Response` via the existing
   `executeController` Response-passthrough. Mirrors medscall's `Auth.ts`.
2. **Four doc controllers**, all `mockController = true`, shaping OpenAPI/SDK only (the passthrough
   does the real work). bk-dash field shapes:
   - `SignUp`: body `{ name, email, password, confirmPassword }` + `.refine` → `PASSWORDS_DONT_MATCH`.
   - `SignIn`: body `{ email, password }`.
   - `RequestPasswordReset`: body `{ email, redirectTo? }`.
   - `ResetPassword`: body `{ token, newPassword, confirmNewPassword }` + `.refine` → `PASSWORDS_DONT_MATCH`.
3. **Email infrastructure is reused from `@template/core-typescript`, not re-declared.** Core already
   exports the abstract `MailSender` (`sendMail(message: MailMessage)`, `MailMessage = { to, subject,
   body }`) and the `ConsoleMailSender` impl. This work only **binds** `MailSender → ConsoleMailSender`
   across all three DI environments (`mock`/`integration`/`real`) in `shared/registry.ts` — no real
   provider yet.
4. **Templates** authored as react-email TSX rendered via `@react-email/render`, each exposing an async
   render returning `{ subject, body }` (HTML) consumed by core's `MailSender.sendMail({ to, ...})`:
   `ResetPasswordEmail` (display name + reset URL) and `AccountCreatedEmail` (display name), over a
   shared `Layout`. Templates live in `auth/services/MailSender/` (app content, not core). Adds
   `@react-email/render` + `react` to the api-ts package (its tsconfig already has `jsx: react-jsx`).
5. **Send sites.** The reset email is sent from better-auth's `emailAndPassword.sendResetPassword`
   callback — the only place the reset token exists. The account-created email is sent from the
   **existing** `databaseHooks.user.create.after` hook (which already carries the full user object incl.
   `name` and already calls `IdentityAuthHooks.onUserCreated`). `MailSender` is injected into `BetterAuth`.
6. **Fix** `.env.example` → `BETTER_AUTH_URL=http://localhost:3030/v1/authentication`.
7. **Register** `PASSWORDS_DONT_MATCH` in the `auth` errors union (used by the `.refine` calls and
   surfaced through the SDK).
8. **Regenerate** the SDK (`bun sdk`) once the controllers are in place.

## User Stories

- **Story 1 (sign in):** As a registered user, I want to sign in with email + password, so that I get
  an authenticated session.
  - Given a user exists with a known password, when `POST /v1/authentication/sign-in/email` is called
    with the correct credentials, then a session is returned (the existing form redirects to `/dashboard`).
  - Given a wrong password, when the same call is made, then an `UNAUTHORIZED`-class error is returned
    and no session is created.

- **Story 2 (sign up):** As a new visitor, I want to create an account, so that I can use the app and
  know my account exists.
  - Given an unused email, when `POST /v1/authentication/sign-up/email` is called with
    `{ name, email, password }`, then a user is created and an account-created email is emitted (to
    console) addressed to that email.
  - Given mismatched `password`/`confirmPassword` at the form layer, when validated against the SDK
    `SignUp` schema, then it fails with `PASSWORDS_DONT_MATCH`.

- **Story 3 (request reset):** As a user who forgot my password, I want to request a reset link, so
  that I can regain access.
  - Given a known email, when `POST /v1/authentication/request-password-reset` is called, then a reset
    email containing the reset URL/token is emitted (to console) to that email.

- **Story 4 (reset):** As a user with a reset link, I want to set a new password, so that I can sign in
  again.
  - Given a valid reset token, when `POST /v1/authentication/reset-password` is called with a new
    password, then the password is updated and a subsequent sign-in with the new password succeeds.

- **Story 5 (developer):** As a frontend developer, I want SDK-typed auth schemas, so that forms can
  validate against the same contract the backend documents.
  - Given the doc controllers exist, when `bun sdk` runs, then typed `SignUp`/`SignIn`/
    `RequestPasswordReset`/`ResetPassword` schemas are available from the SDK.

## Acceptance Criteria

- [ ] AC-1: `POST /v1/authentication/sign-in/email` with valid credentials returns a session — i.e.
  the passthrough is mounted and routes better-auth requests.
- [ ] AC-2: `POST /v1/authentication/sign-up/email` creates a user and emits a console account-created
  email addressed to that user's email.
- [ ] AC-3: `POST /v1/authentication/request-password-reset` emits a console reset email containing the
  reset URL/token addressed to the requested email.
- [ ] AC-4: `POST /v1/authentication/reset-password` with a valid token updates the password, and a
  subsequent sign-in with the new password succeeds.
- [ ] AC-5: After `bun sdk`, the SDK exposes typed `SignUp`, `SignIn`, `RequestPasswordReset`, and
  `ResetPassword` schemas.
- [ ] AC-6: `MailSender` resolves to core's `ConsoleMailSender` in the DI container (binding test),
  and the reset/account-created templates render to `{ subject, body }` HTML containing the
  recipient's name (and, for reset, the reset URL).
- [ ] AC-7: The `SignUp` and `ResetPassword` schemas reject mismatched passwords with
  `PASSWORDS_DONT_MATCH`.
- [ ] AC-8: `.env.example` sets `BETTER_AUTH_URL=http://localhost:3030/v1/authentication`.

## Out of Scope

- A real email provider (Resend / SMTP / SendGrid). Only `ConsoleMailSender` ships; the abstract
  `MailSender` makes a real impl a drop-in later.
- Email verification on signup (`emailVerification.sendVerificationEmail`).
- Mobile / Expo auth surface.

## Open Questions

- None. Both flagged judgment calls (account-created email from the `user.create.after` hook rather
  than an event-driven `UserRegisteredEvent` handler; bundling the `.env.example` fix) were confirmed
  during brainstorming.
