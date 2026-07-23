import { describe, expect, it } from 'bun:test'
import { renderToString } from 'react-dom/server'
import { type Bindings, Container } from '../core/container'
import { useFilePicker, useService } from '../hooks'
import testBindings, { FakeFilePickerService } from '../registry/test'
import { FilePickerToken } from '../tokens'
import { ServicesProvider, useContainer } from './ServicesProvider'

/**
 * DI proof — the console runs against ANY binding with ZERO host present. A Container
 * `load`ed from the `test` environment (fakes) is injected through the ServicesProvider
 * `container` prop; consumers reach it via useService()/the capability hooks. This is
 * the frontend analogue of the backend's TestBed child-container-per-suite.
 *
 * The registry is DECLARATIVE (`[Token, Class]`) and the Container owns every `new`, so a
 * test that needs a SEEDED fake binds a tiny seeded subclass (keeping `new *Service` out of
 * the test) and reads back the constructed singleton via `container.resolve`.
 *
 * renderToString (no jsdom) doesn't run effects or fire clicks, so the AddWorkspace
 * folder-pick flow is exercised imperatively through a Probe that makes the SAME port
 * calls the component makes (supportsFolderPicker + pickFolder).
 */

function testContainer(overrides?: Bindings): Container {
	const c = new Container()
	c.load(testBindings)
	if (overrides) c.load(overrides)
	return c
}

describe('ServicesProvider DI', () => {
	it('resolves the singleton the injected (test-env) container constructs from the bound class', () => {
		class SeededPicker extends FakeFilePickerService {
			constructor() {
				super('/tmp/x')
			}
		}
		const container = testContainer([[FilePickerToken, SeededPicker]])

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
		expect(captured).toBeInstanceOf(SeededPicker)
		expect(captured).toBe(container.resolve(FilePickerToken)) // the hook resolved the same singleton
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

	it('AddWorkspace folder-pick flow: a FilePicker fake bound via the container fills the path — no tauri', async () => {
		class SeededPicker extends FakeFilePickerService {
			constructor() {
				super('/Users/dev/acme-storefront')
			}
		}
		const container = testContainer([[FilePickerToken, SeededPicker]])

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
		// the picker the hook handed out is the container's singleton — its calls are recorded there
		const fake = container.resolve(FilePickerToken) as FakeFilePickerService
		expect(fake.calls).toEqual([{ title: 'Add a workspace' }])
	})

	it('folder-pick flow does NOT fill the path on cancel/unsupported (honest null)', async () => {
		const container = testContainer() // default FakeFilePickerService → returns null

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
