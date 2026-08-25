import { afterEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import en from '@/locales/en.json'
import pt from '@/locales/pt.json'
import { type Bindings, Container, ServicesProvider } from '@/services'
import testBindings, { FakeUpdateService } from '@/services/registry/test'
import { UpdateToken } from '@/services/tokens'
import { UpdateReadyPill } from './UpdateReadyPill'

/**
 * The console's half of the "reinicie para atualizar" flow: the shell installs updates silently
 * and never restarts on its own, so this pill is the only surface that offers the restart and the
 * only place the operator learns a version is ready.
 *
 * Every case runs with ZERO host present — the DI container is loaded from `registry/test`, exactly
 * as SupervisionBanner.test.tsx does. If this suite needed tauri to run, the seam would be broken.
 */

function containerWith(version: string | null): { container: Container; fake: FakeUpdateService } {
	class Seeded extends FakeUpdateService {
		constructor() {
			super(version)
		}
	}
	const container = new Container()
	container.load(testBindings)
	container.load([[UpdateToken, Seeded]] as unknown as Bindings)
	return { container, fake: container.resolve(UpdateToken) as FakeUpdateService }
}

describe('UpdateReadyPill', () => {
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
					<UpdateReadyPill />
				</ServicesProvider>,
			)
		})
		return host
	}

	/** The common case — no update pending, nothing renders. */
	it('renders nothing when no update is pending', async () => {
		const { container } = containerWith(null)
		const el = render(container)
		await act(async () => {})

		expect(el.querySelector('[data-testid="update-ready-pill"]')).toBeNull()
	})

	/** The PULL half — a console that mounts AFTER the shell already finished installing must still
	 *  see the pill; no event will ever arrive for it. */
	it('mounting with an update already installed shows the pill (no event required)', async () => {
		const { container } = containerWith('1.4.0')
		const el = render(container)
		await act(async () => {})

		const pill = el.querySelector('[data-testid="update-ready-pill"]')
		expect(pill).not.toBeNull()
		expect(pill?.getAttribute('data-version')).toBe('1.4.0')
	})

	/** The PUSH half — an install completing while the console is open shows the pill without a
	 *  reload. */
	it('an install completing while mounted shows the pill (PUSH)', async () => {
		const { container, fake } = containerWith(null)
		const el = render(container)
		await act(async () => {})
		expect(el.querySelector('[data-testid="update-ready-pill"]')).toBeNull()

		await act(async () => fake.emit('2.0.1'))
		const pill = el.querySelector('[data-testid="update-ready-pill"]')
		expect(pill).not.toBeNull()
		expect(pill?.getAttribute('data-version')).toBe('2.0.1')
	})

	/** Clicking the pill is the only thing that restarts the app — the shell never does it alone. */
	it('clicking the pill asks the host to restart', async () => {
		const { container, fake } = containerWith('1.4.0')
		const el = render(container)
		await act(async () => {})

		const button = el.querySelector<HTMLButtonElement>('[data-testid="update-ready-pill"]')
		expect(button).not.toBeNull()
		await act(async () => button!.click())
		expect(fake.restarts).toBe(1)
	})

	/** i18n in BOTH locales. A pill that renders a raw key is a pill nobody reads. */
	it('the copy exists in pt and en', () => {
		for (const locale of [pt, en]) {
			expect(locale.console.update.restartTitle).toBeTruthy()
			expect(locale.console.update.version).toBeTruthy()
		}
		expect(pt.console.update.restartTitle).not.toBe(en.console.update.restartTitle)
	})
})
