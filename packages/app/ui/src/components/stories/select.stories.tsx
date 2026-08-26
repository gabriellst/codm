import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { CurrencyCodeEnum } from '@codm/client-typescript/typescript'
import type { CurrencyCodeEnumKey } from '@codm/client-typescript/typescript'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '../select'

const meta: Meta<typeof Select> = {
	title: 'UI/Select',
	component: Select,
}

export default meta
type Story = StoryObj<typeof Select>

const items = [
	{ label: 'Apple', value: 'apple' },
	{ label: 'Banana', value: 'banana' },
	{ label: 'Orange', value: 'orange' },
	{ label: 'Grape', value: 'grape' },
	{ label: 'Strawberry', value: 'strawberry' },
]

export const Default: Story = {
	render: () => (
		<Select items={items} defaultValue={null}>
			<SelectTrigger>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{items.map(item => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	),
}

export const WithDefaultValue: Story = {
	render: () => (
		<Select items={items} defaultValue="banana">
			<SelectTrigger>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{items.map(item => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	),
}

export const WithGroups: Story = {
	render: () => (
		<Select items={items} defaultValue={null}>
			<SelectTrigger>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					<SelectLabel>Fruits</SelectLabel>
					<SelectItem value="apple">Apple</SelectItem>
					<SelectItem value="banana">Banana</SelectItem>
					<SelectItem value="orange">Orange</SelectItem>
				</SelectGroup>
				<SelectGroup>
					<SelectLabel>Berries</SelectLabel>
					<SelectItem value="grape">Grape</SelectItem>
					<SelectItem value="strawberry">Strawberry</SelectItem>
				</SelectGroup>
			</SelectContent>
		</Select>
	),
}

export const Small: Story = {
	render: () => (
		<Select items={items} defaultValue={null}>
			<SelectTrigger size="sm">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{items.map(item => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	),
}

export const Disabled: Story = {
	render: () => (
		<Select items={items} defaultValue={null} disabled>
			<SelectTrigger>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectGroup>
					{items.map(item => (
						<SelectItem key={item.value} value={item.value}>
							{item.label}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	),
}

export const Enum: Story = {
	name: 'Enum mode (CurrencyCode)',
	render: () => {
		const [value, setValue] = React.useState<CurrencyCodeEnumKey | undefined>(undefined)
		return (
			<div className="flex flex-col gap-3 w-64">
				<Select
					enum={CurrencyCodeEnum}
					i18nPrefix="enums.CurrencyCode"
					value={value}
					onValueChange={setValue}
					placeholder="Select a category"
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
			<div className="flex flex-col gap-3 w-64">
				<Select enum={CurrencyCodeEnum} i18nPrefix="enums.CurrencyCode" value={value} onValueChange={setValue} />
				<p className="text-muted-foreground text-xs">Selected: {value ?? '—'}</p>
			</div>
		)
	},
}

export const EnumInvalid: Story = {
	name: 'Enum mode aria-invalid',
	render: () => {
		const [value, setValue] = React.useState<CurrencyCodeEnumKey | undefined>(undefined)
		return (
			<div className="w-64">
				<Select
					enum={CurrencyCodeEnum}
					i18nPrefix="enums.CurrencyCode"
					value={value}
					onValueChange={setValue}
					placeholder="Select a category"
					aria-invalid
				/>
			</div>
		)
	},
}
