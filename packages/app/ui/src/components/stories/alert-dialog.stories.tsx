import type { Meta, StoryObj } from '@storybook/react'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '../alert-dialog'
import { Button } from '../button'
import { IconAlertTriangle, IconBuildingStore, IconSpeakerphone, IconTrash } from '@tabler/icons-react'

const meta: Meta<typeof AlertDialog> = {
	title: 'UI/AlertDialog',
	component: AlertDialog,
}

export default meta
type Story = StoryObj<typeof AlertDialog>

export const Default: Story = {
	render: () => (
		<AlertDialog>
			<AlertDialogTrigger render={<Button variant="destructive" />}>Delete Account</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently delete your account and remove your data from our servers.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive">Continue</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	),
}

export const Small: Story = {
	render: () => (
		<AlertDialog>
			<AlertDialogTrigger render={<Button variant="outline" />}>Open Small</AlertDialogTrigger>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>Delete item?</AlertDialogTitle>
					<AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive">Delete</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	),
}

export const WithMedia: Story = {
	render: () => (
		<AlertDialog>
			<AlertDialogTrigger render={<Button variant="destructive" />}>
				<IconTrash data-icon="inline-start" />
				Delete
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogMedia>
						<IconAlertTriangle />
					</AlertDialogMedia>
					<AlertDialogTitle>Delete Account</AlertDialogTitle>
					<AlertDialogDescription>
						This action cannot be undone. This will permanently delete your account and remove your data from our servers.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive">Delete Account</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	),
}

/** `cta` variant — footer actions render as large, full-width primary icon-buttons (side by side). */
export const Cta: Story = {
	render: () => (
		<AlertDialog defaultOpen>
			<AlertDialogTrigger render={<Button />}>Começar</AlertDialogTrigger>
			<AlertDialogContent variant="cta">
				<AlertDialogHeader>
					<AlertDialogTitle>Por onde quer começar?</AlertDialogTitle>
					<AlertDialogDescription>Escolha o que deseja configurar primeiro — você pode fazer o outro depois.</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogAction>
						<IconSpeakerphone data-icon="inline-start" />
						Configure seus Anúncios
					</AlertDialogAction>
					<AlertDialogAction>
						<IconBuildingStore data-icon="inline-start" />
						Configure sua Loja
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	),
}
