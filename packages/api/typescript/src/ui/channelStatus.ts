import { ChannelStatus } from '@codedm/contracts-typescript/wire/enums'

/**
 * Normalize a RAW gateway channel status into the contracts {@link ChannelStatus} the console speaks.
 *
 * The Go channel gateway (the verbatim medscall port) persists and returns its OWN five-value status
 * wire — `CREATED | CONNECTING | CONNECTED | DISCONNECTED | DELETED` — while the cross-boundary
 * contract that api-ts exposes to the browser is the leaner three-value domain enum
 * (`DISCONNECTED | PAIRING | CONNECTED`). The proxy MUST collapse the former onto the latter before
 * it hits a use-case `outputSchema` (`z.enum(ChannelStatus)`), or a legitimate `CONNECTING`/`CREATED`
 * would fail output validation and surface as a 500 instead of an honest "still pairing".
 *
 *   - `CONNECTED`                       → CONNECTED (paired; the dialog flips to success)
 *   - `CONNECTING` / `CREATED` / `PAIRING` → PAIRING (QR is live / device is negotiating)
 *   - anything else (`DISCONNECTED` / `DELETED` / empty / unknown) → DISCONNECTED
 *
 * Unknown values fold to DISCONNECTED rather than throwing: a stray upstream string must never trip
 * the interactive pairing poll into an error.
 */
export function normalizeChannelStatus(raw: string | null | undefined): ChannelStatus {
	switch (raw) {
		case 'CONNECTED':
			return ChannelStatus.CONNECTED
		case 'CONNECTING':
		case 'CREATED':
		case 'PAIRING':
			return ChannelStatus.PAIRING
		default:
			return ChannelStatus.DISCONNECTED
	}
}
