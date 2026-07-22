/**
 * The shared identity of a checkout session's reconcile alarm on the CommandQueue — the contract
 * between the scheduler (`CheckoutSessionRecorder` arms it when recording a PENDING session), the
 * canceler (`ExternalCheckoutCompletedHandler`'s completion disarms it, T5), and the command
 * itself (the `ReconcileCheckoutSession` use case registers under this name at boot, T4). A LEAF
 * module on purpose — molde `services/ChargeReconciler/reconcileJob.ts`: both services and the use
 * case import it, so it must not import either side (a `services ↔ usecases` module cycle would
 * evaluate tsyringe decorator metadata against a partially-initialized barrel).
 */
export const RECONCILE_CHECKOUT_COMMAND = 'reconcile_checkout' as const

/** The jobId a checkout session's reconcile alarm is scheduled/canceled under — one alarm per session. */
export const checkoutReconcileJobId = (sessionRef: string): string => `reconcile-checkout:${sessionRef}`
