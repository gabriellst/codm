import { IconChecks, IconCornerDownRight } from '@tabler/icons-react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '../lib/cn'

/**
 * The task conversation's message bubble (pen "Chat / Pessoa · Agente · Orientação").
 *
 * Three LOOKS, one shape: [18,18,18,6] (`rounded-asymmetric-md`), padding 11×15, body 14/1.45.
 * · `person`  — someone in the group: `--secondary` fill, green text, name on top.
 * · `agent`   — the agent's reply: `--primary` fill, `--primary-foreground` text.
 * · `steer`   — the operator's private orientation to the agent: white, `--input` hairline, italic
 *               body, a "↳ <author>" header and a receipt `footer` (✓✓ + "lida pelo agente · 10:09").
 *
 * `side` only decides alignment (`in` = left, with the avatar before the bubble; `out` = right).
 * Everything textual — author, time, receipt — arrives by prop already translated.
 */

const chatBubbleVariants = cva('flex min-w-0 max-w-[85%] flex-col gap-0.5 rounded-asymmetric-md px-3 py-2.25 text-sm leading-[1.45]', {
	variants: {
		look: {
			person: 'bg-secondary text-secondary-foreground',
			agent: 'bg-primary text-primary-foreground',
			steer: 'border border-input bg-background text-foreground',
		},
	},
	defaultVariants: { look: 'person' },
})

const chatBubbleRowVariants = cva('flex w-full min-w-0 items-end gap-2', {
	variants: {
		side: {
			in: 'justify-start',
			out: 'justify-end',
		},
	},
	defaultVariants: { side: 'in' },
})

const AUTHOR_CLASS: Record<ChatBubbleLook, string> = {
	person: 'text-[11.5px] font-bold text-secondary-foreground',
	agent: 'text-[11.5px] font-bold text-primary-foreground',
	steer: 'flex items-center gap-1 text-[11.5px] font-bold text-muted-foreground',
}

/** The steer's header carries the "↳" glyph; the other looks open straight on the name. */
const AUTHOR_ICON: Record<ChatBubbleLook, React.ReactNode> = {
	person: null,
	agent: null,
	steer: <IconCornerDownRight aria-hidden="true" className="size-3 shrink-0" />,
}

/** The steer body is the quieter italic voice (13.5); the others keep the 14/1.45 base. */
const BODY_CLASS: Record<ChatBubbleLook, string> = {
	person: '',
	agent: '',
	steer: 'text-[13.5px] italic',
}

const TIME_CLASS: Record<ChatBubbleLook, string> = {
	person: 'text-secondary-foreground/70',
	agent: 'text-primary-foreground/80',
	steer: 'text-caption-foreground',
}

type ChatBubbleLook = NonNullable<VariantProps<typeof chatBubbleVariants>['look']>
type ChatBubbleSide = NonNullable<VariantProps<typeof chatBubbleRowVariants>['side']>

type ChatBubbleProps = React.ComponentProps<'div'> & {
	side: ChatBubbleSide
	look: ChatBubbleLook
	/** Who spoke — the person's name, or "Orientação · Bruno" on a steer. */
	author?: React.ReactNode
	/** A small avatar node, placed on the outer side of the bubble. */
	avatar?: React.ReactNode
	/** Short time ("10:02"), set at the bubble's bottom-right. */
	time?: React.ReactNode
	/** A line under the body — the steer's read receipt. */
	footer?: React.ReactNode
}

function ChatBubble({ side, look, author, avatar, time, footer, className, children, ...props }: ChatBubbleProps) {
	const bubble = (
		<div data-slot="chat-bubble-body" className={chatBubbleVariants({ look })}>
			{author ? (
				<span data-slot="chat-bubble-author" className={AUTHOR_CLASS[look]}>
					{AUTHOR_ICON[look]}
					{author}
				</span>
			) : null}
			<div className="flex flex-wrap items-end gap-x-3">
				<div className={cn('min-w-0 flex-1 whitespace-pre-wrap break-words', BODY_CLASS[look])}>{children}</div>
				{time ? <span className={cn('ml-auto shrink-0 text-[10.5px] leading-4 tabular-nums', TIME_CLASS[look])}>{time}</span> : null}
			</div>
			{footer ? (
				<div data-slot="chat-bubble-footer" className="flex items-center gap-1 text-[10.5px] text-caption-foreground">
					{footer}
				</div>
			) : null}
		</div>
	)

	return (
		<div data-slot="chat-bubble" data-side={side} data-look={look} className={cn(chatBubbleRowVariants({ side }), className)} {...props}>
			{side === 'in' ? avatar : null}
			{bubble}
			{side === 'out' ? avatar : null}
		</div>
	)
}

/**
 * The read receipt that sits in a steer's `footer`: the double check in brand green + the caller's
 * text ("lida pelo agente · 10:09"). Separate so the bubble stays agnostic of delivery state.
 */
function ChatReceipt({ className, children, ...props }: React.ComponentProps<'span'>) {
	return (
		<span
			data-slot="chat-receipt"
			className={cn('inline-flex items-center gap-1 text-[10.5px] text-caption-foreground', className)}
			{...props}
		>
			<IconChecks aria-hidden="true" className="size-3 shrink-0 text-primary" />
			{children}
		</span>
	)
}

const chatEventDotVariants = cva('mt-1 size-1.25 shrink-0 rounded-full', {
	variants: {
		tone: {
			default: 'bg-primary',
			muted: 'bg-caption-foreground',
			attention: 'bg-status-attention',
		},
	},
	defaultVariants: { tone: 'default' },
})

type ChatEventProps = React.ComponentProps<'div'> & VariantProps<typeof chatEventDotVariants>

/**
 * A system line in the conversation (pen "Chat / Evento"): a 6px dot + mono 11.5 muted text —
 * "tarefa criada a partir da mensagem de Ana · roteada por regra". `tone` only recolors the dot.
 */
function ChatEvent({ tone = 'default', className, children, ...props }: ChatEventProps) {
	return (
		<div
			data-slot="chat-event"
			data-tone={tone}
			className={cn('flex min-w-0 items-start gap-2 font-mono text-[11.5px] leading-4 text-muted-foreground', className)}
			{...props}
		>
			<span aria-hidden="true" className={chatEventDotVariants({ tone })} />
			<span className="min-w-0 break-words">{children}</span>
		</div>
	)
}

export { ChatBubble, ChatEvent, ChatReceipt, chatBubbleVariants, chatBubbleRowVariants, chatEventDotVariants }
