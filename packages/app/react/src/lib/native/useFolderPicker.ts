import { useEffect, useState } from 'react'
import { useDialogService } from './NativeProvider'

/**
 * The pick-a-folder flow over the DialogService port. Capability-driven, never
 * platform-driven: `supported` reflects what the bound DialogService REPORTS —
 * when false (browser: no path-capable picker) the UI keeps its manual path
 * input as the only affordance; when true, `pick()` opens the OS picker and
 * hands the chosen ABSOLUTE path to `onPicked` (cancel → no call, honest null).
 */
export function useFolderPicker(onPicked: (path: string) => void, options?: { title?: string }) {
	const dialog = useDialogService()
	const [supported, setSupported] = useState(false)

	useEffect(() => {
		let cancelled = false
		dialog.supportsFolderPicker().then(value => {
			if (!cancelled) setSupported(value)
		})
		return () => {
			cancelled = true
		}
	}, [dialog])

	const pick = async () => {
		const path = await dialog.pickFolder(options)
		if (path) onPicked(path)
	}

	return { supported, pick }
}
