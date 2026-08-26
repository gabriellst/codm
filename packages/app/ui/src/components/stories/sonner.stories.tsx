import type { Meta, StoryObj } from '@storybook/react'
import { Toaster } from '../sonner'
import { Button } from '../button'
import { toast } from 'sonner'

const meta: Meta<typeof Toaster> = {
	title: 'UI/Sonner',
	component: Toaster,
}

export default meta
type Story = StoryObj<typeof Toaster>

export const Default: Story = {
	render: () => (
		<>
			<Toaster />
			<div className="flex flex-col gap-4">
				<Button onClick={() => toast('Event has been created')}>Show Toast</Button>
				<Button onClick={() => toast.success('Event has been created')}>Success</Button>
				<Button onClick={() => toast.error('Event has been deleted')}>Error</Button>
				<Button onClick={() => toast.info('New update available')}>Info</Button>
				<Button onClick={() => toast.warning('Please check your input')}>Warning</Button>
				<Button
					onClick={() =>
						toast('Event has been created', {
							description: 'Monday, January 3rd at 6:00pm',
						})
					}
				>
					With Description
				</Button>
				<Button
					onClick={() =>
						toast('Event has been created', {
							description: 'Monday, January 3rd at 6:00pm',
							action: {
								label: 'Undo',
								onClick: () => console.log('Undo'),
							},
						})
					}
				>
					With Action
				</Button>
			</div>
		</>
	),
}
