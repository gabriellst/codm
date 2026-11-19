import { injectable } from 'tsyringe-neo'
import { ISSUE_SLOTS_FULL_MIN_FREE_BYTES, MachineCapacity, type MachineSample } from './MachineCapacity'

/** The test environments' machine: roomy (every slot open) until a test scripts another one. */
@injectable()
export class FixedMachineCapacity extends MachineCapacity {
	private current: MachineSample = { diskFreeBytes: 2 * ISSUE_SLOTS_FULL_MIN_FREE_BYTES, memoryFreeShare: 0.5 }

	script(sample: MachineSample): void {
		this.current = sample
	}

	async sample(): Promise<MachineSample> {
		return this.current
	}
}
