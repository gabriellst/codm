import * as React from 'react'
import type { Locale } from '@/lib/locale'
import type { CurrencyCodeEnumKey } from '@codedm/client-typescript/typescript'

import { cn } from '@/lib/utils'
import { useLocale } from '@/hooks/useLocale'
import { InputGroup, InputGroupAddon, InputGroupInput } from './input-group'
import { CurrencySelector, DEFAULT_CURRENCIES } from './currency-selector'

// ──────────────────────────────────────────────────────────────────────────────
// Helpers — cents ↔ display string
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Formats an integer amountCents value as a decimal string in the given locale.
 * pt-BR: 1050 → "10,50"   en-US: 1050 → "10.50"
 */
function centsToDisplay(cents: number, locale: Locale): string {
	return (cents / 100).toLocaleString(locale, {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})
}

/**
 * Parses a raw input string (which may contain formatting chars) into integer
 * cents by stripping everything that is not a digit.
 * "10,50" → 1050   "R$ 1.234,56" → 123456   "" → 0
 */
function displayToCents(raw: string): number {
	const digits = raw.replace(/\D/g, '')
	if (!digits) return 0
	return parseInt(digits, 10)
}

// ──────────────────────────────────────────────────────────────────────────────
// CurrencyInput
// ──────────────────────────────────────────────────────────────────────────────

// `id` is re-typed identically — it targets the inner InputGroupInput, not the InputGroup root, so
// it stays a named field instead of flowing through the spread. `children` is fully owned.
export interface CurrencyInputProps extends Omit<React.ComponentProps<typeof InputGroup>, 'children' | 'id'> {
	/** Current amount in integer cents (e.g. 1050 = R$ 10,50) */
	amountCents: number
	/** Active currency code */
	currency: CurrencyCodeEnumKey
	/** Emits the new amount in integer cents */
	onAmountChange: (cents: number) => void
	/** Emits the newly selected currency code */
	onCurrencyChange: (currency: CurrencyCodeEnumKey) => void
	/** Subset of currencies to show in the selector dropdown */
	currencies?: CurrencyCodeEnumKey[]
	placeholder?: string
	disabled?: boolean
	id?: string
}

/**
 * Unified currency + amount input-group.
 *
 * Renders as:  [ 🇺🇸 USD ⌄ ] [ 0,00 ]
 *
 * - Left addon: CurrencySelector (flag + code + chevron dropdown)
 * - Right field: formatted decimal input (pt-BR locale, 2 decimals)
 * - Internally stores/emits integer cents; displays as major units
 *
 * Parsing: digits are extracted from the raw input string and treated as the
 * last two being decimal places (i.e. typing "1050" gives 1050 cents = 10,50).
 * This matches the standard Brazilian "centavos" entry model.
 */
function CurrencyInput({
	amountCents,
	currency,
	onAmountChange,
	onCurrencyChange,
	currencies = DEFAULT_CURRENCIES,
	placeholder,
	className,
	disabled = false,
	id,
	...props
}: CurrencyInputProps) {
	// Locale comes from i18n (same source as useMoney) so the decimal/grouping separators match the app locale.
	const locale = useLocale()
	// Raw string the user is typing — only canonicalised on blur.
	// Keeping the raw value during typing prevents cursor-fighting (e.g. typing
	// "1" would immediately reformat to "0,01" if we normalised on every change).
	const [inputValue, setInputValue] = React.useState<string>(() => centsToDisplay(amountCents, locale))
	const isFocusedRef = React.useRef(false)

	// Keep display in sync when amountCents (or the locale) changes externally (e.g. form reset,
	// controlled parent update, language switch) — but only when the field is not focused.
	React.useEffect(() => {
		if (!isFocusedRef.current) {
			setInputValue(centsToDisplay(amountCents, locale))
		}
	}, [amountCents, locale])

	function handleFocus() {
		isFocusedRef.current = true
	}

	function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		const raw = e.target.value
		// Allow digits, commas, dots and spaces while typing — strip everything
		// else so the field doesn't accept letters. We emit cents immediately so
		// parent state stays in sync, but we show the raw string to avoid
		// re-positioning the cursor.
		const sanitised = raw.replace(/[^\d.,\s]/g, '')
		setInputValue(sanitised)
		onAmountChange(displayToCents(sanitised))
	}

	function handleBlur() {
		isFocusedRef.current = false
		// Re-format to the canonical locale representation on blur
		setInputValue(centsToDisplay(amountCents, locale))
	}

	return (
		<InputGroup className={cn(className)} data-disabled={disabled || undefined} {...props}>
			<InputGroupAddon align="inline-start" className="p-0">
				{/*
				 * CurrencySelector keeps its own `trigger` surface (triggerBg/Border/Hover).
				 * We override only the rounding (left-only) and height so it fills the left
				 * segment flush. The right border acts as the divider between the two surfaces.
				 */}
				<CurrencySelector
					value={currency}
					onChange={onCurrencyChange}
					currencies={currencies}
					disabled={disabled}
					className="rounded-l-lg rounded-r-none h-full border-r border-border/40"
				/>
			</InputGroupAddon>

			<InputGroupInput
				id={id}
				inputMode="numeric"
				value={inputValue}
				onFocus={handleFocus}
				onChange={handleChange}
				onBlur={handleBlur}
				placeholder={placeholder ?? centsToDisplay(0, locale)}
				disabled={disabled}
				className="text-right rounded-r-lg"
			/>
		</InputGroup>
	)
}

export { CurrencyInput }
