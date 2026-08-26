import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from '../dropdown-menu'
import { Button } from '../button'
import { IconUser, IconSettings, IconLogout } from '@tabler/icons-react'

const meta: Meta<typeof DropdownMenu> = {
	title: 'UI/DropdownMenu',
	component: DropdownMenu,
}

export default meta
type Story = StoryObj<typeof DropdownMenu>

export const Default: Story = {
	render: () => (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" />}>Open Menu</DropdownMenuTrigger>
			<DropdownMenuContent>
				<DropdownMenuGroup>
					<DropdownMenuLabel>My Account</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem>
						<IconUser />
						Profile
					</DropdownMenuItem>
					<DropdownMenuItem>
						<IconSettings />
						Settings
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem>
						<IconLogout />
						Logout
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	),
}

export const WithShortcuts: Story = {
	render: () => (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" />}>Open Menu</DropdownMenuTrigger>
			<DropdownMenuContent>
				<DropdownMenuGroup>
					<DropdownMenuItem>
						New File
						<DropdownMenuShortcut>⌘N</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuItem>
						New Folder
						<DropdownMenuShortcut>⇧⌘N</DropdownMenuShortcut>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem>
						Save
						<DropdownMenuShortcut>⌘S</DropdownMenuShortcut>
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	),
}

export const WithCheckboxes: Story = {
	render: () => {
		const [showStatusBar, setShowStatusBar] = React.useState(true)
		const [showActivityBar, setShowActivityBar] = React.useState(false)

		return (
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button variant="outline" />}>View Options</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuGroup>
						<DropdownMenuLabel>Appearance</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuCheckboxItem checked={showStatusBar} onCheckedChange={setShowStatusBar}>
							Status Bar
						</DropdownMenuCheckboxItem>
						<DropdownMenuCheckboxItem checked={showActivityBar} onCheckedChange={setShowActivityBar}>
							Activity Bar
						</DropdownMenuCheckboxItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		)
	},
}

export const WithRadioGroup: Story = {
	render: () => {
		const [position, setPosition] = React.useState('bottom')

		return (
			<DropdownMenu>
				<DropdownMenuTrigger render={<Button variant="outline" />}>Position</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuGroup>
						<DropdownMenuLabel>Panel Position</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuRadioGroup value={position} onValueChange={setPosition}>
							<DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="bottom">Bottom</DropdownMenuRadioItem>
							<DropdownMenuRadioItem value="right">Right</DropdownMenuRadioItem>
						</DropdownMenuRadioGroup>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		)
	},
}

export const WithSubmenu: Story = {
	render: () => (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" />}>Open Menu</DropdownMenuTrigger>
			<DropdownMenuContent>
				<DropdownMenuGroup>
					<DropdownMenuItem>New Tab</DropdownMenuItem>
					<DropdownMenuItem>New Window</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuSub>
						<DropdownMenuSubTrigger>More Tools</DropdownMenuSubTrigger>
						<DropdownMenuPortal>
							<DropdownMenuSubContent>
								<DropdownMenuGroup>
									<DropdownMenuItem>Save Page As...</DropdownMenuItem>
									<DropdownMenuItem>Create Shortcut...</DropdownMenuItem>
									<DropdownMenuItem>Name Window...</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem>Developer Tools</DropdownMenuItem>
								</DropdownMenuGroup>
							</DropdownMenuSubContent>
						</DropdownMenuPortal>
					</DropdownMenuSub>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	),
}
