import * as React from 'react'

import { cn } from '../lib/cn'
import { surface } from './surfaces'

function Card({ className, size = 'default', ...props }: React.ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
	return (
		<div
			data-slot="card"
			data-size={size}
			className={cn(
				surface,
				// D2/D4 — SYMMETRIC padding. This used to be `pt-5` with no bottom rule at all, so every
				// card in the console was padded on three sides and flush on the fourth: the founder's
				// "o card sem a parte de baixo faltando", exactly. The design pads a card 20px on all four
				// sides; on this workspace's scale (`--spacing: 0.3rem`, NOT the Tailwind default 0.25rem)
				// `4` is 19.2px, so `py-4` + the sections' `px-4` is that 20px — do not "fix" it to `p-5`,
				// which is 24px here.
				'gap-4 overflow-hidden rounded-asymmetric-lg py-4 text-sm transition-all duration-150 ease-out has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-lg *:[img:last-child]:rounded-b-lg group/card flex flex-col',
				className,
			)}
			{...props}
		/>
	)
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="card-header"
			className={cn(
				'gap-1 rounded-t-lg px-4 group-data-[size=sm]/card:px-3 [.border-b]:pb-4 group-data-[size=sm]/card:[.border-b]:pb-3 group/card-header @container/card-header grid auto-rows-min items-start has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]',
				className,
			)}
			{...props}
		/>
	)
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="card-title"
			className={cn('text-base leading-snug font-semibold group-data-[size=sm]/card:text-sm', className)}
			{...props}
		/>
	)
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="card-description" className={cn('text-muted-foreground text-sm', className)} {...props} />
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div data-slot="card-action" className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)} {...props} />
	)
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
	return <div data-slot="card-content" className={cn('px-4 group-data-[size=sm]/card:px-3', className)} {...props} />
}

/**
 * The card's closing row — FLUSH with the body (D2, founder's call): no rule above it, no tint of its
 * own. It had both, which made every footer read as a separate panel welded to the bottom of the card
 * rather than as the end of the same one.
 *
 * It carries only the card's horizontal padding and its bottom padding — `Card` sets `pb-0` whenever a
 * footer is present, so the bottom edge belongs to exactly one of them. Vertical separation from the
 * content above comes from the card's own `gap-4`, which is what makes it continuous.
 */
function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			data-slot="card-footer"
			className={cn('rounded-b-lg px-4 pb-4 group-data-[size=sm]/card:px-3 group-data-[size=sm]/card:pb-3 flex items-center', className)}
			{...props}
		/>
	)
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent }
