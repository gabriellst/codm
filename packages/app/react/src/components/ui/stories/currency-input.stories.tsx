import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { CurrencyInput } from '../currency-input'
import type { CurrencyCodeEnumKey } from '@codm/client-typescript/typescript'

const meta: Meta<typeof CurrencyInput> = {
	title: 'UI/CurrencyInput',
	component: CurrencyInput,
}

export default meta
type Story = StoryObj<typeof CurrencyInput>

export const Default: Story = {
	render: () => {
		const [amountCents, setAmountCents] = React.useState(0)
		const [currency, setCurrency] = React.useState<CurrencyCodeEnumKey>('USD')
		return (
			<div className="w-full max-w-xs">
				<CurrencyInput
					amountCents={amountCents}
					currency={currency}
					onAmountChange={setAmountCents}
					onCurrencyChange={setCurrency}
					placeholder="0,00"
				/>
				<p className="text-muted-foreground mt-2 text-xs">
					{currency} · {amountCents} cents · {(amountCents / 100).toFixed(2)}
				</p>
			</div>
		)
	},
}

export const Filled: Story = {
	render: () => {
		const [amountCents, setAmountCents] = React.useState(123456)
		const [currency, setCurrency] = React.useState<CurrencyCodeEnumKey>('BRL')
		return (
			<div className="w-full max-w-xs">
				<CurrencyInput amountCents={amountCents} currency={currency} onAmountChange={setAmountCents} onCurrencyChange={setCurrency} />
				<p className="text-muted-foreground mt-2 text-xs">
					{currency} · {amountCents} cents · {(amountCents / 100).toFixed(2)}
				</p>
			</div>
		)
	},
}

export const Disabled: Story = {
	render: () => (
		<div className="w-full max-w-xs">
			<CurrencyInput amountCents={9999} currency="EUR" onAmountChange={() => {}} onCurrencyChange={() => {}} disabled />
		</div>
	),
}

export const AllVariants: Story = {
	render: () => {
		const [usdCents, setUsdCents] = React.useState(0)
		const [usdCurrency, setUsdCurrency] = React.useState<CurrencyCodeEnumKey>('USD')
		const [brlCents, setBrlCents] = React.useState(123456)
		const [brlCurrency, setBrlCurrency] = React.useState<CurrencyCodeEnumKey>('BRL')

		return (
			<div className="flex flex-col gap-4 w-full max-w-xs">
				<CurrencyInput
					amountCents={usdCents}
					currency={usdCurrency}
					onAmountChange={setUsdCents}
					onCurrencyChange={setUsdCurrency}
					placeholder="0,00"
				/>
				<CurrencyInput amountCents={brlCents} currency={brlCurrency} onAmountChange={setBrlCents} onCurrencyChange={setBrlCurrency} />
				<CurrencyInput amountCents={9999} currency="EUR" onAmountChange={() => {}} onCurrencyChange={() => {}} disabled />
			</div>
		)
	},
}
