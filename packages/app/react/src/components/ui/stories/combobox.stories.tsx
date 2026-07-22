import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { NotificationCategoryEnum } from '@template/client-typescript/typescript'
import type { NotificationCategoryEnumKey } from '@template/client-typescript/typescript'
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '../combobox'

const meta: Meta<typeof Combobox> = {
	title: 'UI/Combobox',
	component: Combobox,
}

export default meta
type Story = StoryObj<typeof Combobox>

const frameworks = ['Next.js', 'SvelteKit', 'Nuxt.js', 'Remix', 'Astro', 'Vite', 'Webpack'] as const

export const Default: Story = {
	render: () => (
		<div className="w-full max-w-sm">
			<Combobox items={frameworks}>
				<ComboboxInput placeholder="Select a framework" />
				<ComboboxContent>
					<ComboboxEmpty>No frameworks found.</ComboboxEmpty>
					<ComboboxList>
						{item => (
							<ComboboxItem key={item} value={item}>
								{item}
							</ComboboxItem>
						)}
					</ComboboxList>
				</ComboboxContent>
			</Combobox>
		</div>
	),
}

export const WithClear: Story = {
	render: () => (
		<div className="w-full max-w-sm">
			<Combobox items={frameworks}>
				<ComboboxInput placeholder="Select a framework" showClear />
				<ComboboxContent>
					<ComboboxEmpty>No frameworks found.</ComboboxEmpty>
					<ComboboxList>
						{item => (
							<ComboboxItem key={item} value={item}>
								{item}
							</ComboboxItem>
						)}
					</ComboboxList>
				</ComboboxContent>
			</Combobox>
		</div>
	),
}

export const Disabled: Story = {
	render: () => (
		<div className="w-full max-w-sm">
			<Combobox items={frameworks}>
				<ComboboxInput placeholder="Select a framework" disabled />
				<ComboboxContent>
					<ComboboxEmpty>No frameworks found.</ComboboxEmpty>
					<ComboboxList>
						{item => (
							<ComboboxItem key={item} value={item}>
								{item}
							</ComboboxItem>
						)}
					</ComboboxList>
				</ComboboxContent>
			</Combobox>
		</div>
	),
}

export const Enum: Story = {
	name: 'Enum mode (NotificationCategory)',
	render: () => {
		const [value, setValue] = React.useState<NotificationCategoryEnumKey | undefined>(undefined)
		return (
			<div className="flex flex-col gap-3 w-64">
				<Combobox
					enum={NotificationCategoryEnum}
					i18nPrefix="enums.NotificationCategory"
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
		const [value, setValue] = React.useState<NotificationCategoryEnumKey | undefined>(NotificationCategoryEnum.ORDER_RECEIVED)
		return (
			<div className="flex flex-col gap-3 w-64">
				<Combobox
					enum={NotificationCategoryEnum}
					i18nPrefix="enums.NotificationCategory"
					value={value}
					onValueChange={setValue}
				/>
				<p className="text-muted-foreground text-xs">Selected: {value ?? '—'}</p>
			</div>
		)
	},
}
