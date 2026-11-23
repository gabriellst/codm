import { injectable } from 'tsyringe-neo'
import { statfs } from 'node:fs/promises'
import { freemem, totalmem } from 'node:os'
import { Config, resolveDataDir } from '@codm/core-typescript'
import { MachineCapacity, type MachineSample } from './MachineCapacity'

/**
 * The real machine: free bytes of the volume that holds the data directory, and the OS's free memory. A volume that
 * cannot be read answers 0 free — the gate then closes to one slot, never opens wider on a guess.
 */
@injectable()
export class SystemMachineCapacity extends MachineCapacity {
	async sample(): Promise<MachineSample> {
		let diskFreeBytes = 0
		try {
			const stats = await statfs(resolveDataDir(Config.env.CODM_DATA_DIR))
			diskFreeBytes = Number(stats.bavail) * Number(stats.bsize)
		} catch {
			diskFreeBytes = 0
		}
		return { diskFreeBytes, memoryFreeShare: freemem() / totalmem() }
	}
}
