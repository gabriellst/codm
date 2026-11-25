import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { IconExternalLink } from '@tabler/icons-react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../lib/cn'

/**
 * A task's artifact, two densities (pen "Artefato / Tile" and "Chat / Artefato").
 *
 * · `ArtifactTile` — the side-panel grid cell: a 92px thumbnail band with a 22px glyph (or a real
 *   preview via `thumb`), the name (13 bold, two lines), and a footer kind (11 semibold) + time.
 *   `tone="link"` paints the band `--accent` with a green glyph; files keep the `--card` band.
 * · `ArtifactChip` — the inline row inside the conversation: a 40px glyph box, name + mono detail,
 *   and a trailing "open" icon.
 *
 * Both are presentational: what opening means (an `<a>`, a router `Link`, a `<button>`) arrives by
 * `render`, exactly as `Badge` takes it. Only when the root IS interactive does it hover/focus.
 */

const INTERACTIVE =
	'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring [&:is(a,button)]:cursor-pointer [&:is(a,button)]:hover:border-primary [&:is(a,button)]:hover:bg-hover-accent'

const artifactThumbVariants = cva("relative flex h-19 items-center justify-center overflow-hidden [&_svg:not([class*='size-'])]:size-4.5", {
	variants: {
		tone: {
			link: 'bg-accent text-secondary-foreground',
			default: 'bg-card text-muted-foreground',
		},
	},
	defaultVariants: { tone: 'default' },
})

type ArtifactTileProps = Omit<useRender.ComponentProps<'div'>, 'children'> &
	VariantProps<typeof artifactThumbVariants> & {
		/** The kind's glyph (a 22px icon); ignored when `thumb` is given. */
		glyph: React.ReactNode
		name: React.ReactNode
		/** The kind label — "Link", "Imagem", "Arquivo". */
		kind: React.ReactNode
		/** Short time — "10:31". */
		when?: React.ReactNode
		/** A real preview (an `<img>`), filling the band instead of the glyph. */
		thumb?: React.ReactNode
	}

function ArtifactTile({ glyph, name, kind, when, thumb, tone = 'default', className, render, ...props }: ArtifactTileProps) {
	return useRender({
		defaultTagName: 'div',
		props: mergeProps<'div'>(
			{
				className: cn(
					'group/artifact flex w-full min-w-0 flex-col overflow-hidden rounded-asymmetric-sm border border-border bg-background text-left',
					INTERACTIVE,
					className,
				),
				children: (
					<>
						<span data-slot="artifact-tile-thumb" className={artifactThumbVariants({ tone })}>
							{thumb ?? glyph}
						</span>
						<span className="flex min-w-0 flex-col gap-1 px-3 py-2.5">
							<span className="line-clamp-2 text-[13px] font-bold leading-snug text-foreground">{name}</span>
							<span className="flex items-center justify-between gap-2">
								<span className="truncate text-[11px] font-semibold text-muted-foreground">{kind}</span>
								{when ? <span className="shrink-0 text-[10.5px] tabular-nums text-caption-foreground">{when}</span> : null}
							</span>
						</span>
					</>
				),
			},
			props,
		),
		render,
		state: { slot: 'artifact-tile', tone },
	})
}

type ArtifactChipProps = Omit<useRender.ComponentProps<'div'>, 'children'> & {
	glyph: React.ReactNode
	name: React.ReactNode
	/** The mono line under the name — "link · enviado ao grupo". */
	detail?: React.ReactNode
	/** The trailing affordance; defaults to the "open" icon, `null` hides it. */
	trailing?: React.ReactNode
}

function ArtifactChip({ glyph, name, detail, trailing, className, render, ...props }: ArtifactChipProps) {
	const end = trailing === undefined ? <IconExternalLink aria-hidden="true" className="size-4" /> : trailing
	return useRender({
		defaultTagName: 'div',
		props: mergeProps<'div'>(
			{
				className: cn(
					'flex min-w-0 max-w-full items-center gap-3 rounded-asymmetric-sm border border-border bg-background p-2 pr-3 text-left',
					INTERACTIVE,
					className,
				),
				children: (
					<>
						<span
							aria-hidden="true"
							className="flex size-8.5 shrink-0 items-center justify-center rounded-asymmetric-2xs bg-card text-secondary-foreground [&_svg:not([class*='size-'])]:size-4.5"
						>
							{glyph}
						</span>
						<span className="flex min-w-0 flex-1 flex-col">
							<span className="truncate text-[13px] font-bold text-foreground">{name}</span>
							{detail ? <span className="truncate font-mono text-[10.5px] text-muted-foreground">{detail}</span> : null}
						</span>
						{end ? <span className="ml-2 shrink-0 text-muted-foreground">{end}</span> : null}
					</>
				),
			},
			props,
		),
		render,
		state: { slot: 'artifact-chip' },
	})
}

export { ArtifactTile, ArtifactChip, artifactThumbVariants }
