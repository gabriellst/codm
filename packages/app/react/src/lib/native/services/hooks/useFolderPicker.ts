import { useEffect, useState } from 'react'
import { useFilePickerService } from '../NativeProvider'

/**
 * The pick-a-folder flow over the FilePickerService port. Capability-driven, never
 * platform-driven: `supported` reflects what the bound FilePickerService REPORTS —
 * when false (browser: no path-capable picker) the UI keeps its manual path
 * input as the only affordance; when true, `pick()` opens the OS picker and
 * hands the chosen ABSOLUTE path to `onPicked` (cancel → no call, honest null).
 */
export function useFolderPicker(onPicked: (path: string) => void, options?: { title?: string }) {
	const filePicker = useFilePickerService()
	const [supported, setSupported] = useState(false)

	useEffect(() => {
		let cancelled = false
		filePicker.supportsFolderPicker().then(value => {
			if (!cancelled) setSupported(value)
		})
		return () => {
			cancelled = true
		}
	}, [filePicker])

	const pick = async () => {
		const path = await filePicker.pickFolder(options)
		if (path) onPicked(path)
	}

	return { supported, pick }
}
