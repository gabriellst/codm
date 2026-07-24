import {
	IconBrandWhatsapp,
	IconHexagon,
	IconMessageDots,
	IconSparkles,
	IconTerminal2,
} from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import type { ChannelKind, IssueStatus, ProviderKind, StopResolution } from '@codedm/client-typescript/typescript'

// ── Channels ──────────────────────────────────────────────────────────────────

export const channelGlyph: Record<ChannelKind, Icon> = {
	WHATSAPP: IconBrandWhatsapp,
	INTERNAL: IconTerminal2,
}

export const channelLabel: Record<ChannelKind, string> = {
	WHATSAPP: 'WhatsApp',
	INTERNAL: 'Internal',
}

/**
 * User-connectable channel kinds in display order — used to render the connectivity list.
 * INTERNAL is the daemon's own in-process channel (message projector), not a bridge the
 * operator pairs, so it's deliberately excluded here while remaining in the glyph/label maps.
 */
export const CHANNEL_KINDS: ChannelKind[] = ['WHATSAPP']

// ── Providers (agent CLIs) ─────────────────────────────────────────────────────

export const providerGlyph: Record<ProviderKind, Icon> = {
	CLAUDE_CODE: IconSparkles,
	CODEX: IconHexagon,
	OPENCODE: IconTerminal2,
}

export const providerLabel: Record<ProviderKind, string> = {
	CLAUDE_CODE: 'Claude Code',
	CODEX: 'Codex',
	OPENCODE: 'OpenCode',
}

// ── Issues ──────────────────────────────────────────────────────────────────────
// Human labels for IssueStatus / StopKind / StopResolution / ArtifactKind / ThreadStatus live in
// the typed i18n catalog (`enums.<Enum>.<VALUE>`), rendered via `enumLabel(...)` — never a
// `Record<Enum,string>` label map in code (react CLAUDE.md bp-23). Only STYLE maps (dot colors,
// primary/secondary intent) and ICON maps stay here.

/** Small leading dot color per issue status. NEEDS_INPUT uses the asterisk glyph, not a dot. */
export const issueStatusDot: Record<IssueStatus, string> = {
	NEEDS_INPUT: 'bg-warning',
	WORKING: 'bg-info',
	COMPLETED: 'bg-success',
}

// ── Stops ────────────────────────────────────────────────────────────────────────

/** Deny/Take over read as secondary; the rest are the primary black action. */
export const resolutionIsPrimary: Record<StopResolution, boolean> = {
	RETRY: true,
	REVIEW_AND_SEND: true,
	APPROVE: true,
	TAKE_OVER: false,
	DENY: false,
}

// ── Artifacts ────────────────────────────────────────────────────────────────────

export const emailGlyph = IconMessageDots
