/**
 * Auto-update — the declarative half (SP1, `.specs/2026-08-06-sp1-release-autoupdate-design.md`).
 *
 * ### Two channels, one mechanism (roadmap decision 3)
 * `stable` rides GitHub's own `releases/latest` pointer, which SKIPS prereleases by nature — that
 * is exactly the stable semantic, no server needed. `beta` is a ROLLING prerelease under the fixed
 * tag `beta`, whose assets the beta workflow replaces on every merge to main. The asset filename is
 * FIXED (`codm-aarch64.app.tar.gz`) so the manifest URL never changes across beta versions — the
 * version lives in `latest.json`, not in the URL.
 *
 * ### Who reads what
 * `generate.ts` renders `pubkey` + the STABLE endpoint into `tauri.conf.json` (`plugins.updater`) —
 * stable is the default every installed app boots with. The BETA endpoint is consumed by the Rust
 * side (`src/updater.rs`), which overrides the endpoint list at runtime when the machine opted into
 * beta (env `CODM_UPDATE_CHANNEL=beta` or a `update-channel` file in the data dir). Rust cannot
 * import this file, so `updater.rs` MIRRORS the beta URL and names this file as its source of truth
 * — same seam rule as `walker.go` mirroring `template.config.ts`, and `generate.test.ts` (DSK-07)
 * gates the two copies against drift.
 *
 * ### The pubkey is PUBLIC material
 * It only verifies signatures. The PRIVATE key never enters the repo: it lives in
 * `~/.tauri/codm-updater.key` on the founder's machine and as the `TAURI_SIGNING_PRIVATE_KEY`
 * secret in GitHub Actions. Losing it means shipped apps refuse every future update — back it up
 * (docs/RELEASE.md).
 *
 * The repo slug is a genuine shell decision (it names where releases live, not a workspace fact),
 * so it is a constant here rather than a `REPO` read — the same rule that keeps window sizing local.
 *
 * ### Endpoints point at R2, not GitHub (SP2.5)
 * `repo` is private, so an anonymous `GET` against `releases/.../latest.json` 404s for every
 * installed app — GitHub has no concept of a public, unauthenticated release asset on a private
 * repo. The upload workflow (Task T1) mirrors both channels' `latest.json` + the update asset to a
 * public Cloudflare R2 bucket on every release, and these two endpoints read from there instead.
 * `repo` itself stays — it is still where releases live, just no longer where the updater reads.
 */
export const UPDATER = {
	repo: 'gabriellst/codm',
	pubkey:
		'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEQzMjEzMzQwOTY5MkUxMjcKUldRbjRaS1dRRE1oMDVKSTE2UFZiaVNZYjNTeU4wYnl3RUdXN1V4eG5zSjRiQ3V3QXVIamtxMkgK',
	/** The fixed asset name both workflows upload and both endpoints' manifests point at. */
	updateAsset: 'codm-aarch64.app.tar.gz',
	stableEndpoint: 'https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev/stable/latest.json',
	betaEndpoint: 'https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev/beta/latest.json',
} as const
