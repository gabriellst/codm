import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { CurrencyCodeEnum } from '@codedm/client-typescript/typescript'
import type { CurrencyCodeEnumKey } from '@codedm/client-typescript/typescript'

import { ToggleGroup, ToggleGroupItem } from '../toggle-group'

const meta: Meta<typeof ToggleGroup> = {
	title: 'UI/ToggleGroup',
	component: ToggleGroup,
}

export default meta
type Story = StoryObj<typeof ToggleGroup>

export const Default: Story = {
	render: () => (
		<ToggleGroup variant="outline">
			<ToggleGroupItem value="a">Option A</ToggleGroupItem>
			<ToggleGroupItem value="b">Option B</ToggleGroupItem>
			<ToggleGroupItem value="c">Option C</ToggleGroupItem>
		</ToggleGroup>
	),
}

export const Enum: Story = {
	name: 'Enum mode (CurrencyCode)',
	render: () => {
		const [value, setValue] = React.useState<CurrencyCodeEnumKey | undefined>(undefined)
		return (
			<div className="flex flex-col gap-3">
				<ToggleGroup
					enum={CurrencyCodeEnum}
					i18nPrefix="enums.CurrencyCode"
					value={value}
					onValueChange={setValue}
				/>
				<p className="text-muted-foreground text-xs">Selected: {value ?? '—'}</p>
			</div>
		)
	},
}

export const EnumPreselected: Story = {
	name: 'Enum mode preselected',
	render: () => {
		const [value, setValue] = React.useState<CurrencyCodeEnumKey | undefined>(CurrencyCodeEnum.USD)
		return (
			<div className="flex flex-col gap-3">
				<ToggleGroup
					enum={CurrencyCodeEnum}
					i18nPrefix="enums.CurrencyCode"
					value={value}
					onValueChange={setValue}
				/>
				<p className="text-muted-foreground text-xs">Selected: {value ?? '—'}</p>
			</div>
		)
	},
}

export const EnumDisabled: Story = {
	name: 'Enum mode disabled',
	render: () => (
		<ToggleGroup
			enum={CurrencyCodeEnum}
			i18nPrefix="enums.CurrencyCode"
			value={CurrencyCodeEnum.EUR}
			onValueChange={() => {}}
			disabled
		/>
	),
}
