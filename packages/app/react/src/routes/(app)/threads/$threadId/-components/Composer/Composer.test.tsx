import { afterEach, describe, expect, it } from 'bun:test'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ThreadMode } from '@codm/client-typescript/typescript'
import { Composer } from './index'

/**
 * F4 — THE SELECTOR IS GONE, AND THE MODE FOLLOWS THE THREAD.
 *
 * The composer used to render a STEER/DIRECT toggle seeded into `useState`. Two defects in one
 * control: it asked the operator a question the app already knew the answer to, and the seed meant a
 * thread pausing while the box was focused left Enter doing one thing while the header said another.
 *
 * The mode is asserted through a `data-mode` attribute rather than by matching the hint text: the
 * wording is translated and the founder's to change, but which branch is live is behaviour.
 */
describe('Composer — no mode selector (F4)', () => {
	let root: Root | null = null
	let host: HTMLElement | null = null

	afterEach(() => {
		act(() => root?.unmount())
		root = null
		host = null
	})

	function render(composerMode: ThreadMode): HTMLElement {
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
		host = document.createElement('div')
		document.body.appendChild(host)
		root = createRoot(host)
		act(() => {
			root!.render(
				<QueryClientProvider client={queryClient}>
					<Composer threadId="019e4d24-6524-7041-9e1c-8108180cddae" composerMode={composerMode} />
				</QueryClientProvider>,
			)
		})
		return host
	}

	/**
	 * AC-F4.1, browser half. The backend decides paused → STEER; this asserts the composer OBEYS that
	 * decision instead of re-deciding it, in both directions — a component hard-wired to one mode would
	 * satisfy either case alone.
	 */
	it('AC-F4.1 — the composer is in the mode the server sent, in both directions', () => {
		expect(render('STEER').querySelector('[data-testid="composer"]')?.getAttribute('data-mode')).toBe('STEER')

		act(() => root?.unmount())
		root = null

		expect(render('DIRECT').querySelector('[data-testid="composer"]')?.getAttribute('data-mode')).toBe('DIRECT')
	})

	/**
	 * FALSIFIER: restore the `MODES.map(...)` toggle in `Composer` and this goes red. The assertion is
	 * on BUTTONS rather than on the removed labels, because re-adding the control under new copy would
	 * be the same regression.
	 */
	it('renders exactly one button — send. There is no mode control to press', () => {
		const buttons = render('STEER').querySelectorAll('button')

		expect(buttons).toHaveLength(1)
		expect(buttons[0]?.getAttribute('aria-label')).toBeTruthy()
	})

	it('a re-render with a new mode changes what the composer will do — the mode is not seeded once', () => {
		const container = render('DIRECT')
		expect(container.querySelector('[data-testid="composer"]')?.getAttribute('data-mode')).toBe('DIRECT')

		// The thread pauses underneath the operator: same mounted component, new prop.
		act(() => {
			root!.render(
				<QueryClientProvider client={new QueryClient()}>
					<Composer threadId="019e4d24-6524-7041-9e1c-8108180cddae" composerMode="STEER" />
				</QueryClientProvider>,
			)
		})

		expect(container.querySelector('[data-testid="composer"]')?.getAttribute('data-mode')).toBe('STEER')
	})
})
