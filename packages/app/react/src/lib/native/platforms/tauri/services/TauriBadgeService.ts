import type { BadgeService } from '../../../contract'
import { invoke } from '../invoke'

export class TauriBadgeService implements BadgeService {
	async set(count: number | null): Promise<void> {
		await invoke('plugin:window|set_badge_count', { value: count ?? undefined, label: 'main' })
	}
}
