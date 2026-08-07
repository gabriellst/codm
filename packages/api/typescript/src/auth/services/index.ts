// Auth services barrel. The better-auth lifecycle bridge (IdentityAuthHooks) was removed in the
// operator collapse and stays gone — the surviving services (MailSender templates) are imported
// directly by their consumers. The better-auth INSTANCE itself is back (SP2 T1), scoped to the
// cloud profile: the local daemon profile never resolves `BetterAuth` (see auth/registry.ts).
export * from './Authentication'
// The LOCAL daemon's login gate (SP2 T7) — the mirror image of BetterAuth: never resolved by the
// cloud profile, read by every install's own DrizzleMailboxDispatcher (see auth/registry.ts).
export * from './CloudSession'
