const GIB = 1024 ** 3

/**
 * THE DISK GATE OF THE TASK SLOTS' MAXIMUM — owner's decision (19/11): slots 5 and 6 open only while the data
 * volume keeps at least this much free. Disk is freed by cleaning worktrees (`IssueWorktreeJanitor`), never by
 * lowering this number.
 */
export const ISSUE_SLOTS_FULL_MIN_FREE_BYTES = 20 * GIB

/**
 * How many task slots the machine affords by free disk on the data volume (fase 4, item 1). Each task turn may build
 * in a worktree; measured 18/11, the data volume was 99% full with 2.3 GiB free — six slots there would take the
 * machine down before the quota. Highest first; the first row the free space reaches wins.
 *
 * OWNER DECISION (19/11): free disk only OPENS the extra slots 5–6; it never takes away the 4 the daemon ran with
 * before fase 4. So the floor is today's 4 — a short disk stalls growth, not the work already running.
 */
export const ISSUE_SLOTS_BY_DISK: readonly { minFreeBytes: number; slots: number }[] = [
	{ minFreeBytes: ISSUE_SLOTS_FULL_MIN_FREE_BYTES, slots: 6 },
	{ minFreeBytes: 0, slots: 4 },
]

/** What the machine looks like now. */
export interface MachineSample {
	/** Free bytes on the data volume. */
	diskFreeBytes: number
	/**
	 * Share of memory the OS reports free, 0–1 — RECORDED for the health snapshot, not gated on: the RSS of a task
	 * turn was never measured (spec, "Máquina"), so no threshold can be declared yet.
	 */
	memoryFreeShare: number
}

/** The slots the disk affords — the first row of `ISSUE_SLOTS_BY_DISK` the free space reaches. */
export function issueSlotsFor(sample: MachineSample): number {
	return ISSUE_SLOTS_BY_DISK.find(row => sample.diskFreeBytes >= row.minFreeBytes)?.slots ?? 4
}

/**
 * The machine's port (fase 4, item 1): `real` reads the data volume (`statfs`) and the OS memory; `mock` and
 * `integration` answer a fixed, roomy machine that a test can script — no test depends on the disk it runs on.
 */
export abstract class MachineCapacity {
	abstract sample(): Promise<MachineSample>
}
