import { isProcessAlive } from './ProcessLiveness'

/**
 * WHICH RUN OF THIS PROCESS — the identity a durable claim has to carry to be recoverable.
 *
 * ## The failure this exists to close
 *
 * A queue that leases work stamps the row with WHO took it, and every such id in this codebase is a
 * uuid minted in memory (`mailbox-<uuid>`, `worker-<uuid>`). That answers "is this MY claim?" and
 * nothing else: after a crash the new process reads a foreign id and cannot tell whether the holder
 * is a second daemon still working (leave it alone) or a corpse (take it back now). Lacking the
 * answer, the only safe move is to wait out the lease — which is why a ten-minute crash budget
 * became ten minutes of a stranded conversation on every restart.
 *
 * The OS knows. `kill(pid, 0)` answers it exactly, and the two fields here are what it takes to ask:
 * a pid to probe, and a boot id so a RECYCLED pid — the new daemon inheriting the dead one's number,
 * rare but real — is not mistaken for the original holder.
 *
 * ## Why a module constant and not an injected service
 *
 * "Which run of this process am I" is process-global by definition; an injected copy would be a
 * second answer to a question that admits one. Nothing here is a test seam either: a test that wants
 * to stand for ANOTHER boot writes a row with a foreign `id` and a pid nobody is using, which is
 * exactly what the real thing looks like from the reader's side.
 */
export interface DaemonBoot {
	readonly id: string
	readonly pid: number
}

/** THIS boot. Minted once, at import — the first thing in the process that is stable for its lifetime. */
export const DAEMON_BOOT: DaemonBoot = { id: crypto.randomUUID(), pid: process.pid }

/** A claim as it comes back off a row: both halves nullable, because rows predate the columns. */
export interface RecordedClaim {
	readonly bootId: string | null
	readonly pid: number | null
}

/**
 * Can we PROVE the boot that stamped this claim is gone?
 *
 * Deliberately asymmetric: only a proven-dead holder answers true. Everything else — our own boot, a
 * live pid, a row written before the columns existed — answers false and the claim keeps its lease
 * until the lease itself expires. That asymmetry is the whole safety argument: a false positive
 * hands the same work to two live runners at once, a false negative costs one lease of latency.
 */
export function isClaimOrphaned(claim: RecordedClaim): boolean {
	// Pre-migration row: nothing to probe, so nothing is provable.
	if (claim.bootId === null || claim.pid === null) return false
	// Our own boot IS running — it is running this very check.
	if (claim.bootId === DAEMON_BOOT.id) return false
	return !isProcessAlive(claim.pid)
}
