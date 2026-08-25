import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * The Settings "Compartilhar telemetria" toggle's persisted choice (SP4 spec, Emenda 2026-08-07:
 * "consentimento ligado por padrão, com aviso"). PERSISTED via `localStorage` — same reasoning as
 * every other cross-session UI preference in this codebase (`store` skill, "With Persistence")
 * — this is a per-INSTALL preference, not a secret: `SecretsService` (keychain) is reserved for
 * operator credentials (agent API keys, the SP2 device token), which this is not.
 *
 * Global, not route-scoped: `useAnalyticsConsent` (mounted at the app root) reacts to `enabled` and
 * applies it to the bound `AnalyticsService` (`optIn`/`optOut`) on every change — both the initial
 * boot AND a live toggle from `/settings` — and `TelemetrySection` is a different branch of the
 * tree than that root listener, so the fact has to be shared, not local component state.
 */
interface TelemetryConsentState {
	/** Default ON — the toggle exists to let someone turn it OFF, not to gate it behind an opt-in
	 *  the founder explicitly rejected (Emenda 2026-08-07). The landing's footer disclosure is the
	 *  "aviso" half of that decision. */
	enabled: boolean
}

interface TelemetryConsentActions {
	setEnabled: (enabled: boolean) => void
}

type TelemetryConsentStore = TelemetryConsentState & TelemetryConsentActions

export const useTelemetryConsentStore = create<TelemetryConsentStore>()(
	persist(
		set => ({
			enabled: true,
			setEnabled: enabled => set({ enabled }),
		}),
		{ name: 'codm.telemetry-consent' },
	),
)
