/**
 * The shared identity of a charge's reconcile alarm on the CommandQueue — the contract between the
 * scheduler (SubscriptionCharger arms it when recording a PENDING charge), the cancelers
 * (ChargeSettler's terminal transitions disarm it), and the command itself (the ReconcileCharge use
 * case registers under this name at boot). A LEAF module on purpose: both services and the use case
 * import it, so it must not import either side (a `services ↔ usecases` module cycle would evaluate
 * tsyringe decorator metadata against a partially-initialized barrel).
 */
export const RECONCILE_CHARGE_COMMAND = 'reconcile_charge' as const

/** The jobId a charge's reconcile alarm is scheduled/canceled under — one alarm per charge. */
export const reconcileJobId = (chargeId: string): string => `reconcile:${chargeId}`
