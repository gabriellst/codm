# SPEC-22: `ConnectIntegration` — drop defensive ternaries, fail fast

**Wave:** 4   **Stream:** B   **Depends on:** SPEC-15, SPEC-19, SPEC-21, SPEC-23   **Status:** done

## Motivation

`ConnectIntegration.ts` today is full of defensive scaffolding:

```ts
const tokens = oauthExchanger !== undefined && input.oauthCode !== undefined
  ? await oauthExchanger.exchange({
      code: input.oauthCode,
      shopIdentifier: credFields.shopDomain ?? credFields.shopIdentifier ?? '',
    })
  : undefined

const sealedPayload: Record<string, string> = { ...credFields }
if (tokens !== undefined) {
  sealedPayload.accessToken = tokens.accessToken
  if (tokens.refreshToken !== undefined) sealedPayload.refreshToken = tokens.refreshToken
  if (tokens.scope !== undefined) sealedPayload.scope = tokens.scope
}
```

And:

```ts
const platform: PlatformProps = PlatformSchema.parse({
  type: input.type,
  platform: input.platform,
})
```

— the use case parses `PlatformSchema` even though the input schema already validates it. Re-parsing is redundant.

The defensive ternaries hide bugs: a misconfigured (type, platform) pair silently produces `tokens = undefined`, then `sealedPayload` is missing the OAuth fields, then a later vault lookup fails far from the cause.

After Waves 3 + 4's earlier specs, the registry knows what's expected per platform. The use case can fail-fast at the entry.

## Scope

### Remove the redundant `PlatformSchema.parse`

The use case's `InputSchema` (post-SPEC-23) is:
```ts
z.object({ type: z.enum(StoreIntegrationType), platform: z.string(), integrationIdentifier: ..., ... })
```

That's broad. Validate the platform discrimination at the use-case entry by doing ONE `PlatformSchema.parse({ type: input.type, platform: input.platform })`. Use the parsed value going forward — drop any subsequent `PlatformSchema.parse(...)` calls inside the use case.

### Fail-fast on credential shape

At the top of `execute(input)`:

```ts
const platform = PlatformSchema.parse({ type: input.type, platform: input.platform })
const descriptor = platformDescriptor(platform)

if (descriptor.authMode === AuthMode.OAUTH) {
  if (input.oauthCode === undefined) {
    throw new BaseError<IntegrationApplicationErrors>(
      'INTEGRATION_MISSING_OAUTH_CODE',
      `${platform.platform} requires OAuth code`,
    )
  }
} else {
  // MANUAL
  if (input.credentials === undefined) {
    throw new BaseError<IntegrationApplicationErrors>(
      'INTEGRATION_MISSING_CREDENTIALS',
      `${platform.platform} requires manual credentials`,
    )
  }
  for (const field of descriptor.inputTokens) {
    if (!input.credentials[field]) {
      throw new BaseError<IntegrationApplicationErrors>(
        'INTEGRATION_MISSING_CREDENTIAL_FIELD',
        `missing credential field: ${field}`,
      )
    }
  }
}
```

After this, the body knows:
- `input.oauthCode` is defined IFF `descriptor.authMode === OAUTH`
- `input.credentials` is defined and complete IFF `descriptor.authMode === MANUAL`

No more `?? undefined` ternaries.

### Drop the `?? ''` `externalIdSeed`

Post-SPEC-23, the use case has `input.integrationIdentifier: string` (required by schema). The deterministic id is:

```ts
const id = StoreIntegration.deterministicId(platform, input.integrationIdentifier)
```

No fallback needed.

### `sealedPayload` becomes unconditional

After dispatching to the exchanger (`oauthFactory` or `manualFactory` per SPEC-15), the result is `OAuthExchangeResult` with `tokens: NormalizedTokens`. The vault payload is just `tokens` (unconditionally):

```ts
const sealedPayload = result.tokens  // already shaped per descriptor.outputTokens
await this.credentialVault.seal({ storeIntegrationId, payload: sealedPayload })
```

No ternaries, no field-by-field copying.

### New error codes

Add to integration error registry (with HTTP 400 mappings — they're client input errors):
- `INTEGRATION_MISSING_OAUTH_CODE`
- `INTEGRATION_MISSING_CREDENTIALS`
- `INTEGRATION_MISSING_CREDENTIAL_FIELD`

## Affected files

- `packages/api/typescript/src/integration/usecases/ConnectIntegration.ts` — significant rewrite of the orchestration body
- `packages/api/typescript/src/integration/errors.ts` (or wherever) — register the three new error codes
- `packages/api/typescript/src/integration/usecases/ConnectIntegration.test.ts` — cover OAuth-missing-code, Manual-missing-credentials, Manual-missing-field, happy paths
- Frontend i18n: entries for the three new error codes

## Acceptance criteria

- [ ] No `??` chains in `ConnectIntegration.ts` for resolving fields that the registry already defines.
- [ ] Exactly one `PlatformSchema.parse(...)` per `execute()` invocation (at the entry).
- [ ] Fail-fast assertions in place for OAuth (oauthCode required) and Manual (credentials + each `inputTokens` field required).
- [ ] `sealedPayload` is just `result.tokens` — no conditional field copying.
- [ ] Three new error codes registered and tested.
- [ ] `bun tsc` clean.
- [ ] `bun run test` clean.

## Out of scope

- Schema-level discrimination in the input (e.g. `z.discriminatedUnion('authMode', [oauthVariant, manualVariant])`). Could be done but adds complexity; the runtime fail-fast assertions are sufficient.
- Re-handshaking after connect — the existing post-connect handshake flow stays.

## Notes

- The fail-fast pattern is "throw with a named code at the moment the precondition is detected." Don't soft-handle missing fields ("if (!x) return") — that hides the bug.
- The three error codes are distinct because the frontend's recovery UX differs:
  - `MISSING_OAUTH_CODE` → "OAuth callback failed; retry connect."
  - `MISSING_CREDENTIALS` → "Manual fields not provided."
  - `MISSING_CREDENTIAL_FIELD` → "Field X is empty."
- If a future iteration adds `authMode: 'API_KEY'` or other modes, the dispatch grows a new branch. The fail-fast pattern still applies.
