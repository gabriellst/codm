import type { Meta, StoryObj } from '@storybook/react'
import * as React from 'react'
import { NotificationCategoryEnum } from '@template/client-typescript/typescript'
import type { NotificationCategoryEnumKey } from '@template/client-typescript/typescript'

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
	name: 'Enum mode (NotificationCategory)',
	render: () => {
		const [value, setValue] = React.useState<NotificationCategoryEnumKey | undefined>(undefined)
		return (
			<div className="flex flex-col gap-3">
				<ToggleGroup
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

export const EnumPreselected: Story = {
	name: 'Enum mode preselected',
	render: () => {
		const [value, setValue] = React.useState<NotificationCategoryEnumKey | undefined>(NotificationCategoryEnum.ORDER_RECEIVED)
		return (
			<div className="flex flex-col gap-3">
				<ToggleGroup
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

export const EnumDisabled: Story = {
	name: 'Enum mode disabled',
	render: () => (
		<ToggleGroup
			enum={NotificationCategoryEnum}
			i18nPrefix="enums.NotificationCategory"
			value={NotificationCategoryEnum.INVITATION}
			onValueChange={() => {}}
			disabled
		/>
	),
}
