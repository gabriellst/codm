import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { CurrencySelector } from '../currency-selector'
import type { CurrencyCodeEnumKey } from '@codm/client-typescript/typescript'

const meta: Meta<typeof CurrencySelector> = {
	title: 'UI/CurrencySelector',
	component: CurrencySelector,
	argTypes: {
		value: {
			control: 'select',
			options: ['USD', 'BRL', 'EUR', 'GBP', 'CAD', 'AUD', 'MXN', 'ARS'],
		},
		disabled: {
			control: 'boolean',
		},
	},
	args: {
		value: 'USD',
		disabled: false,
	},
}

export default meta
type Story = StoryObj<typeof CurrencySelector>

export const Default: Story = {
	render: args => {
		const [value, setValue] = React.useState<CurrencyCodeEnumKey>(args.value ?? 'USD')
		return (
			<CurrencySelector
				{...args}
				value={value}
				onChange={v => {
					setValue(v)
					args.onChange?.(v)
				}}
			/>
		)
	},
}

export const BRL: Story = {
	render: () => {
		const [value, setValue] = React.useState<CurrencyCodeEnumKey>('BRL')
		return <CurrencySelector value={value} onChange={setValue} />
	},
}

export const EUR: Story = {
	render: () => {
		const [value, setValue] = React.useState<CurrencyCodeEnumKey>('EUR')
		return <CurrencySelector value={value} onChange={setValue} />
	},
}

export const Disabled: Story = {
	render: () => <CurrencySelector value="USD" onChange={() => {}} disabled />,
}

export const CustomList: Story = {
	render: () => {
		const [value, setValue] = React.useState<CurrencyCodeEnumKey>('EUR')
		return <CurrencySelector value={value} onChange={setValue} currencies={['EUR', 'GBP', 'CHF', 'NOK', 'SEK', 'DKK', 'PLN']} />
	},
}
