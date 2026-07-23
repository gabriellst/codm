import { invoke } from '../utils/tauri/invoke'
import type { NotificationService } from './NotificationService'

export class TauriNotificationService implements NotificationService {
	async notify(input: { title: string; body?: string }): Promise<void> {
		let granted = await invoke<boolean>('plugin:notification|is_permission_granted')
		if (!granted) {
			const permission = await invoke<string>('plugin:notification|request_permission')
			granted = permission === 'granted'
		}
		if (!granted) return
		await invoke('plugin:notification|notify', { options: { title: input.title, body: input.body } })
	}
}
