import { describe, expect, test } from 'bun:test'
import { CONTEXTS } from '@shared/contexts'
import { CLOUD_CONTEXTS, isCloudProfile, filterRoutersForCloudProfile } from '@shared/cloud-profile'

/**
 * Cloud-profile guard — CODM_PROFILE=cloud must mount ONLY auth+owner+shared (AC-1,
 * .specs/2026-08-06-sp2-conta-oauth-design.md Decision 2): no agent runtime (mailbox/MCP/provider
 * CLIs), no channel gateway, no thread/issue/workspace/ui BFF. Task T4 of
 * .plans/2026-08-06-sp2-conta-oauth.md.
 *
 * `CLOUD_CONTEXTS` + `filterRoutersForCloudProfile` live in src/shared/cloud-profile.ts (a PURE
 * module) rather than src/index.ts itself, because src/index.ts boots the real daemon at import
 * time (`./boot` side effects + `start().catch(...)`) — this test imports the filter directly,
 * never src/index.ts.
 *
 * CLOUD-01 is the falsifier named in the task: if `CLOUD_CONTEXTS` ever widens (e.g. re-adding
 * 'agent'), this exact-equality assertion goes red — a silent broadening can't slip through.
 */
describe('cloud-profile (CODM_PROFILE=cloud mounts only auth+owner+shared)', () => {
	test('CLOUD-01: CLOUD_CONTEXTS is EXACTLY {auth, owner, shared} — the AC-1 falsifier', () => {
		expect([...CLOUD_CONTEXTS].sort()).toEqual(['auth', 'owner', 'shared'])
	})

	test('CLOUD-02: every OTHER real context (derived from the CONTEXTS spine) is excluded', () => {
		const allContexts = Object.keys(CONTEXTS)
		const excluded = allContexts.filter(c => !CLOUD_CONTEXTS.has(c as never)).sort()
		expect(excluded).toEqual(['agent', 'artifact', 'external', 'issue', 'thread', 'ui', 'workspace'])
	})

	test('CLOUD-03: filterRoutersForCloudProfile keeps only auth/owner/shared under profile "cloud"', () => {
		const allRouters = Object.keys(CONTEXTS).map(name => ({ name }))
		const kept = filterRoutersForCloudProfile(allRouters, 'cloud')
		expect(kept.map(r => r.name).sort()).toEqual(['auth', 'owner', 'shared'])
	})

	test('CLOUD-04: filterRoutersForCloudProfile is a NO-OP outside profile "cloud" — the default (desktop daemon) profile mounts everything, unchanged', () => {
		const allRouters = Object.keys(CONTEXTS).map(name => ({ name }))
		for (const profile of [undefined, '', 'local', 'production', 'CLOUD']) {
			expect(filterRoutersForCloudProfile(allRouters, profile).map(r => r.name)).toEqual(allRouters.map(r => r.name))
		}
	})

	test('CLOUD-05: isCloudProfile reads CODM_PROFILE literally — only the exact string "cloud" arms it', () => {
		expect(isCloudProfile({ CODM_PROFILE: 'cloud' })).toBe(true)
		expect(isCloudProfile({ CODM_PROFILE: undefined })).toBe(false)
		expect(isCloudProfile({ CODM_PROFILE: 'Cloud' })).toBe(false)
		expect(isCloudProfile({ CODM_PROFILE: 'true' })).toBe(false)
	})

	// Negative fixture — an out-of-set context, REAL (agent) or entirely FAKE, is rejected by the
	// filter under profile 'cloud'. Proves the filter is a real allow-list check, not a pass-through
	// that happens to keep the right three names because the fixture only ever offered those three.
	test('fixture: an out-of-set context (real or fake) is rejected by the filter', () => {
		const routers = [{ name: 'auth' }, { name: 'owner' }, { name: 'shared' }, { name: 'agent' }, { name: 'totally-fake-context' }]
		const kept = filterRoutersForCloudProfile(routers, 'cloud')
		expect(kept.map(r => r.name).sort()).toEqual(['auth', 'owner', 'shared'])
	})
})
