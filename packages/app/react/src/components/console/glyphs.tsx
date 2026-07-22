import {
	IconBrandInstagram,
	IconBrandTelegram,
	IconBrandWhatsapp,
	IconHexagon,
	IconMessageDots,
	IconSparkles,
	IconTerminal2,
} from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import type { ArtifactKind, ChannelKind, IssueStatus, ProviderKind, StopKind, StopResolution } from '@codedm/client-typescript/typescript'

// ── Channels ──────────────────────────────────────────────────────────────────

export const channelGlyph: Record<ChannelKind, Icon> = {
	WHATSAPP: IconBrandWhatsapp,
	INSTAGRAM_DM: IconBrandInstagram,
	TELEGRAM: IconBrandTelegram,
}

export const channelLabel: Record<ChannelKind, string> = {
	WHATSAPP: 'WhatsApp',
	INSTAGRAM_DM: 'Instagram DM',
	TELEGRAM: 'Telegram',
}

/** All channel kinds in display order — used to render the full connectivity list. */
export const CHANNEL_KINDS: ChannelKind[] = ['WHATSAPP', 'INSTAGRAM_DM', 'TELEGRAM']

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

export const issueStatusLabel: Record<IssueStatus, string> = {
	NEEDS_INPUT: 'Needs input',
	WORKING: 'Working',
	COMPLETED: 'Completed',
}

/** Group header caption in the issues lists. */
export const issueGroupLabel: Record<IssueStatus, string> = {
	NEEDS_INPUT: 'NEEDS INPUT',
	WORKING: 'WORKING',
	COMPLETED: 'COMPLETED',
}

/** Small leading dot color per issue status. NEEDS_INPUT uses the asterisk glyph, not a dot. */
export const issueStatusDot: Record<IssueStatus, string> = {
	NEEDS_INPUT: 'bg-warning',
	WORKING: 'bg-info',
	COMPLETED: 'bg-success',
}

// ── Stops ────────────────────────────────────────────────────────────────────────

export const stopLabel: Record<StopKind, string> = {
	SERVER_ERROR: 'Server error',
	BLOCKED_BY_CLASSIFICATION: 'Blocked',
	HUMAN_REQUESTED: 'Human requested',
	APPROVAL_NEEDED: 'Approval needed',
}

export const resolutionLabel: Record<StopResolution, string> = {
	RETRY: 'Retry',
	REVIEW_AND_SEND: 'Review & send',
	TAKE_OVER: 'Take over',
	APPROVE: 'Approve',
	DENY: 'Deny',
}

/** Deny/Take over read as secondary; the rest are the primary black action. */
export const resolutionIsPrimary: Record<StopResolution, boolean> = {
	RETRY: true,
	REVIEW_AND_SEND: true,
	APPROVE: true,
	TAKE_OVER: false,
	DENY: false,
}

// ── Artifacts ────────────────────────────────────────────────────────────────────

export const artifactKindLabel: Record<ArtifactKind, string> = {
	IMAGE: 'Screenshot',
	FILE: 'File',
	LINK: 'Preview deploy',
}

export const emailGlyph = IconMessageDots
