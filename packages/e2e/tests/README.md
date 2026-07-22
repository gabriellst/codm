# Template E2E flows

Cross-stack canonical flows exercised through Playwright against the dev servers
(`api-typescript` + `app-react`, booted by `playwright.config.ts` webServer).

| # | Spec | Flow |
|---|------|------|
| 1 | `01-auth-signup-signin` | UI sign-up form → authenticated shell; sign-in with existing credentials |
| 2 | `02-profile-update` | Settings → Account preferences persisted on the UserProfile aggregate |
| 3 | `03-owner-create` | API: create Owner → set active → visible via BFF GetUserInfo |
| 4 | `04-billing-subscribe-cancel-quota` | API: sandbox subscribe → cancel → plans/usage readable (needs `BILLING_SANDBOX=true`) |
| 5 | `05-notification-inbox` | API: SendNotification fan-out → unread inbox → mark read |

Support layer: `utils/test.ts` (typed `goto`, `loginAs`, `given.freshUser`, network logger),
`utils/given/` (API sign-up + session injection + authenticated SDK client), `utils/i18n.ts`
(assert against the app's own locale strings, never hardcoded copy).
