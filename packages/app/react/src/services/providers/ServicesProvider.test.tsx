import { describe, expect, it } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { Container } from '../core/container'
import { FakeFilePickerService, registerTest } from '../environments/test'
import { useFilePicker, useService } from '../hooks'
import { FilePickerToken } from '../tokens'
import { ServicesProvider, useContainer } from './ServicesProvider'

/**
 * DI proof — the console runs against ANY binding with ZERO host present. A Container
 * wired from the `test` environment (fakes) is injected through the ServicesProvider
 * `container` prop; consumers reach it via useService()/the capability hooks. This is
 * the frontend analogue of the backend's TestBed child-container-per-suite.
 *
 * renderToString (no jsdom) doesn't run effects or fire clicks, so the AddWorkspace
 * folder-pick flow is exercised imperatively through a Probe that makes the SAME port
 * calls the component makes (supportsFolderPicker + pickFolder).
 */

function testContainer(overrides?: (c: Container) => void): Container {
	const c = new Container()
	registerTest(c)
	overrides?.(c)
	return c
}

describe('ServicesProvider DI', () => {
	it('resolves the exact instance the injected (test-env) container bound', () => {
		const fake = new FakeFilePickerService('/tmp/x')
		const container = testContainer(c => c.register(FilePickerToken, () => fake))

		let captured: unknown = null
		function Probe() {
			captured = useFilePicker()
			return null
		}
		renderToString(
			<ServicesProvider container={container}>
				<Probe />
			</ServicesProvider>,
		)
		expect(captured).toBe(fake)
	})

	it('useService() outside a ServicesProvider fails loud (no silent host guessing)', () => {
		function Orphan() {
			useService(FilePickerToken)
			return null
		}
		expect(() => renderToString(<Orphan />)).toThrow(/outside <ServicesProvider>/)
	})

	it('useContainer() outside a ServicesProvider throws too', () => {
		function Orphan() {
			useContainer()
			return null
		}
		expect(() => renderToString(<Orphan />)).toThrow(/outside <ServicesProvider>/)
	})

	it('AddWorkspace folder-pick flow: a FilePicker fake injected via the container fills the path — no tauri', async () => {
		const fake = new FakeFilePickerService('/Users/dev/acme-storefront')
		const container = testContainer(c => c.register(FilePickerToken, () => fake))

		const picked: string[] = []
		let filePicker: ReturnType<typeof useFilePicker> | null = null
		function Probe() {
			filePicker = useFilePicker()
			return null
		}
		renderToString(
			<ServicesProvider container={container}>
				<Probe />
			</ServicesProvider>,
		)

		// The exact calls AddWorkspaceDialog makes: gate on capability, then pick.
		expect(await filePicker!.supportsFolderPicker()).toBe(true)
		const path = await filePicker!.pickFolder({ title: 'Add a workspace' })
		if (path) picked.push(path)

		expect(picked).toEqual(['/Users/dev/acme-storefront'])
		expect(fake.calls).toEqual([{ title: 'Add a workspace' }])
	})

	it('folder-pick flow does NOT fill the path on cancel/unsupported (honest null)', async () => {
		const fake = new FakeFilePickerService(null)
		const container = testContainer(c => c.register(FilePickerToken, () => fake))

		const picked: string[] = []
		let filePicker: ReturnType<typeof useFilePicker> | null = null
		function Probe() {
			filePicker = useFilePicker()
			return null
		}
		renderToString(
			<ServicesProvider container={container}>
				<Probe />
			</ServicesProvider>,
		)

		const path = await filePicker!.pickFolder()
		if (path) picked.push(path)
		expect(picked).toEqual([])
	})
})
