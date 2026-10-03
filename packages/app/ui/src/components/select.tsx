import * as React from 'react'
import { Select as SelectPrimitive } from '@base-ui/react/select'
import { useTranslation } from 'react-i18next'

import { cn } from '../lib/cn'
import { isEnumValue } from '../lib/enums'
import { trigger, triggerBg, triggerBorder } from './surfaces'
import { IconSelector, IconCheck, IconChevronUp, IconChevronDown } from '@tabler/icons-react'

// ──────────────────────────────────────────────────────────────────────────────
// Enum-mode props (opt-in via the `enum` prop)
// ──────────────────────────────────────────────────────────────────────────────

// The visible root in enum mode is `SelectTrigger` — className/id/disabled/aria-invalid all come
// from there instead of being hand-typed. `children` is fully owned (the trigger content is derived
// from `value`/`placeholder`, never passed by the caller).
interface SelectEnumProps<E extends Record<string, string>> extends Omit<React.ComponentProps<typeof SelectTrigger>, 'children'> {
	/** The SDK enum object (e.g. `TaxTypeEnum`). When present, activates enum mode. */
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
// Select — overloaded: enum mode (opt-in via `enum`) OR compound mode (Base UI Root,
// generic over Value so onValueChange inference is preserved exactly as the bare re-export).
// ──────────────────────────────────────────────────────────────────────────────

function Select<E extends Record<string, string>>(props: SelectEnumProps<E>): React.ReactElement
function Select<Value>(props: SelectPrimitive.Root.Props<Value>): React.ReactElement
function Select(props: SelectEnumProps<Record<string, string>> | SelectPrimitive.Root.Props<unknown>): React.ReactElement {
	if ('enum' in props && props.enum != null) {
		const { enum: enumObj, i18nPrefix, value, onValueChange, placeholder, values, ...rest } = props
		return (
			<SelectEnum
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
	const { children, ...rest } = props as SelectPrimitive.Root.Props<unknown>
	return <SelectRoot {...rest}>{children}</SelectRoot>
}

// `SelectPrimitive.Root` is a non-rendering context provider — it emits its `children` PLUS a
// visually-hidden native `<input>` (Base UI's autofill/native-validation sync, `tabIndex={-1}
// aria-hidden`) as DOM siblings, with no wrapper element of its own. That hidden input has no
// `[data-slot]` on itself, so the fidelity DOM audit's `el.closest('[data-slot]')` (cânon 22 —
// "todo interativo vem do catálogo") flagged it as a raw `<input>` on every screen using `Select`
// (measured: `vincular-agentes-wrapper`, F3 batch B3) even though it is BASE UI's own internal,
// invisible to the user. Fix lives at the CATALOG root, not the call site: wrap in a
// `data-slot="select"` container so `closest()` finds it regardless of which sub-part renders the
// hidden input. `display: contents` keeps zero layout impact — the wrapper never enters the box
// model, so `SelectTrigger`'s `w-fit` sizing inside a flex row (e.g. `AgentsStep`) is unaffected.
function SelectRoot<Value>({
	children,
	className,
	style,
	...props
}: SelectPrimitive.Root.Props<Value> & Pick<React.ComponentProps<'div'>, 'className' | 'style'>) {
	return (
		<div className={className} data-slot="select" style={{ display: 'contents', ...style }}>
			<SelectPrimitive.Root {...props}>{children}</SelectPrimitive.Root>
		</div>
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal enum renderer (not exported)
// ──────────────────────────────────────────────────────────────────────────────

function SelectEnum<E extends Record<string, string>>({
	enumObj,
	i18nPrefix,
	value,
	onValueChange,
	placeholder,
	values,
	...props
}: Omit<SelectEnumProps<E>, 'enum'> & { enumObj: E }) {
	const { t } = useTranslation()
	const options = values ?? (Object.values(enumObj) as E[keyof E][])

	return (
		<SelectRoot
			value={value ?? null}
			onValueChange={v => {
				if (isEnumValue(enumObj, v)) onValueChange(v)
			}}
		>
			<SelectTrigger {...props}>
				<SelectValue>{value != null ? t(`${i18nPrefix}.${value}`) : placeholder ? t(placeholder) : null}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{options.map(v => (
					<SelectItem key={v} value={v}>
						{t(`${i18nPrefix}.${v}`)}
					</SelectItem>
				))}
			</SelectContent>
		</SelectRoot>
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// Compound sub-components (unchanged)
// ──────────────────────────────────────────────────────────────────────────────

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
	return <SelectPrimitive.Group data-slot="select-group" className={cn('scroll-my-1 p-2', className)} {...props} />
}

function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
	return <SelectPrimitive.Value data-slot="select-value" className={cn('flex flex-1 text-left', className)} {...props} />
}

function SelectTrigger({
	className,
	size = 'default',
	children,
	...props
}: SelectPrimitive.Trigger.Props & {
	size?: 'sm' | 'default'
}) {
	return (
		<SelectPrimitive.Trigger
			data-slot="select-trigger"
			data-size={size}
			className={cn(
				trigger,
				"cursor-pointer data-[placeholder]:text-muted-foreground focus-visible:ring-ring/30 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 gap-1.5 rounded-asymmetric-xs py-2 pr-2 pl-2.5 text-sm transition-all duration-200 ease-in-out select-none focus-visible:ring-2 aria-invalid:ring-2 data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-asymmetric-2xs *:data-[slot=select-value]:flex *:data-[slot=select-value]:gap-1.5 [&_svg:not([class*='size-'])]:size-4 flex w-fit items-center justify-between whitespace-nowrap outline-none disabled:cursor-not-allowed disabled:opacity-50 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...props}
		>
			{children}
			<SelectPrimitive.Icon render={<IconSelector className="text-muted-foreground size-4 pointer-events-none" />} />
		</SelectPrimitive.Trigger>
	)
}

function SelectContent({
	className,
	children,
	side = 'bottom',
	sideOffset = 4,
	align = 'center',
	alignOffset = 0,
	alignItemWithTrigger = false,
	...props
}: SelectPrimitive.Popup.Props &
	Pick<SelectPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset' | 'alignItemWithTrigger'>) {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Positioner
				side={side}
				sideOffset={sideOffset}
				align={align}
				alignOffset={alignOffset}
				alignItemWithTrigger={alignItemWithTrigger}
				className="isolate z-50"
			>
				<SelectPrimitive.Popup
					data-slot="select-content"
					className={cn(
						// Only the SURFACE of the trigger family — never `trigger` itself: that string carries
						// `hover:bg-hover`, and on a popup it swaps the solid background for a 5%-alpha tint under
						// backdrop-blur the moment the pointer enters, dimming the whole list. Row hover is per-item.
						triggerBg,
						triggerBorder,
						'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-98 data-open:zoom-in-100 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 min-w-36 rounded-asymmetric-lg duration-200 ease-in-out relative isolate z-50 max-h-(--available-height) w-(--anchor-width) origin-(--transform-origin) overflow-x-hidden overflow-y-auto supports-backdrop-filter:backdrop-blur-sm',
						className,
					)}
					{...props}
				>
					<SelectScrollUpButton />
					<SelectPrimitive.List>{children}</SelectPrimitive.List>
					<SelectScrollDownButton />
				</SelectPrimitive.Popup>
			</SelectPrimitive.Positioner>
		</SelectPrimitive.Portal>
	)
}

function SelectLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
	return (
		<SelectPrimitive.GroupLabel
			data-slot="select-label"
			className={cn('text-muted-foreground px-1.5 py-1 text-xs', className)}
			{...props}
		/>
	)
}

/**
 * `data-value` espelha o `value` do item — e nao e enfeite.
 *
 * `packages/e2e/utils/selectors.ts#pickOptionByValue` PROMETE no proprio docblock que "our SelectItem
 * primitive forwards `value` as `data-value`, so this locator is collision-free regardless of label
 * translation". A promessa era falsa neste repo: o atributo nunca era emitido, e o helper — a unica
 * forma de escolher uma opcao sem depender do rotulo traduzido — nao podia funcionar em spec nenhuma.
 * Uma linha aqui torna verdadeiro o contrato que o helper ja documentava, em vez de aposentar o
 * helper e mandar cada spec casar por texto traduzido.
 *
 * `value` e um primitivo (string/number/null) na API do Base UI, e o `data-*` fica ANTES do spread
 * para que um caso que precise sobrescrever ainda possa.
 */
function SelectItem({ className, children, ...props }: SelectPrimitive.Item.Props) {
	return (
		<SelectPrimitive.Item
			data-slot="select-item"
			data-value={props.value == null ? undefined : String(props.value)}
			className={cn(
				"focus:bg-hover focus:text-foreground gap-1.5 rounded-none first:rounded-t-md last:rounded-b-md py-2.25 pr-8 pl-2.25 text-sm [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2 relative flex w-full cursor-pointer items-center outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...props}
		>
			<SelectPrimitive.ItemText className="flex flex-1 gap-2 shrink-0 whitespace-nowrap">{children}</SelectPrimitive.ItemText>
			<SelectPrimitive.ItemIndicator
				render={<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />}
			>
				<IconCheck className="pointer-events-none" />
			</SelectPrimitive.ItemIndicator>
		</SelectPrimitive.Item>
	)
}

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
	return (
		<SelectPrimitive.Separator
			data-slot="select-separator"
			className={cn('bg-border -mx-1 my-1 h-px pointer-events-none', className)}
			{...props}
		/>
	)
}

function SelectScrollUpButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
	return (
		<SelectPrimitive.ScrollUpArrow
			data-slot="select-scroll-up-button"
			className={cn(
				"bg-background z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4 top-0 w-full",
				className,
			)}
			{...props}
		>
			<IconChevronUp />
		</SelectPrimitive.ScrollUpArrow>
	)
}

function SelectScrollDownButton({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
	return (
		<SelectPrimitive.ScrollDownArrow
			data-slot="select-scroll-down-button"
			className={cn(
				"bg-background z-10 flex cursor-default items-center justify-center py-1 [&_svg:not([class*='size-'])]:size-4 bottom-0 w-full",
				className,
			)}
			{...props}
		>
			<IconChevronDown />
		</SelectPrimitive.ScrollDownArrow>
	)
}

export {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectScrollDownButton,
	SelectScrollUpButton,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
}
