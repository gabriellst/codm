import { IconBrandWhatsapp, IconHexagon, IconMessageDots, IconSparkles, IconTerminal2 } from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import type {
	ChannelKind,
	ChannelStatus,
	IssueStatus,
	ProviderKind,
	StopResolution,
	WorkspaceBadge,
} from '@codm/client-typescript/typescript'

// ── Channels ──────────────────────────────────────────────────────────────────

export const channelGlyph: Record<ChannelKind, Icon> = {
	WHATSAPP: IconBrandWhatsapp,
	INTERNAL: IconTerminal2,
}

/** D3 — the channel-row status chip: `secondary` (filled brand pastel) only while CONNECTED,
 *  `default` (muted) for every other state, including the "coming soon" chip on non-connectable
 *  rows (`ChannelsSection` reuses `default` there directly, outside this map). */
export const channelStatusBadgeVariant: Record<ChannelStatus, 'default' | 'secondary'> = {
	CONNECTED: 'secondary',
	CONNECTING: 'default',
	CREATED: 'default',
	DELETED: 'default',
	DISCONNECTED: 'default',
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

/**
 * Provider labels stay a MAP, unlike ChannelKind which moved to `enums.ChannelKind` in the catalog:
 * every member here is a PRODUCT NAME. "Claude Code" is the same string in every language, so a
 * catalog entry would duplicate a non-decision in two files and invite someone to translate it.
 * ChannelKind had to move because it mixes a brand (WhatsApp) with a common noun (Internal), and the
 * common noun was rendering untranslated.
 */
export const providerLabel: Record<ProviderKind, string> = {
	CLAUDE_CODE: 'Claude Code',
	CODEX: 'Codex',
	OPENCODE: 'OpenCode',
}

// ── Workspaces ────────────────────────────────────────────────────────────────────

/** GIT is the plain muted chip (`default` badge variant = `bg-muted`); CLAUDE_PROJECT is the
 *  filled brand chip. D3 (R8) — measured directly on the project-card footer: the git chip fills
 *  `$muted`, not a borderless/ghost tag. */
export const workspaceBadgeVariant: Record<WorkspaceBadge, 'default' | 'secondary'> = {
	GIT: 'default',
	CLAUDE_PROJECT: 'secondary',
}

// ── Issues ──────────────────────────────────────────────────────────────────────
// Human labels for IssueStatus / StopKind / StopResolution / ArtifactKind / ThreadStatus live in
// the typed i18n catalog (`enums.<Enum>.<VALUE>`), rendered via `enumLabel(...)` — never a
// `Record<Enum,string>` label map in code (react CLAUDE.md bp-23). Only STYLE maps (dot colors,
// primary/secondary intent) and ICON maps stay here.

/**
 * Small leading dot color per issue status. NEEDS_INPUT uses the asterisk glyph, not a dot.
 * COMPLETED is neutral grey (`bg-muted-foreground/40`, the same "idle/paused" tone StatusDot and
 * AgentsRunningPill already use) — green is reserved for active work, never for a finished state.
 */
export const issueStatusDot: Record<IssueStatus, string> = {
	NEEDS_INPUT: 'bg-warning',
	WORKING: 'bg-info',
	COMPLETED: 'bg-muted-foreground/40',
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
