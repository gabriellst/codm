import { Combobox as ComboboxPrimitive } from '@base-ui/react'
import { useTranslation } from 'react-i18next'
import { IconChevronDown } from '@tabler/icons-react'
import type { CurrencyCodeEnumKey } from '@codedm/client-typescript/typescript'

import { cn } from '@/lib/utils'
import { trigger } from './surfaces'
import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from './combobox'

// ──────────────────────────────────────────────────────────────────────────────
// Currency → ISO-3166-1 alpha-2 country map (shortlist + common extras)
// ──────────────────────────────────────────────────────────────────────────────

const CURRENCY_COUNTRY_MAP: Partial<Record<CurrencyCodeEnumKey, string>> = {
	AED: 'AE',
	ARS: 'AR',
	AUD: 'AU',
	BDT: 'BD',
	BGN: 'BG',
	BHD: 'BH',
	BOB: 'BO',
	BRL: 'BR',
	BWP: 'BW',
	CAD: 'CA',
	CHF: 'CH',
	CLP: 'CL',
	CNY: 'CN',
	COP: 'CO',
	CZK: 'CZ',
	DKK: 'DK',
	DOP: 'DO',
	EGP: 'EG',
	EUR: 'EU',
	GBP: 'GB',
	GHS: 'GH',
	GTQ: 'GT',
	HKD: 'HK',
	HUF: 'HU',
	IDR: 'ID',
	INR: 'IN',
	ISK: 'IS',
	JPY: 'JP',
	KES: 'KE',
	KRW: 'KR',
	MAD: 'MA',
	MXN: 'MX',
	MYR: 'MY',
	NGN: 'NG',
	NOK: 'NO',
	NZD: 'NZ',
	PEN: 'PE',
	PHP: 'PH',
	PKR: 'PK',
	PLN: 'PL',
	QAR: 'QA',
	RON: 'RO',
	RUB: 'RU',
	SAR: 'SA',
	SEK: 'SE',
	SGD: 'SG',
	THB: 'TH',
	TRY: 'TR',
	TWD: 'TW',
	TZS: 'TZ',
	USD: 'US',
	VND: 'VN',
	ZAR: 'ZA',
} as const

/**
 * Converts a 2-letter ISO-3166 country code (or special "EU") to a flag emoji
 * using Unicode regional-indicator characters.
 *
 * "EU" → 🇪🇺 (valid emoji sequence via regional indicators E + U)
 */
function countryCodeToFlag(countryCode: string): string {
	const BASE = 0x1f1e6 // Regional Indicator Symbol Letter A
	const A = 'A'.codePointAt(0)!
	return [...countryCode.toUpperCase()].map(c => String.fromCodePoint(BASE + (c.codePointAt(0)! - A))).join('')
}

/**
 * Returns the flag emoji for a given currency code.
 * Falls back to '🌐' when the currency has no known country mapping.
 */
export function currencyFlag(code: CurrencyCodeEnumKey): string {
	const countryCode = CURRENCY_COUNTRY_MAP[code]
	if (!countryCode) return '🌐'
	return countryCodeToFlag(countryCode)
}

// ──────────────────────────────────────────────────────────────────────────────
// Default shortlist
// ──────────────────────────────────────────────────────────────────────────────

export const DEFAULT_CURRENCIES: CurrencyCodeEnumKey[] = ['USD', 'BRL', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN', 'ARS']

// ──────────────────────────────────────────────────────────────────────────────
// CurrencySelector
// ──────────────────────────────────────────────────────────────────────────────

export interface CurrencySelectorProps {
	value: CurrencyCodeEnumKey
	onChange: (currency: CurrencyCodeEnumKey) => void
	currencies?: CurrencyCodeEnumKey[]
	className?: string
	disabled?: boolean
}

/**
 * A searchable combobox showing flag + currency code + chevron, styled with
 * the interactive `trigger` surface.
 *
 * The user can type to filter by code. Designed to sit inside an InputGroup
 * as the leading addon — the trigger strips its own border when the parent
 * group provides the unified surface.
 */
function CurrencySelector({ value, onChange, currencies = DEFAULT_CURRENCIES, className, disabled = false }: CurrencySelectorProps) {
	const { t } = useTranslation()
	const items = currencies.map(code => ({
		value: code,
		// label is used by Base UI for filtering — flag + code makes both searchable
		label: `${currencyFlag(code)} ${code}`,
	}))

	return (
		<Combobox
			value={value}
			onValueChange={(v: string | null) => {
				if (v) onChange(v as CurrencyCodeEnumKey)
			}}
			items={items}
			disabled={disabled}
		>
			{/*
			 * Inline trigger: ComboboxPrimitive.Input hidden + Trigger visible.
			 * Composing directly (rather than via ComboboxSelectTrigger) lets us
			 * apply `trigger` surface ourselves and strip it via className override
			 * when nested inside an InputGroup.
			 */}
			<div className="relative flex items-center">
				{/* Hidden input — required by Base UI for Positioner anchoring */}
				<ComboboxPrimitive.Input className="absolute inset-0 opacity-0 pointer-events-none" tabIndex={-1} disabled={disabled} />
				<ComboboxPrimitive.Trigger
					disabled={disabled}
					className={cn(
						trigger,
						'cursor-pointer gap-1.5 rounded-lg py-2 pr-2 pl-2.5 text-sm select-none h-7',
						'flex w-fit items-center whitespace-nowrap outline-none',
						'disabled:cursor-not-allowed disabled:opacity-50',
						'[&_svg]:pointer-events-none [&_svg]:shrink-0',
						className,
					)}
				>
					<span className="text-base leading-none select-none" aria-hidden="true">
						{currencyFlag(value)}
					</span>
					<span className="text-foreground font-medium">{value}</span>
					<IconChevronDown className="text-muted-foreground size-3.5 pointer-events-none shrink-0" />
				</ComboboxPrimitive.Trigger>
			</div>

			<ComboboxContent align="start" sideOffset={6}>
				{/* Search input rendered inside the popup */}
				<ComboboxInput placeholder={t('common.searchCurrency')} showTrigger={false} showClear autoFocus />
				<ComboboxList>
					<ComboboxCollection>
						{(item: (typeof items)[number]) => (
							<ComboboxItem key={item.value} value={item.value}>
								<span className="text-base leading-none select-none" aria-hidden="true">
									{currencyFlag(item.value)}
								</span>
								<span>{item.value}</span>
							</ComboboxItem>
						)}
					</ComboboxCollection>
					<ComboboxEmpty>{t('common.noCurrencyFound')}</ComboboxEmpty>
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	)
}

export { CurrencySelector }
