import { Hexagon, Instagram, type LucideIcon, MessageCircle, Send, Sparkles, SquareTerminal } from 'lucide-react-native'
import type {
	ChannelKind,
	ChannelStatus,
	IssueStatus,
	ProviderKind,
	StopResolution,
	ThreadStatus,
} from '@codedm/client-typescript/typescript'

/**
 * The CodeDM iconography + status-color vocabulary, mirrored from the react
 * console's `components/console/glyphs.ts`. Icon and dot-color maps keyed by an
 * SDK enum resolve to STYLES (allowed as code maps). Human-readable enum LABELS
 * are NOT here — they live in the typed i18n catalog (`enums.*` in the locale
 * files) and are resolved through the `*LabelKey` helpers below, so the catalog
 * can never drift (tsc fails if a locale key is missing).
 */

// ── Channels ──────────────────────────────────────────────────────────────
export const channelGlyph: Record<ChannelKind, LucideIcon> = {
	WHATSAPP: MessageCircle,
	INSTAGRAM_DM: Instagram,
	TELEGRAM: Send,
}

export const CHANNEL_KINDS: ChannelKind[] = ['WHATSAPP', 'INSTAGRAM_DM', 'TELEGRAM']

export const channelLabelKey = (kind: ChannelKind) => `enums.channelKind.${kind}` as const
export const channelStatusLabelKey = (status: ChannelStatus) => `enums.channelStatus.${status}` as const

// ── Providers (agent CLIs) ─────────────────────────────────────────────────
export const providerGlyph: Record<ProviderKind, LucideIcon> = {
	CLAUDE_CODE: Sparkles,
	CODEX: Hexagon,
	OPENCODE: SquareTerminal,
}

export const PROVIDER_KINDS: ProviderKind[] = ['CLAUDE_CODE', 'CODEX', 'OPENCODE']

export const providerLabelKey = (kind: ProviderKind) => `enums.providerKind.${kind}` as const
export const providerStatusLabelKey = (status: 'DETECTED' | 'NOT_INSTALLED') => `enums.providerStatus.${status}` as const

// ── Threads ─────────────────────────────────────────────────────────────────
export const threadStatusDotClass: Record<ThreadStatus, string> = {
	RUNNING: 'bg-success',
	IDLE: 'bg-muted-foreground',
	NEEDS_ATTENTION: 'bg-warning',
	PAUSED: 'bg-muted-foreground',
}

export const threadStatusLabelKey = (status: ThreadStatus) => `enums.threadStatus.${status}` as const

// ── Issues ──────────────────────────────────────────────────────────────────
export const ISSUE_STATUS_ORDER: IssueStatus[] = ['NEEDS_INPUT', 'WORKING', 'COMPLETED']

/** NEEDS_INPUT renders the asterisk glyph instead of a dot; the rest get a dot. */
export const issueStatusDotClass: Record<IssueStatus, string> = {
	NEEDS_INPUT: 'bg-warning',
	WORKING: 'bg-info',
	COMPLETED: 'bg-success',
}

export const issueStatusLabelKey = (status: IssueStatus) => `enums.issueStatus.${status}` as const

// ── Stops ───────────────────────────────────────────────────────────────────
export const stopLabelKey = (kind: 'SERVER_ERROR' | 'BLOCKED_BY_CLASSIFICATION' | 'HUMAN_REQUESTED' | 'APPROVAL_NEEDED') =>
	`enums.stopKind.${kind}` as const

export const resolutionLabelKey = (resolution: StopResolution) => `enums.stopResolution.${resolution}` as const

/** Deny / Take over read as secondary; the rest are the primary black action. */
export const resolutionIsPrimary: Record<StopResolution, boolean> = {
	RETRY: true,
	REVIEW_AND_SEND: true,
	APPROVE: true,
	TAKE_OVER: false,
	DENY: false,
}
