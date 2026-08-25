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

/**
 * Presentational "coming soon" rows on the channels screen — Instagram and Telegram. These are
 * NOT `ChannelKind` members (the wire enum stays `WHATSAPP | INTERNAL`, see
 * `packages/contracts/src/wire/enums/channel-kind.tsp`) and never will be until the backend actually
 * exposes them; `ChannelsSection` renders them as inert rows (no chevron, no click) purely from
 * this UI-only list. Founder decision (2026-08-25): marketing is WhatsApp-only, Instagram/Telegram
 * surface as visible "coming soon" lines (no Discord, no Slack). Labels are literal brand names —
 * same string in every language, like `providerLabel` below — not an i18n key.
 */
export interface ComingSoonChannel {
	key: string
	label: string
	icon: Icon
}

export const COMING_SOON_CHANNELS: readonly ComingSoonChannel[] = [
	{ key: 'instagram', label: 'Instagram', icon: IconBrandInstagram },
	{ key: 'telegram', label: 'Telegram', icon: IconBrandTelegram },
]

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
 * Small leading dot color per issue status (D3 — measured on the Tarefas overview, JcWnl group).
 * NEEDS_INPUT's dot doubles as the ONLY status that also gets the asterisk glyph on some rows
 * (archived list); the grouped/active row always shows the dot. Measured directly: "Precisa de
 * entrada" #E4572E → `--status-attention`, "Em andamento" #76C410 → the SAME hex as `--primary`
 * (the reference's own running/active hue, not a separate token), "Concluída" #CFCFCF →
 * `--status-idle`.
 */
export const issueStatusDot: Record<IssueStatus, string> = {
	NEEDS_INPUT: 'bg-status-attention',
	WORKING: 'bg-primary',
	COMPLETED: 'bg-status-idle',
}

/**
 * Status chip fill+text per issue status (D3 — the trailing colored chip on each task row in the
 * Tarefas overview). Two of three land on EXISTING pairs: "Em andamento" is bg-secondary/
 * secondary-foreground (the same pastel-green pair every other "on" chip in the app already
 * uses), "Concluída" is bg-muted/muted-foreground (the Badge `default` variant's bg, with its
 * text color overridden — `default` ships `text-foreground`, the design measures the quieter
 * `text-muted-foreground` for a finished state). "Precisa de entrada" pairs the already-declared
 * `--attention-surface` with the new `--attention-foreground` token (see tokens.css). Composed
 * as Tailwind classes (not a Badge `variant`) because badge.tsx is a shared primitive outside
 * this group's scope — these three are the only consumers today.
 */
export const issueStatusChipClass: Record<IssueStatus, string> = {
	NEEDS_INPUT: 'bg-attention-surface text-attention-foreground',
	WORKING: 'bg-secondary text-secondary-foreground',
	COMPLETED: 'bg-muted text-muted-foreground',
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
