// Settlement provenance for a dunning-recovered invoice (InvoicePaidEvent.recoveredVia /
// DunningSucceededEvent.recoveredVia): RETRY = an off-session automatic re-charge recovered
// it; MANUAL = an owner-driven pay (PIX / checkout / ad-hoc) settled it. Most settle paths
// (and replays of pre-existing events) omit it and default to MANUAL at the handler.
export enum RecoveredVia {
	RETRY = 'retry',
	MANUAL = 'manual',
}
