import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../lib/cn'

/**
 * The live-state pill of a task (pen "Pill / Status"): a 7px leading dot + a bold label on a
 * small asymmetric pill. Six tones — the six columns the board shows (`queued · working · needsYou
 * · waiting · stalled · done`). The label is the caller's (no `t()` in the design system); the tone
 * only picks colors.
 *
 * TOKEN NOTES (no new token — decision of the spec):
 * · `waiting` dot — the pen names `--status-paused`, which tokens.css keeps UNDECLARED (R1 rule:
 *   first consumer declares; this slice may not add tokens). `bg-foreground/40` is the same
 *   alpha-derivation `--fg-20`/`--fg-60` use (foreground at 40% lands a hair lighter than the pen's
 *   paused grey) and inverts in dark mode for free.
 * · `done` dot — `--fg-20` has no color utility; `bg-foreground/20` IS its definition
 *   (`oklch(from var(--foreground) l c h / 0.2)`).
 * · radius — the pen measures [11,11,11,4]; the nearest ladder step is `2xs` (12/4).
 *
 * The dot map is exported so `KanbanColumnHeader` paints the SAME dot per tone — one map, no drift.
 */

const STATUS_TONES = ['working', 'needsYou', 'queued', 'waiting', 'stalled', 'done'] as const

type StatusTone = (typeof STATUS_TONES)[number]

const statusDotVariants = cva('inline-block size-1.5 shrink-0 rounded-full', {
	variants: {
		tone: {
			working: 'bg-primary',
			needsYou: 'bg-success-bright',
			queued: 'bg-caption-foreground',
			waiting: 'bg-foreground/40',
			stalled: 'bg-status-attention',
			done: 'bg-foreground/20',
		},
	},
	defaultVariants: { tone: 'queued' },
})

const statusPillVariants = cva(
	'inline-flex h-5.5 w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-asymmetric-2xs px-2.25 text-xs font-bold',
	{
		variants: {
			tone: {
				working: 'bg-muted text-foreground',
				needsYou: 'bg-foreground text-background',
				queued: 'bg-muted text-foreground',
				waiting: 'bg-muted text-foreground',
				stalled: 'bg-attention-surface text-attention-foreground',
				done: 'bg-muted text-muted-foreground',
			},
		},
		defaultVariants: { tone: 'queued' },
	},
)

type StatusPillProps = React.ComponentProps<'span'> & VariantProps<typeof statusPillVariants> & { tone: StatusTone }

function StatusPill({ tone, className, children, ...props }: StatusPillProps) {
	return (
		<span data-slot="status-pill" data-tone={tone} className={cn(statusPillVariants({ tone }), className)} {...props}>
			<span aria-hidden="true" data-slot="status-pill-dot" className={statusDotVariants({ tone })} />
			{children}
		</span>
	)
}

export { StatusPill, statusPillVariants, statusDotVariants, STATUS_TONES, type StatusTone }
