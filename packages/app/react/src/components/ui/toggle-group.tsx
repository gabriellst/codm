'use client'

import * as React from 'react'
import { Toggle as TogglePrimitive } from '@base-ui/react/toggle'
import { ToggleGroup as ToggleGroupPrimitive } from '@base-ui/react/toggle-group'
import { type VariantProps } from 'class-variance-authority'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { isEnumValue } from '@/lib/enums'
import { toggleVariants } from '@/components/ui/toggle'

// ──────────────────────────────────────────────────────────────────────────────
// Enum-mode props (opt-in via the `enum` prop)
// ──────────────────────────────────────────────────────────────────────────────

// `className` comes from the root's own vocabulary instead of being hand-typed — the enum mode
// already carries `VariantProps<typeof toggleVariants>` below, so this is the last hand-typed field.
interface ToggleGroupEnumProps<E extends Record<string, string>> extends Pick<React.ComponentProps<'div'>, 'className'> {
	/** The SDK enum object. When present, activates enum mode (single-select). */
	enum: E
	/** i18n key prefix — each value `v` is rendered as `t(`${i18nPrefix}.${v}`)`. */
	i18nPrefix: string
	/** Current value. Pass `undefined` for no selection. */
	value: E[keyof E] | undefined
	/** Called with the narrowed enum value when a toggle is pressed. */
	onValueChange: (v: E[keyof E]) => void
	/** Optional subset of enum values to show. Defaults to `Object.values(enum)`. */
	values?: E[keyof E][]
	id?: string
	disabled?: boolean
	'aria-invalid'?: boolean | 'true' | 'false'
	variant?: VariantProps<typeof toggleVariants>['variant']
	size?: VariantProps<typeof toggleVariants>['size']
	spacing?: number
	orientation?: 'horizontal' | 'vertical'
	children?: never
}

type ToggleGroupCompoundProps = ToggleGroupPrimitive.Props &
	VariantProps<typeof toggleVariants> & {
		spacing?: number
		orientation?: 'horizontal' | 'vertical'
		enum?: never
	}

// ──────────────────────────────────────────────────────────────────────────────
// ToggleGroupContext (shared by both compound and enum renderers)
// ──────────────────────────────────────────────────────────────────────────────

const ToggleGroupContext = React.createContext<
	VariantProps<typeof toggleVariants> & {
		spacing?: number
		orientation?: 'horizontal' | 'vertical'
	}
>({
	size: 'default',
	variant: 'default',
	spacing: 0,
	orientation: 'horizontal',
})

// ──────────────────────────────────────────────────────────────────────────────
// ToggleGroup — overloaded signature
// ──────────────────────────────────────────────────────────────────────────────

// Overload 1 — enum mode
function ToggleGroup<E extends Record<string, string>>(props: ToggleGroupEnumProps<E>): React.ReactElement
// Overload 2 — compound / children mode
function ToggleGroup(props: ToggleGroupCompoundProps & { ref?: React.Ref<HTMLDivElement> }): React.ReactElement
// Implementation
function ToggleGroup<E extends Record<string, string>>(
	props: ToggleGroupEnumProps<E> | (ToggleGroupCompoundProps & { ref?: React.Ref<HTMLDivElement> }),
): React.ReactElement {
	if ('enum' in props && props.enum != null) {
		const {
			enum: enumObj,
			i18nPrefix,
			value,
			onValueChange,
			values,
			id,
			className,
			disabled,
			'aria-invalid': ariaInvalid,
			variant = 'outline',
			size,
			spacing,
			orientation,
		} = props as ToggleGroupEnumProps<E>
		return (
			<ToggleGroupEnum
				enumObj={enumObj}
				i18nPrefix={i18nPrefix}
				value={value}
				onValueChange={onValueChange}
				values={values}
				id={id}
				className={className}
				disabled={disabled}
				aria-invalid={ariaInvalid}
				variant={variant}
				size={size}
				spacing={spacing}
				orientation={orientation}
			/>
		)
	}

	// Compound mode — delegate to inner forwardRef component
	return <ToggleGroupCompound {...(props as ToggleGroupCompoundProps)} />
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal enum renderer (not exported)
// ──────────────────────────────────────────────────────────────────────────────

function ToggleGroupEnum<E extends Record<string, string>>({
	enumObj,
	i18nPrefix,
	value,
	onValueChange,
	values,
	id,
	className,
	disabled,
	'aria-invalid': ariaInvalid,
	variant = 'outline',
	size,
	spacing = 0,
	orientation = 'horizontal',
}: Omit<ToggleGroupEnumProps<E>, 'enum'> & { enumObj: E }) {
	const { t } = useTranslation()
	const options = values ?? (Object.values(enumObj) as E[keyof E][])

	return (
		<ToggleGroupCompound
			id={id}
			value={value != null ? [value] : []}
			onValueChange={(vals: string[]) => {
				const next = vals[vals.length - 1]
				if (isEnumValue(enumObj, next)) onValueChange(next)
			}}
			variant={variant}
			size={size}
			spacing={spacing}
			orientation={orientation}
			className={className}
			disabled={disabled}
			aria-invalid={ariaInvalid}
		>
			{options.map(v => (
				<ToggleGroupItem key={v} value={v} aria-label={t(`${i18nPrefix}.${v}`)}>
					{t(`${i18nPrefix}.${v}`)}
				</ToggleGroupItem>
			))}
		</ToggleGroupCompound>
	)
}

// ──────────────────────────────────────────────────────────────────────────────
// Compound (children) ToggleGroup — the original forwardRef component
// ──────────────────────────────────────────────────────────────────────────────

const ToggleGroupCompound = React.forwardRef<
	HTMLDivElement,
	ToggleGroupPrimitive.Props &
		VariantProps<typeof toggleVariants> & {
			spacing?: number
			orientation?: 'horizontal' | 'vertical'
		}
>(function ToggleGroupCompound({ className, variant, size, spacing = 0, orientation = 'horizontal', children, ...props }, ref) {
	return (
		<ToggleGroupPrimitive
			ref={ref}
			data-slot="toggle-group"
			data-variant={variant}
			data-size={size}
			data-spacing={spacing}
			data-orientation={orientation}
			style={{ '--gap': spacing } as React.CSSProperties}
			className={cn(
				'rounded-asymmetric-xs data-[size=sm]:rounded-asymmetric-2xs group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch',
				className,
			)}
			{...props}
		>
			<ToggleGroupContext.Provider value={{ variant, size, spacing, orientation }}>{children}</ToggleGroupContext.Provider>
		</ToggleGroupPrimitive>
	)
})

const ToggleGroupItem = React.forwardRef<HTMLButtonElement, TogglePrimitive.Props & VariantProps<typeof toggleVariants>>(
	function ToggleGroupItem({ className, children, variant = 'default', size = 'default', ...props }, ref) {
		const context = React.useContext(ToggleGroupContext)

		return (
			<TogglePrimitive
				ref={ref}
				data-slot="toggle-group-item"
				data-variant={context.variant || variant}
				data-size={context.size || size}
				data-spacing={context.spacing}
				className={cn(
					'group-data-[spacing=0]/toggle-group:rounded-none group-data-[spacing=0]/toggle-group:px-2 group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-lg group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-lg group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-lg group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-lg shrink-0 focus:z-10 focus-visible:z-10 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t',
					toggleVariants({
						variant: context.variant || variant,
						size: context.size || size,
					}),
					className,
				)}
				{...props}
			>
				{children}
			</TogglePrimitive>
		)
	},
)

export { ToggleGroup, ToggleGroupItem }
