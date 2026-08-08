import { afterEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import '@/lib/i18n'
import { Config } from '@/lib/config'
import { contactAvatarUrl } from '@/components/console/ThreadAvatar'
import { TranscriptBubble } from './index'

/**
 * WHO SAID THIS — the attribution a group conversation is unreadable without.
 *
 * The inbound bubble used to carry the text and the time and nothing else. In a 1:1 the header names
 * the other person; in a GROUP it was simply not recoverable from the screen which of five people
 * had typed the line. The read model now resolves the speaker (`transcript[].sender`) and this is the
 * component that has to SHOW it — a field on the wire that no bubble renders is the same defect
 * wearing a contract.
 *
 * WHAT IS NOT ASSERTED HERE, and why: that the PHOTO appears. Base UI's `Avatar.Image` renders
 * `null` until the browser reports the image `loaded` (see its `useImageLoadingStatus`), and
 * happy-dom loads no images at any price — so an `<img>` assertion would be a test of the DOM double,
 * not of this component. The half that CAN break silently is the url, and that half is a pure
 * function asserted below.
 */

const THREAD = '019e4d24-6524-7041-9e1c-8108180cddae'
const CHANNEL = '019e4d24-6524-7041-9e1c-8108180cddaf'
const ADA_JID = '5511900000001@s.whatsapp.net'

type Entry = Parameters<typeof TranscriptBubble>[0]['entry']

const contactEntry = (sender?: Entry['sender']): Entry => ({
	entryId: '019e4d24-6524-7041-9e1c-8108180cdd01',
	kind: 'CONTACT',
	text: 'sobe o deploy?',
	at: '10:00',
	sender,
})

describe('TranscriptBubble — an inbound line names the person who typed it', () => {
	let root: Root | null = null
	let host: HTMLElement | null = null

	const render = async (entry: Entry) => {
		host = document.createElement('div')
		document.body.appendChild(host)
		root = createRoot(host)
		await act(async () => {
			root?.render(<TranscriptBubble entry={entry} threadId={THREAD} />)
		})
		return host
	}

	afterEach(async () => {
		await act(async () => root?.unmount())
		host?.remove()
		root = null
		host = null
	})

	it('shows the sender’s name on the bubble', async () => {
		const screen = await render(contactEntry({ channelId: CHANNEL, externalId: ADA_JID, displayName: 'Ada Lovelace', hasAvatar: true }))

		expect(screen.textContent).toContain('Ada Lovelace')
		expect(screen.textContent).toContain('sobe o deploy?')
	})

	/**
	 * Falls back to the INITIALS, not to an empty circle: a third of the real contact book has no
	 * photo, so this is a normal outcome and not a degraded one.
	 */
	it('falls back to initials when the contact has no photo', async () => {
		const screen = await render(contactEntry({ channelId: CHANNEL, externalId: ADA_JID, displayName: 'Ada Lovelace', hasAvatar: false }))

		expect(screen.textContent).toContain('AL')
		expect(screen.textContent).toContain('Ada Lovelace')
	})

	/**
	 * The SAME component renders `GetIssueDetail.routedMessages`, a narrower payload with no identity
	 * on it. That must degrade to the bubble this always was — not to a blank avatar or a crash.
	 */
	it('renders a bubble with no identity at all when the payload carries none', async () => {
		const screen = await render(contactEntry(undefined))

		expect(screen.textContent).toContain('sobe o deploy?')
		expect(screen.querySelector('[data-slot="avatar"]')).toBeNull()
	})
})

/**
 * The url the `<img>` points at. Pure, and worth pinning: it is the ONE place the console addresses
 * the daemon's avatar endpoint, the JID in it carries an `@` that must survive as a path segment,
 * and the path itself must keep coming from the SDK's generated query key rather than a literal that
 * drifts the day the controller's route changes.
 */
describe('contactAvatarUrl — the daemon serves the photo, never the platform CDN', () => {
	it('addresses the daemon origin on the SDK’s own path', () => {
		const url = contactAvatarUrl(CHANNEL, ADA_JID)

		expect(url.startsWith(Config.baseUrl)).toBe(true)
		expect(url).toContain(`/v1/ui/avatars/${CHANNEL}/`)
		// `pps.whatsapp.net` appears nowhere: the CSP does not allow it and the signed url expires.
		expect(url).not.toContain('whatsapp.net/')
	})

	it('encodes the JID — an `@` is not a path separator, but it is not literal either', () => {
		expect(contactAvatarUrl(CHANNEL, ADA_JID)).toEndWith(encodeURIComponent(ADA_JID))
	})
})
