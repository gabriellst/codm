import type { Meta, StoryObj } from '@storybook/react'
import { type ComponentProps, useState } from 'react'

import { SteerComposer } from '../steer-composer'

/** Holds the draft locally so the controlled field is typeable in the Storybook browser. */
function Controlled({ value: initial, onValueChange, ...props }: ComponentProps<typeof SteerComposer>) {
	const [value, setValue] = useState(initial)
	return (
		<SteerComposer
			{...props}
			value={value}
			onValueChange={next => {
				setValue(next)
				onValueChange(next)
			}}
		/>
	)
}

const meta: Meta<typeof SteerComposer> = {
	title: 'UI/SteerComposer',
	component: SteerComposer,
	parameters: { layout: 'padded' },
	decorators: [
		Story => (
			<div className="w-[560px]">
				<Story />
			</div>
		),
	],
	args: {
		value: '',
		onValueChange: () => {},
		onSubmit: () => {},
		placeholder: 'Oriente esta tarefa...',
		hint: 'Chega só ao agente desta tarefa — o grupo não vê.',
		sendLabel: 'Enviar orientação',
	},
	render: args => <Controlled {...args} />,
}

export default meta
type Story = StoryObj<typeof SteerComposer>

export const Empty: Story = {}

export const Filled: Story = { args: { value: 'não mexe no checkout do desktop, só no mobile' } }

export const Pending: Story = { args: { value: 'não mexe no checkout do desktop, só no mobile', pending: true } }
