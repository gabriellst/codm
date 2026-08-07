import * as React from 'react'
import { Menu as MenuPrimitive } from '@base-ui/react/menu'

import { cn } from '@/lib/utils'
import { trigger } from './surfaces'
import { IconChevronRight, IconCheck } from '@tabler/icons-react'

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
	return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
	return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

const DropdownMenuTrigger = React.forwardRef<HTMLButtonElement, MenuPrimitive.Trigger.Props>(function DropdownMenuTrigger(
	{ ...props },
	ref,
) {
	return <MenuPrimitive.Trigger ref={ref} data-slot="dropdown-menu-trigger" {...props} />
})

function DropdownMenuContent({
	align = 'start',
	alignOffset = 0,
	side = 'bottom',
	sideOffset = 4,
	className,
	...props
}: MenuPrimitive.Popup.Props & Pick<MenuPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>) {
	return (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Positioner
				className="isolate z-50 outline-none"
				align={align}
				alignOffset={alignOffset}
				side={side}
				sideOffset={sideOffset}
			>
				<MenuPrimitive.Popup
					data-slot="dropdown-menu-content"
					className={cn(
						trigger,
						'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 min-w-32 rounded-asymmetric-lg p-2 shadow-md duration-100 z-50 max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto outline-none data-closed:overflow-hidden',
						className,
					)}
					{...props}
				/>
			</MenuPrimitive.Positioner>
		</MenuPrimitive.Portal>
	)
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
	return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

function DropdownMenuLabel({
	className,
	inset,
	...props
}: MenuPrimitive.GroupLabel.Props & {
	inset?: boolean
}) {
	return (
		<MenuPrimitive.GroupLabel
			data-slot="dropdown-menu-label"
			data-inset={inset}
			className={cn('text-muted-foreground px-1.5 py-1 text-xs font-medium data-[inset]:pl-8', className)}
			{...props}
		/>
	)
}

const DropdownMenuItem = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.Item.Props & {
		inset?: boolean
		variant?: 'default' | 'destructive'
	}
>(function DropdownMenuItem({ className, inset, variant = 'default', ...props }, ref) {
	return (
		<MenuPrimitive.Item
			ref={ref}
			data-slot="dropdown-menu-item"
			data-inset={inset}
			data-variant={variant}
			className={cn(
				"focus:bg-hover focus:text-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:text-destructive gap-1.5 rounded-none first:rounded-t-md last:rounded-b-md pl-2.25 pr-1.5 py-2.25 text-sm [&_svg:not([class*='size-'])]:size-4 group/dropdown-menu-item relative flex cursor-pointer items-center outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...props}
		/>
	)
})

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
	return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

const DropdownMenuSubTrigger = React.forwardRef<
	HTMLDivElement,
	MenuPrimitive.SubmenuTrigger.Props & {
		inset?: boolean
	}
>(function DropdownMenuSubTrigger({ className, inset, children, ...props }, ref) {
	return (
		<MenuPrimitive.SubmenuTrigger
			ref={ref}
			data-slot="dropdown-menu-sub-trigger"
			data-inset={inset}
			className={cn(
				"focus:bg-hover focus:text-foreground data-open:bg-hover data-open:text-foreground gap-1.5 rounded-none first:rounded-t-md last:rounded-b-md pl-2.25 pr-1.5 py-2.25 text-sm [&_svg:not([class*='size-'])]:size-4 flex cursor-pointer items-center outline-hidden select-none data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...props}
		>
			{children}
			<IconChevronRight className="ml-auto" />
		</MenuPrimitive.SubmenuTrigger>
	)
})

function DropdownMenuSubContent({
	align = 'start',
	alignOffset = -3,
	side = 'right',
	sideOffset = 0,
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
	return (
		<DropdownMenuContent
			data-slot="dropdown-menu-sub-content"
			className={cn(
				'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 min-w-24 rounded-asymmetric-md p-2 shadow-lg duration-100 w-auto',
				className,
			)}
			align={align}
			alignOffset={alignOffset}
			side={side}
			sideOffset={sideOffset}
			{...props}
		/>
	)
}

const DropdownMenuCheckboxItem = React.forwardRef<HTMLDivElement, MenuPrimitive.CheckboxItem.Props>(function DropdownMenuCheckboxItem(
	{ className, children, checked, ...props },
	ref,
) {
	return (
		<MenuPrimitive.CheckboxItem
			ref={ref}
			data-slot="dropdown-menu-checkbox-item"
			className={cn(
				"focus:bg-hover focus:text-foreground gap-1.5 rounded-none first:rounded-t-md last:rounded-b-md py-2.25 pr-8 pl-2.25 text-sm [&_svg:not([class*='size-'])]:size-4 relative flex cursor-pointer items-center outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			checked={checked}
			{...props}
		>
			<span
				className="pointer-events-none absolute right-2 flex items-center justify-center pointer-events-none"
				data-slot="dropdown-menu-checkbox-item-indicator"
			>
				<MenuPrimitive.CheckboxItemIndicator>
					<IconCheck />
				</MenuPrimitive.CheckboxItemIndicator>
			</span>
			{children}
		</MenuPrimitive.CheckboxItem>
	)
})

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
	return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

const DropdownMenuRadioItem = React.forwardRef<HTMLDivElement, MenuPrimitive.RadioItem.Props>(function DropdownMenuRadioItem(
	{ className, children, ...props },
	ref,
) {
	return (
		<MenuPrimitive.RadioItem
			ref={ref}
			data-slot="dropdown-menu-radio-item"
			className={cn(
				"focus:bg-hover focus:text-foreground gap-1.5 rounded-none first:rounded-t-md last:rounded-b-md py-2.25 pr-8 pl-2.25 text-sm [&_svg:not([class*='size-'])]:size-4 relative flex cursor-pointer items-center outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...props}
		>
			<span
				className="pointer-events-none absolute right-2 flex items-center justify-center pointer-events-none"
				data-slot="dropdown-menu-radio-item-indicator"
			>
				<MenuPrimitive.RadioItemIndicator>
					<IconCheck />
				</MenuPrimitive.RadioItemIndicator>
			</span>
			{children}
		</MenuPrimitive.RadioItem>
	)
})

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
	return <MenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn('bg-border -mx-1 my-1 h-px', className)} {...props} />
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
	return (
		<span
			data-slot="dropdown-menu-shortcut"
			className={cn('text-muted-foreground group-focus/dropdown-menu-item:text-foreground ml-auto text-xs tracking-widest', className)}
			{...props}
		/>
	)
}

export {
	DropdownMenu,
	DropdownMenuPortal,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuItem,
	DropdownMenuCheckboxItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
}
