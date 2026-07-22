import { test, expect } from '../utils/test'

/**
 * Realtime Notion-like page spec.
 *
 * Validates the SSE live-update path: a block added via the API while the page
 * is already open in the browser appears in the DOM without any navigation or
 * reload. The `integration.shared.page.content_changed` SSE event triggers a
 * React Query invalidation and the new block renders automatically.
 *
 * All state is set up via the authenticated REST API — NOT through the UI.
 * Selectors use role / text only; never test-id attributes.
 */

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3030'

/**
 * Minimal typed helper for authenticated API calls inside a spec.
 * Returns parsed JSON. Throws on non-2xx.
 */
async function api(
	method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
	path: string,
	token: string,
	body?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const url = `${API_BASE_URL}${path}`
	const response = await fetch(url, {
		method,
		headers: {
			'Content-Type': 'application/json',
			Cookie: `better-auth.session_token=${token}`,
			Origin: API_BASE_URL,
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
	})

	if (!response.ok) {
		const text = await response.text()
		throw new Error(`API ${method} ${path} failed (${response.status}): ${text}`)
	}

	return (await response.json()) as Record<string, unknown>
}

test('notion page realtime — block added via API appears live without reload', async ({
	page,
	given,
	network,
}) => {
	// ------------------------------------------------------------------
	// 1. Authenticated session — cookie injected into the browser context
	// ------------------------------------------------------------------
	const { session } = await given.freshUser()
	const token = session.token

	// ------------------------------------------------------------------
	// 2a. Create workspace
	// ------------------------------------------------------------------
	const workspaceData = await api('POST', '/v1/workspaces', token, {
		name: 'My Workspace',
	})
	const workspaceId = workspaceData.id as string
	expect(typeof workspaceId).toBe('string')

	// ------------------------------------------------------------------
	// 2b. Create page
	// ------------------------------------------------------------------
	const pageData = await api('POST', '/v1/pages', token, {
		workspaceId,
		title: 'My Page',
	})
	const pageId = pageData.id as string
	expect(typeof pageId).toBe('string')

	// ------------------------------------------------------------------
	// 2c. Seed one initial block so the page renders content
	// ------------------------------------------------------------------
	const initialSuffix = crypto.randomUUID().slice(0, 8)
	const initialContent = `Initial block content ${initialSuffix}`

	const seedBlockData = await api('POST', `/v1/pages/${pageId}/blocks`, token, {
		type: 'TEXT',
		content: initialContent,
		parentBlockId: null,
	})
	const seedBlockId = seedBlockData.id as string
	expect(typeof seedBlockId).toBe('string')

	// ------------------------------------------------------------------
	// 3. Open the page in the browser — SSE connection established here
	// ------------------------------------------------------------------
	await page.goto(`/app/workspaces/${workspaceId}/pages/${pageId}`)

	// The seeded block must be visible — proves the page + SSE are live
	await expect(page.getByText(initialContent)).toBeVisible()

	// ------------------------------------------------------------------
	// 4. LIVE-UPDATE ASSERTION
	//    Add a NEW block via the API while the page is still open.
	//    No reload, no navigation — the SSE `integration.shared.page.content_changed`
	//    event triggers a React Query invalidation and the new block renders
	//    automatically in the DOM.
	// ------------------------------------------------------------------
	const liveSuffix = crypto.randomUUID().slice(0, 8)
	const liveContent = `Live heading block ${liveSuffix}`

	await api('POST', `/v1/pages/${pageId}/blocks`, token, {
		type: 'HEADING',
		content: liveContent,
		parentBlockId: null,
	})

	// Assert the new block appears WITHOUT any page reload
	await expect(page.getByText(liveContent)).toBeVisible()

	// The initial seed block must still be visible (no full re-render wipe)
	await expect(page.getByText(initialContent)).toBeVisible()

	// ------------------------------------------------------------------
	// 5. (Optional) Second realtime assertion — edit a block via PATCH
	//    and verify the updated text appears live while old text is gone
	// ------------------------------------------------------------------
	const editedSuffix = crypto.randomUUID().slice(0, 8)
	const editedContent = `Edited block content ${editedSuffix}`

	await api('PATCH', `/v1/pages/${pageId}/blocks/${seedBlockId}`, token, {
		content: editedContent,
	})

	// Edited text must appear live
	await expect(page.getByText(editedContent)).toBeVisible()

	// Old text for that block must no longer be visible
	await expect(page.getByText(initialContent)).not.toBeVisible()

	// network fixture auto-attaches failure log on error — no explicit call needed
	void network
})
