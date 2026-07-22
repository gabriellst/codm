import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Combobox as ComboboxPrimitive } from '@base-ui/react'
import { Select as SelectPrimitive } from '@base-ui/react/select'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { triggerBg, triggerBorder, triggerHover } from './surfaces'

// Same fill/border as <Input>, but hover/focus are driven by `hover` and
// `has(:focus)` on the wrapper (so addons inside the group keep the wrapper highlighted).
const inputGroupBg = 'gradient-bg-[var(--background)_-85%,color-mix(in_oklab,var(--background),var(--foreground)_10%)_110%]'
const inputGroupBorder = 'gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0)_60%]'
const inputGroupBorderHover = 'hover:gradient-border-[oklch(from_var(--border)_l_c_h_/_0.3)_0%,oklch(from_var(--border)_l_c_h_/_0.2)_100%]'
const inputGroupBorderFocus =
	'focus:gradient-border-[oklch(from_var(--border)_l_c_h_/_0.15)_0%,oklch(from_var(--border)_l_c_h_/_0.05)_100%]'

function InputGroup({ className, variant = 'default', ...props }: React.ComponentProps<'div'> & { variant?: 'default' | 'trigger' }) {
	const isTrigger = variant === 'trigger'
	return (
		<div
			data-slot="input-group"
			role="group"
			className={cn(
				'gradient-box',
				isTrigger ? triggerBg : inputGroupBg,
				isTrigger ? triggerBorder : inputGroupBorder,
				isTrigger ? triggerHover : inputGroupBorderHover,
				inputGroupBorderFocus,
				'rounded-lg',
				'h-8',
				'has-disabled:opacity-50',
				'has-[>textarea]:h-auto',
				'group/input-group relative flex w-full min-w-0 items-center outline-none',
				className,
			)}
			{...props}
		/>
	)
}

const inputGroupAddonVariants = cva(
	"text-muted-foreground h-auto gap-2 py-1.5 text-sm font-medium group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-sm [&>svg:not([class*='size-'])]:size-4 flex cursor-text items-center justify-center select-none",
	{
		variants: {
			align: {
				'inline-start': 'pl-2 has-[>button]:-ml-1 has-[>kbd]:-ml-0.5 order-first',
				'inline-end': 'pr-2 has-[>button]:-mr-1 has-[>kbd]:-mr-0.5 order-last',
				'block-start': 'px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2 order-first w-full justify-start',
				'block-end': 'px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2 order-last w-full justify-start',
			},
		},
		defaultVariants: {
			align: 'inline-start',
		},
	},
)

function InputGroupAddon({
	className,
	align = 'inline-start',
	...props
}: React.ComponentProps<'div'> & VariantProps<typeof inputGroupAddonVariants>) {
	return (
		<div
			role="group"
			data-slot="input-group-addon"
			data-align={align}
			className={cn(inputGroupAddonVariants({ align }), className)}
			onClick={e => {
				if ((e.target as HTMLElement).closest('button')) {
					return
				}
				e.currentTarget.parentElement?.querySelector('input')?.focus()
			}}
			{...props}
		/>
	)
}

const inputGroupButtonVariants = cva('gap-2 text-sm shadow-none flex items-center', {
	variants: {
		size: {
			xs: "h-6 gap-1 rounded-sm px-1.5 [&>svg:not([class*='size-'])]:size-3.5",
			sm: '',
			'icon-xs': 'size-6 rounded-sm p-0 has-[>svg]:p-0',
			'icon-sm': 'size-8 p-0 has-[>svg]:p-0',
		},
	},
	defaultVariants: {
		size: 'xs',
	},
})

const InputGroupButton = React.forwardRef<
	HTMLButtonElement,
	Omit<React.ComponentProps<typeof Button>, 'size' | 'type'> &
		VariantProps<typeof inputGroupButtonVariants> & {
			type?: 'button' | 'submit' | 'reset'
		}
>(function InputGroupButton({ className, type = 'button', variant = 'ghost', size = 'xs', ...props }, ref) {
	return (
		<Button
			ref={ref}
			type={type}
			data-size={size}
			variant={variant}
			className={cn(inputGroupButtonVariants({ size }), className)}
			{...props}
		/>
	)
})

function InputGroupText({ className, ...props }: React.ComponentProps<'span'>) {
	return (
		<span
			data-slot="input-group-text"
			className={cn(
				"text-muted-foreground gap-2 text-sm [&_svg:not([class*='size-'])]:size-4 flex items-center [&_svg]:pointer-events-none",
				className,
			)}
			{...props}
		/>
	)
}

// Strip the gradient-box composition from the nested <Input>/<Textarea>: the
// wrapper InputGroup already paints the gradient surface, and a second one on
// the inner control would double up. !important is needed because the inner
// control's own classes set `gradient-box` (background-image stack + 1px
// transparent border carrier) which would otherwise win the cascade.
const stripGradientBox = '[background-image:none]! border-0!'

const InputGroupInput = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(function InputGroupInput(
	{ className, ...props },
	ref,
) {
	return (
		<Input
			ref={ref}
			data-slot="input-group-control"
			className={cn(
				stripGradientBox,
				'rounded-none bg-transparent shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:disabled:bg-transparent flex-1',
				className,
			)}
			{...props}
		/>
	)
})

const InputGroupTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(function InputGroupTextarea(
	{ className, ...props },
	ref,
) {
	return (
		<Textarea
			ref={ref}
			data-slot="input-group-control"
			className={cn(
				stripGradientBox,
				'rounded-none bg-transparent py-2 shadow-none ring-0 focus-visible:ring-0 disabled:bg-transparent aria-invalid:ring-0 dark:bg-transparent dark:disabled:bg-transparent flex-1 resize-none',
				className,
			)}
			{...props}
		/>
	)
})

/**
 * Strips the outer gradient/border from a <SelectTrigger> when used inside an
 * <InputGroup>. Pair the trigger with <Select> / <SelectContent> from
 * `./select` as usual — only the trigger needs the reset.
 *
 *   <InputGroup>
 *     <InputGroupAddon><Avatar>GH</Avatar></InputGroupAddon>
 *     <Select value={currency} onValueChange={setCurrency}>
 *       <InputGroupSelectTrigger>
 *         <SelectValue placeholder="BRL" />
 *       </InputGroupSelectTrigger>
 *       <SelectContent>...</SelectContent>
 *     </Select>
 *     <InputGroupInput placeholder="0,00" />
 *   </InputGroup>
 */
const InputGroupSelectTrigger = React.forwardRef<HTMLButtonElement, SelectPrimitive.Trigger.Props>(function InputGroupSelectTrigger(
	{ className, ...props },
	ref,
) {
	return (
		<SelectPrimitive.Trigger
			ref={ref}
			data-slot="input-group-control"
			className={cn(
				stripGradientBox,
				"cursor-pointer gap-1.5 rounded-none bg-transparent shadow-none ring-0 focus-visible:ring-0 px-2 text-sm flex items-center [&_svg:not([class*='size-'])]:size-4 outline-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	)
})

/**
 * Strips the outer gradient/border from a <Combobox.Trigger> when used inside
 * an <InputGroup>. Pair with <Combobox> / <ComboboxContent> from `./combobox`.
 *
 *   <InputGroup>
 *     <InputGroupAddon><IconSearch /></InputGroupAddon>
 *     <Combobox>
 *       <InputGroupComboboxTrigger>
 *         <ComboboxValue placeholder="Select…" />
 *       </InputGroupComboboxTrigger>
 *       <ComboboxContent>…</ComboboxContent>
 *     </Combobox>
 *   </InputGroup>
 */
const InputGroupComboboxTrigger = React.forwardRef<HTMLButtonElement, ComboboxPrimitive.Trigger.Props>(function InputGroupComboboxTrigger(
	{ className, ...props },
	ref,
) {
	return (
		<ComboboxPrimitive.Trigger
			ref={ref}
			data-slot="input-group-control"
			className={cn(
				stripGradientBox,
				"cursor-pointer gap-1.5 rounded-none bg-transparent shadow-none ring-0 focus-visible:ring-0 px-2 text-sm flex items-center [&_svg:not([class*='size-'])]:size-4 outline-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	)
})

export {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupText,
	InputGroupInput,
	InputGroupTextarea,
	InputGroupSelectTrigger,
	InputGroupComboboxTrigger,
}
