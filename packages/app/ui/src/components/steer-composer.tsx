import * as React from 'react'
import { IconArrowUp, IconLoader2 } from '@tabler/icons-react'

import { cn } from '../lib/cn'

/**
 * The "orient this task" field (pen "Compositor / Orientar"): a 48px single-line field with a
 * hairline `--input` border and [16,16,16,5], a 36px green send button with an up arrow, and a
 * 12px hint under it ("Chega só ao agente desta tarefa — o grupo não vê").
 *
 * Controlled: the caller owns `value` and decides what sending does. The component only decides
 * WHEN a send is allowed — never while `pending`, never with a blank (whitespace-only) value — and
 * offers two ways to send: the button and Enter (Shift+Enter and an open IME composition do not
 * send). The root is a plain `div`, not a `<form>`: the button stays a real `type="button"` and the
 * composer can sit inside a caller's form without nesting forms.
 *
 * No `t()` here: `placeholder`, `hint`, `sendLabel` (the button's accessible name) and the optional
 * `inputLabel` (the field's accessible name; defaults to the placeholder) arrive translated.
 */

type SteerComposerProps = Omit<React.ComponentProps<'div'>, 'onSubmit'> & {
	value: string
	onValueChange: (value: string) => void
	onSubmit: () => void
	pending?: boolean
	placeholder: string
	hint?: React.ReactNode
	sendLabel: string
	inputLabel?: string
}

function SteerComposer({
	value,
	onValueChange,
	onSubmit,
	pending = false,
	placeholder,
	hint,
	sendLabel,
	inputLabel,
	className,
	...props
}: SteerComposerProps) {
	const hintId = React.useId()
	const canSend = !pending && value.trim().length > 0

	const send = () => {
		if (canSend) onSubmit()
	}

	const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
		event.preventDefault()
		send()
	}

	return (
		<div data-slot="steer-composer" aria-busy={pending || undefined} className={cn('flex min-w-0 flex-col gap-2', className)} {...props}>
			<div className="flex h-10 min-w-0 items-center gap-2 rounded-asymmetric-sm border border-input bg-background pr-1.5 pl-3.5 transition-colors focus-within:border-primary">
				<input
					data-slot="steer-composer-input"
					type="text"
					value={value}
					onChange={event => onValueChange(event.target.value)}
					onKeyDown={onKeyDown}
					placeholder={placeholder}
					aria-label={inputLabel ?? placeholder}
					aria-describedby={hint ? hintId : undefined}
					className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-caption-foreground"
				/>
				<button
					type="button"
					data-slot="steer-composer-send"
					aria-label={sendLabel}
					disabled={!canSend}
					onClick={send}
					className="flex size-7.5 shrink-0 cursor-pointer items-center justify-center rounded-asymmetric-2xs bg-primary text-primary-foreground outline-none transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
				>
					{pending ? (
						<IconLoader2 aria-hidden="true" className="size-4 animate-spin" />
					) : (
						<IconArrowUp aria-hidden="true" className="size-4" />
					)}
				</button>
			</div>
			{hint ? (
				<p id={hintId} className="text-xs text-muted-foreground">
					{hint}
				</p>
			) : null}
		</div>
	)
}

export { SteerComposer }
