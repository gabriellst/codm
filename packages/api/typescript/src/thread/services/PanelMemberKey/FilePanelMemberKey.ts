import { injectable } from 'tsyringe-neo'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { Config, resolveDataDir } from '@codm/core-typescript'
import { PanelMemberKey } from './PanelMemberKey'

const KEY_FILENAME = 'panel-member.key'
const KEY_BYTES = 32

/**
 * The real key: 32 random bytes in `<CODM_DATA_DIR>/panel-member.key` (0600), created on first use —
 * the same at-rest shape `FileCloudSession` uses for the session. A file and not a table: there is
 * nothing to migrate and nothing for the Go gateway to mirror. Losing it only changes every member id
 * (a verified browser becomes "nobody" and identifies again).
 */
@injectable()
export class FilePanelMemberKey extends PanelMemberKey {
	private cached: Buffer | undefined

	protected key(): Buffer {
		this.cached ??= this.loadOrCreate()
		return this.cached
	}

	private loadOrCreate(): Buffer {
		const dir = resolveDataDir(Config.env.CODM_DATA_DIR)
		const path = join(dir, KEY_FILENAME)
		try {
			const existing = readFileSync(path)
			if (existing.length === KEY_BYTES) return existing
		} catch {
			// Absent on first use — created below.
		}
		mkdirSync(dir, { recursive: true })
		const key = randomBytes(KEY_BYTES)
		// `mode` only applies on creation; chmod afterwards so a pre-existing bad file is tightened too.
		writeFileSync(path, key, { mode: 0o600 })
		chmodSync(path, 0o600)
		return key
	}
}
