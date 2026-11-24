import { mergeProps } from '@base-ui/react/merge-props'
import { useRender } from '@base-ui/react/use-render'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../lib/cn'

/**
 * A task on a board or list (pen "Cartão / Tarefa"): white card, `--border` hairline, [16,16,16,5];
 * the mono key (12 bold, muted) with an optional status node on the right, the title (15 bold —
 * 14 on the kanban, `size="compact"`), and one meta line with a 13px icon.
 *
 * `metaTone` — the meta line's voice: `default` (caption grey: "2 artefatos · 10:40"), `strong`
 * (foreground semibold: the open decision "D1 · publico agora ou no fim do dia?"), `warn`
 * (attention text: "escalada pelo supervisor").
 *
 * `selected` — the open task in a split view: a 1.5px `--foreground` border.
 *
 * Presentational: opening arrives by `render` (a router `Link`, an `<a href="#APP-12">`, a
 * `<button>`); only an interactive root hovers like a content row.
 */

const taskCardVariants = cva(
	'group/task flex min-w-0 flex-col gap-1.5 rounded-asymmetric-sm border bg-background px-3 py-2.75 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring [&:is(a,button)]:cursor-pointer',
	{
		variants: {
			selected: {
				true: 'border-[1.5px] border-foreground',
				false: 'border-border [&:is(a,button)]:hover:border-primary [&:is(a,button)]:hover:bg-hover-accent',
			},
		},
		defaultVariants: { selected: false },
	},
)

const taskCardTitleVariants = cva('font-bold leading-snug text-foreground', {
	variants: {
		size: {
			default: 'text-[15px]',
			compact: 'text-sm',
		},
	},
	defaultVariants: { size: 'default' },
})

const taskCardMetaVariants = cva(
	"flex min-w-0 items-start gap-1.5 text-xs [&_svg:not([class*='size-'])]:mt-px [&_svg:not([class*='size-'])]:size-2.75 [&_svg]:shrink-0",
	{
		variants: {
			metaTone: {
				default: 'text-caption-foreground',
				strong: 'font-semibold text-foreground',
				warn: 'text-attention-foreground',
			},
		},
		defaultVariants: { metaTone: 'default' },
	},
)

type TaskCardProps = Omit<useRender.ComponentProps<'div'>, 'title' | 'children'> &
	VariantProps<typeof taskCardTitleVariants> &
	VariantProps<typeof taskCardMetaVariants> & {
		/** The mono key — "APP-12". */
		taskKey: React.ReactNode
		title: React.ReactNode
		meta?: React.ReactNode
		/** A 13px icon in front of the meta line. */
		metaIcon?: React.ReactNode
		/** A node on the key row's right — usually a `StatusPill`; the kanban omits it (the column says it). */
		status?: React.ReactNode
		selected?: boolean
	}

function TaskCard({
	taskKey,
	title,
	meta,
	metaIcon,
	metaTone = 'default',
	status,
	selected = false,
	size = 'default',
	className,
	render,
	...props
}: TaskCardProps) {
	return useRender({
		defaultTagName: 'div',
		props: mergeProps<'div'>(
			{
				className: cn(taskCardVariants({ selected }), className),
				children: (
					<>
						<span className="flex min-w-0 items-center justify-between gap-2">
							<span className="truncate font-mono text-xs font-bold text-muted-foreground">{taskKey}</span>
							{status}
						</span>
						<span className={taskCardTitleVariants({ size })}>{title}</span>
						{meta ? (
							<span data-slot="task-card-meta" className={taskCardMetaVariants({ metaTone })}>
								{metaIcon}
								<span className="min-w-0">{meta}</span>
							</span>
						) : null}
					</>
				),
			},
			props,
		),
		render,
		state: { slot: 'task-card', selected },
	})
}

export { TaskCard, taskCardVariants, taskCardTitleVariants, taskCardMetaVariants }
