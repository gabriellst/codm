import { afterEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import en from '@/locales/en.json'
import pt from '@/locales/pt.json'
import { type Bindings, Container, ServicesProvider, type SupervisionState } from '@/services'
import testBindings, { FakeSupervisionService } from '@/services/registry/test'
import { SupervisionToken } from '@/services/tokens'
import { SupervisionBanner } from './SupervisionBanner'

/**
 * The console's half of runtime supervision (spec Decision 6 / AC-4 / AC-8).
 *
 * Asserted through `data-*` attributes and the button's presence rather than through copy: the
 * wording is translated and the founder's to change, but WHETHER the banner is up — and whether it
 * offers the one recovery there is — is behaviour.
 *
 * Every case runs with ZERO host present: the DI container is loaded from `registry/test`, exactly
 * as ServicesProvider.test.tsx does. If this suite needed tauri to run, the seam would be broken.
 */

function containerWith(state: SupervisionState): { container: Container; fake: FakeSupervisionService } {
	class Seeded extends FakeSupervisionService {
		constructor() {
			super(state)
		}
	}
	const container = new Container()
	container.load(testBindings)
	container.load([[SupervisionToken, Seeded]] as unknown as Bindings)
	return { container, fake: container.resolve(SupervisionToken) as FakeSupervisionService }
}

describe('SupervisionBanner', () => {
	let root: Root | null = null
	let host: HTMLElement | null = null

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host = null
	})

	function render(container: Container): HTMLElement {
		host = document.createElement('div')
		document.body.appendChild(host)
		root = createRoot(host)
		act(() => {
			root!.render(
				<ServicesProvider container={container}>
					<SupervisionBanner />
				</ServicesProvider>,
			)
		})
		return host
	}

	/**
	 * AC-8, the PULL half — and the reason the port has a `current()` at all. Mounting a console that
	 * was ALREADY down means no transition event will ever arrive; a push-only banner would leave
	 * exactly this operator with a silent, deaf console.
	 */
	it('AC-8 — mounting with the gateway already down shows the banner (no event required)', async () => {
		const { container } = containerWith({ kind: 'down', sidecar: 'gateway' })
		const el = render(container)
		await act(async () => {}) // let the mount effect's promises settle

		const banner = el.querySelector('[data-testid="supervision-banner"]')
		expect(banner).not.toBeNull()
		expect(banner?.getAttribute('data-sidecar')).toBe('gateway')
	})

	/** AC-4 — the recovery is offered, and it is the app's ONE recovery (nothing respawns silently). */
	it('AC-4 — the banner offers restart, and pressing it asks the host to restart', async () => {
		const { container, fake } = containerWith({ kind: 'down', sidecar: 'gateway' })
		const el = render(container)
		await act(async () => {})

		const button = el.querySelector<HTMLButtonElement>('[data-testid="supervision-restart"]')
		expect(button).not.toBeNull()
		await act(async () => button!.click())
		expect(fake.restarts).toBe(1)
	})

	/** AC-4 — non-dismissible: restart is the only control. A dismiss would let the operator hide the
	 *  one signal telling them their messages are not going out. */
	it('AC-4 — there is no way to dismiss it', async () => {
		const { container } = containerWith({ kind: 'down', sidecar: 'gateway' })
		const el = render(container)
		await act(async () => {})

		const buttons = el.querySelectorAll('button')
		expect(buttons).toHaveLength(1)
		expect(buttons[0]?.getAttribute('data-testid')).toBe('supervision-restart')
	})

	/** AC-4 — it goes away on its own when the gateway comes back (PUSH half). */
	it('AC-4 — recovery removes the banner without an interaction', async () => {
		const { container, fake } = containerWith({ kind: 'down', sidecar: 'gateway' })
		const el = render(container)
		await act(async () => {})
		expect(el.querySelector('[data-testid="supervision-banner"]')).not.toBeNull()

		await act(async () => fake.emit({ kind: 'healthy' }))
		expect(el.querySelector('[data-testid="supervision-banner"]')).toBeNull()
	})

	/**
	 * Decision 6 — the daemon's death is the SHELL's reaction (window hidden, boot-error splash).
	 * A console banner for it would be a second, competing story about the same failure, rendered in
	 * a window that is on its way out.
	 */
	it('Decision 6 — a dead daemon is not the console’s banner to render', async () => {
		const { container } = containerWith({ kind: 'down', sidecar: 'daemon' })
		const el = render(container)
		await act(async () => {})

		expect(el.querySelector('[data-testid="supervision-banner"]')).toBeNull()
	})

	/** `degraded` is a process that ANSWERED (503) and usually fixes itself — alarming on it is how
	 *  an operator learns to ignore alarms. */
	it('a degraded gateway raises nothing', async () => {
		const { container } = containerWith({ kind: 'degraded', sidecar: 'gateway' })
		const el = render(container)
		await act(async () => {})

		expect(el.querySelector('[data-testid="supervision-banner"]')).toBeNull()
	})

	/** AC-4 — i18n in BOTH locales. A banner that renders a raw key is a banner nobody reads. */
	it('AC-4 — the copy exists in pt and en', () => {
		for (const locale of [pt, en]) {
			expect(locale.console.supervision.gatewayDownTitle).toBeTruthy()
			expect(locale.console.supervision.gatewayDownDescription).toBeTruthy()
			expect(locale.console.supervision.restart).toBeTruthy()
		}
		expect(pt.console.supervision.gatewayDownTitle).not.toBe(en.console.supervision.gatewayDownTitle)
	})
})
