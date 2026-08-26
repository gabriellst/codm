import * as React from 'react'
import { Combobox as ComboboxPrimitive } from '@base-ui/react'
import { useTranslation } from 'react-i18next'

import { cn } from '../lib/cn'
import { isEnumValue } from '../lib/enums'
import { Button } from './button'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from './input-group'
import { trigger, triggerBg, triggerBorder } from './surfaces'
import { IconChevronDown, IconX, IconCheck } from '@tabler/icons-react'

// ──────────────────────────────────────────────────────────────────────────────
// Enum-mode props (opt-in via the `enum` prop)
// ──────────────────────────────────────────────────────────────────────────────

// The visible root in enum mode is `ComboboxSelectTrigger` (a <div> wrapper) — className/id/
// disabled/aria-invalid all come from there instead of being hand-typed. `children` is fully owned
// (the trigger content is derived from `value`/`placeholder`, never passed by the caller).
interface ComboboxEnumProps<E extends Record<string, string>> extends Omit<React.ComponentProps<typeof ComboboxSelectTrigger>, 'children'> {
	/** The SDK enum object. When present, activates enum mode (select-trigger style). */
	enum: E
	/** i18n key prefix — each value `v` is rendered as `t(`${i18nPrefix}.${v}`)`. */
	i18nPrefix: string
	/** Current value. Pass `undefined` to show the placeholder. */
	value: E[keyof E] | undefined
	/** Called with the narrowed enum value; never called with an out-of-enum string. */
	onValueChange: (v: E[keyof E]) => void
	/** i18n key for the placeholder shown when no value is selected. */
	placeholder?: string
	/** Optional subset of enum values to show. Defaults to `Object.values(enum)`. */
	values?: E[keyof E][]
	children?: never
}

// ──────────────────────────────────────────────────────────────────────────────
// Combobox — overloaded signature
// ──────────────────────────────────────────────────────────────────────────────

// Overload: enum mode (opt-in via `enum`) OR compound mode (generic over Value to preserve inference).
function Combobox<E extends Record<string, string>>(props: ComboboxEnumProps<E>): React.ReactElement
function Combobox<Value>(props: ComboboxPrimitive.Root.Props<Value>): React.ReactElement
function Combobox(props: ComboboxEnumProps<Record<string, string>> | ComboboxPrimitive.Root.Props<unknown>): React.ReactElement {
	if ('enum' in props && props.enum != null) {
		const { enum: enumObj, i18nPrefix, value, onValueChange, placeholder, values, ...rest } = props
		return (
			<ComboboxEnum
				enumObj={enumObj}
				i18nPrefix={i18nPrefix}
				value={value}
				onValueChange={onValueChange}
				placeholder={placeholder}
				values={values}
				{...rest}
			/>
		)
	}
	const { children, ...rest } = props as ComboboxPrimitive.Root.Props<unknown>
	return <ComboboxPrimitive.Root {...rest}>{children}</ComboboxPrimitive.Root>
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal enum renderer (not exported)
// ──────────────────────────────────────────────────────────────────────────────

function ComboboxEnum<E extends Record<string, string>>({
	enumObj,
	i18nPrefix,
	value,
	onValueChange,
	placeholder,
	values,
	...props
}: Omit<ComboboxEnumProps<E>, 'enum'> & { enumObj: E }) {
	const { t } = useTranslation()
	const options = values ?? (Object.values(enumObj) as E[keyof E][])
	const label = value != null ? t(`${i18nPrefix}.${value}`) : placeholder ? t(placeholder) : undefined

	return (
		<ComboboxPrimitive.Root
			value={value ?? null}
			onValueChange={v => {
				if (isEnumValue(enumObj, v)) onValueChange(v)
			}}
			disabled={props.disabled}
		>
			<ComboboxSelectTrigger {...props}>
				{label != null ? <span>{label}</span> : <span className="text-muted-foreground">{placeholder ? t(placeholder) : null}</span>}
			</ComboboxSelectTrigger>
			<ComboboxContent>
				<ComboboxList>
					{options.map(v => (
						<ComboboxItem key={v} value={v}>
							{t(`${i18nPrefix}.${v}`)}
						</ComboboxItem>
					))}
				</ComboboxList>
			</ComboboxContent>
		</ComboboxPrimitive.Root>
	)
}

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
	return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />
}

const ComboboxTrigger = React.forwardRef<HTMLButtonElement, ComboboxPrimitive.Trigger.Props>(function ComboboxTrigger(
	{ className, children, ...props },
	ref,
) {
	return (
		<ComboboxPrimitive.Trigger
			ref={ref}
			data-slot="combobox-trigger"
			className={cn("[&_svg:not([class*='size-'])]:size-4", className)}
			{...props}
		>
			{children}
			<IconChevronDown className="text-muted-foreground size-4 pointer-events-none" />
		</ComboboxPrimitive.Trigger>
	)
})

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
	return (
		<ComboboxPrimitive.Clear
			data-slot="combobox-clear"
			render={<InputGroupButton variant="ghost" size="icon-xs" />}
			className={cn(className)}
			{...props}
		>
			<IconX className="pointer-events-none" />
		</ComboboxPrimitive.Clear>
	)
}

function ComboboxInput({
	className,
	children,
	disabled = false,
	showTrigger = true,
	showClear = false,
	...props
}: ComboboxPrimitive.Input.Props & {
	showTrigger?: boolean
	showClear?: boolean
}) {
	return (
		<InputGroup className={cn('w-auto', className)}>
			<ComboboxPrimitive.Input render={<InputGroupInput disabled={disabled} />} {...props} />
			<InputGroupAddon align="inline-end">
				{showTrigger && (
					<InputGroupButton
						size="icon-xs"
						variant="ghost"
						render={<ComboboxTrigger />}
						data-slot="input-group-button"
						className="group-has-data-[slot=combobox-clear]/input-group:hidden data-pressed:bg-transparent"
						disabled={disabled}
					/>
				)}
				{showClear && <ComboboxClear disabled={disabled} />}
			</InputGroupAddon>
			{children}
		</InputGroup>
	)
}

function ComboboxContent({
	className,
	side = 'bottom',
	sideOffset = 6,
	align = 'start',
	alignOffset = 0,
	anchor,
	...props
}: ComboboxPrimitive.Popup.Props & Pick<ComboboxPrimitive.Positioner.Props, 'side' | 'align' | 'sideOffset' | 'alignOffset' | 'anchor'>) {
	return (
		<ComboboxPrimitive.Portal>
			<ComboboxPrimitive.Positioner
				side={side}
				sideOffset={sideOffset}
				align={align}
				alignOffset={alignOffset}
				anchor={anchor}
				className="isolate z-50"
			>
				<ComboboxPrimitive.Popup
					data-slot="combobox-content"
					data-chips={!!anchor}
					className={cn(
						// Surface only — `trigger` carries `hover:bg-hover`, which on a popup dims the whole list
						// (5%-alpha tint under backdrop-blur) as soon as the pointer enters. Row hover is per-item.
						triggerBg,
						triggerBorder,
						'rounded-asymmetric-lg data-open:animate-in data-closed:animate-out ',
						'data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ',
						'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2',
						'data-[side=top]:slide-in-from-bottom-2 *:data-[slot=input-group]:bg-input/30 *:data-[slot=input-group]:border-input/30 max-h-72 min-w-36 overflow-hidden shadow-md duration-100 *:data-[slot=input-group]:m-1 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-8 *:data-[slot=input-group]:shadow-none group/combobox-content relative max-h-(--available-height) max-w-(--available-width) origin-(--transform-origin)',
						className,
					)}
					{...props}
				/>
			</ComboboxPrimitive.Positioner>
		</ComboboxPrimitive.Portal>
	)
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
	return (
		<ComboboxPrimitive.List
			data-slot="combobox-list"
			className={cn(
				'no-scrollbar max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] scroll-py-1 overflow-y-auto p-2 data-empty:p-0 overflow-y-auto overscroll-contain',
				className,
			)}
			{...props}
		/>
	)
}

function ComboboxItem({ className, children, ...props }: ComboboxPrimitive.Item.Props) {
	return (
		<ComboboxPrimitive.Item
			data-slot="combobox-item"
			className={cn(
				"data-highlighted:bg-hover data-highlighted:text-foreground gap-2 rounded-none first:rounded-t-md last:rounded-b-md py-2.25 pr-8 pl-2.25 text-sm [&_svg:not([class*='size-'])]:size-4 relative flex w-full cursor-pointer items-center outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...props}
		>
			{children}
			<ComboboxPrimitive.ItemIndicator
				render={<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />}
			>
				<IconCheck className="pointer-events-none" />
			</ComboboxPrimitive.ItemIndicator>
		</ComboboxPrimitive.Item>
	)
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
	return <ComboboxPrimitive.Group data-slot="combobox-group" className={cn(className)} {...props} />
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
	return (
		<ComboboxPrimitive.GroupLabel
			data-slot="combobox-label"
			className={cn('text-muted-foreground px-2 py-1.5 text-xs', className)}
			{...props}
		/>
	)
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
	return <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
	return (
		<ComboboxPrimitive.Empty
			data-slot="combobox-empty"
			className={cn(
				'text-muted-foreground hidden w-full justify-center py-2 text-center text-sm group-data-empty/combobox-content:flex',
				className,
			)}
			{...props}
		/>
	)
}

function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
	return <ComboboxPrimitive.Separator data-slot="combobox-separator" className={cn('bg-border -mx-1 my-1 h-px', className)} {...props} />
}

function ComboboxChips({
	className,
	...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> & ComboboxPrimitive.Chips.Props) {
	return (
		<ComboboxPrimitive.Chips
			data-slot="combobox-chips"
			className={cn(
				'dark:bg-input/30 border-input focus-within:border-ring focus-within:ring-ring/30 has-aria-invalid:ring-destructive/20 dark:has-aria-invalid:ring-destructive/40 has-aria-invalid:border-destructive dark:has-aria-invalid:border-destructive/50 flex min-h-8 flex-wrap items-center gap-1 rounded-asymmetric-xs border bg-transparent bg-clip-padding px-2.5 py-1 text-sm transition-colors focus-within:ring-2 has-aria-invalid:ring-2 has-data-[slot=combobox-chip]:px-1',
				className,
			)}
			{...props}
		/>
	)
}

function ComboboxChip({
	className,
	children,
	showRemove = true,
	...props
}: ComboboxPrimitive.Chip.Props & {
	showRemove?: boolean
}) {
	return (
		<ComboboxPrimitive.Chip
			data-slot="combobox-chip"
			className={cn(
				'bg-muted flex h-[calc(--spacing(5.25))] w-fit items-center justify-center gap-1 rounded-asymmetric-3xs px-1.5 text-xs font-medium whitespace-nowrap has-data-[slot=combobox-chip-remove]:pr-0 has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-50',
				className,
			)}
			{...props}
		>
			{children}
			{showRemove && (
				<ComboboxPrimitive.ChipRemove
					render={<Button variant="ghost" size="icon-xs" />}
					className="-ml-1 opacity-50 hover:opacity-100"
					data-slot="combobox-chip-remove"
				>
					<IconX className="pointer-events-none" />
				</ComboboxPrimitive.ChipRemove>
			)}
		</ComboboxPrimitive.Chip>
	)
}

function ComboboxChipsInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
	return <ComboboxPrimitive.Input data-slot="combobox-chip-input" className={cn('min-w-16 flex-1 outline-none', className)} {...props} />
}

/**
 * Select-like trigger for the Combobox — use instead of ComboboxInput
 * when you need a compact dropdown trigger without a search field.
 *
 * Usage:
 * ```tsx
 * <Combobox value={value} onValueChange={setValue}>
 *   <ComboboxSelectTrigger size="sm" placeholder="Select...">
 *     {selectedLabel}
 *   </ComboboxSelectTrigger>
 *   <ComboboxContent>
 *     <ComboboxList>
 *       <ComboboxItem value="a" label="A">A</ComboboxItem>
 *     </ComboboxList>
 *   </ComboboxContent>
 * </Combobox>
 * ```
 */
function ComboboxSelectTrigger({
	className,
	size = 'default',
	children,
	disabled = false,
	...props
}: Omit<React.ComponentProps<'div'>, 'children'> & {
	size?: 'sm' | 'default'
	children?: React.ReactNode
	disabled?: boolean
}) {
	return (
		<div data-slot="combobox-select-trigger" data-size={size} className={cn('relative flex items-center', className)} {...props}>
			{/* Hidden input required by Base UI — positioned over trigger so Positioner anchors correctly */}
			<ComboboxPrimitive.Input className="absolute inset-0 opacity-0 pointer-events-none" tabIndex={-1} disabled={disabled} />
			<ComboboxPrimitive.Trigger
				className={cn(
					trigger,
					"cursor-pointer gap-1.5 rounded-asymmetric-xs py-2 pr-2 pl-2.5 text-sm select-none data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-asymmetric-2xs [&_svg:not([class*='size-'])]:size-4 flex w-fit items-center justify-between whitespace-nowrap outline-none disabled:cursor-not-allowed disabled:opacity-50",
				)}
				data-size={size}
				disabled={disabled}
			>
				<span className="flex flex-1 items-center gap-1.5 text-left">{children}</span>
				<IconChevronDown className="text-muted-foreground size-4 pointer-events-none shrink-0" />
			</ComboboxPrimitive.Trigger>
		</div>
	)
}

function useComboboxAnchor() {
	return React.useRef<HTMLDivElement | null>(null)
}

export {
	Combobox,
	ComboboxInput,
	ComboboxContent,
	ComboboxList,
	ComboboxItem,
	ComboboxGroup,
	ComboboxLabel,
	ComboboxCollection,
	ComboboxEmpty,
	ComboboxSeparator,
	ComboboxChips,
	ComboboxChip,
	ComboboxChipsInput,
	ComboboxSelectTrigger,
	ComboboxTrigger,
	ComboboxValue,
	useComboboxAnchor,
}
