import { describe, expect, it } from 'bun:test'
import { renderToString } from 'react-dom/server'
import type { FilePickerService, NativeServices } from './contract'
import { NativeProvider, useNative } from './NativeProvider'
import { useFolderPicker } from './useFolderPicker'

/**
 * DI proof: the console runs against ANY implementation of the native contract
 * with ZERO tauri present — a fake NativeServices injected through the
 * NativeProvider `services` prop reaches consumers via useNative()/the
 * capability hooks, and the AddWorkspace folder-pick flow (useFolderPicker)
 * fills the path from whatever the bound FilePickerService returns.
 */

class FakeFilePickerService implements FilePickerService {
	calls: Array<{ title?: string } | undefined> = []
	constructor(private readonly result: string | null) {}

	async supportsFolderPicker(): Promise<boolean> {
		return true
	}

	async pickFolder(options?: { title?: string }): Promise<string | null> {
		this.calls.push(options)
		return this.result
	}
}

function fakeServices(filePicker: FilePickerService): NativeServices {
	const unused = () => {
		throw new Error('port not under test')
	}
	return {
		filePicker,
		notification: { notify: unused },
		badge: { set: unused },
		secrets: { get: unused, set: unused, delete: unused },
		autostart: { isEnabled: unused, enable: unused, disable: unused },
		hostInfo: { platform: async () => 'browser' },
	}
}

describe('NativeProvider DI', () => {
	it('injects the fake services instance — consumers get EXACTLY what the composition root bound', () => {
		const services = fakeServices(new FakeFilePickerService('/tmp/fake'))
		let captured: NativeServices | null = null
		function Probe() {
			captured = useNative()
			return null
		}
		renderToString(
			<NativeProvider services={services}>
				<Probe />
			</NativeProvider>,
		)
		expect(captured).toBe(services)
	})

	it('useNative() outside a NativeProvider fails loud (no silent platform guessing)', () => {
		function Orphan() {
			useNative()
			return null
		}
		expect(() => renderToString(<Orphan />)).toThrow(/outside <NativeProvider>/)
	})

	it('folder-pick flow fills the path from the fake FilePickerService — no tauri anywhere', async () => {
		const filePicker = new FakeFilePickerService('/Users/dev/acme-storefront')
		const picked: string[] = []
		let flow: ReturnType<typeof useFolderPicker> | null = null
		function Probe() {
			flow = useFolderPicker(path => picked.push(path), { title: 'Add a workspace' })
			return null
		}
		renderToString(
			<NativeProvider services={fakeServices(filePicker)}>
				<Probe />
			</NativeProvider>,
		)

		await flow!.pick()
		expect(picked).toEqual(['/Users/dev/acme-storefront'])
		expect(filePicker.calls).toEqual([{ title: 'Add a workspace' }])
	})

	it('folder-pick flow does NOT fill the path on cancel/unsupported (honest null)', async () => {
		const filePicker = new FakeFilePickerService(null)
		const picked: string[] = []
		let flow: ReturnType<typeof useFolderPicker> | null = null
		function Probe() {
			flow = useFolderPicker(path => picked.push(path))
			return null
		}
		renderToString(
			<NativeProvider services={fakeServices(filePicker)}>
				<Probe />
			</NativeProvider>,
		)

		await flow!.pick()
		expect(picked).toEqual([])
	})
})
