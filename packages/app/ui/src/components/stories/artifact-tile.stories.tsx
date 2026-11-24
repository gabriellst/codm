import type { Meta, StoryObj } from '@storybook/react'
import { IconFileDiff, IconLink, IconPhoto } from '@tabler/icons-react'

import { ArtifactChip, ArtifactTile } from '../artifact-tile'

const meta: Meta<typeof ArtifactTile> = {
	title: 'UI/ArtifactTile',
	component: ArtifactTile,
	parameters: { layout: 'padded' },
	decorators: [
		Story => (
			<div className="w-[160px]">
				<Story />
			</div>
		),
	],
	argTypes: {
		tone: { control: 'inline-radio', options: ['link', 'default'] },
	},
}

export default meta
type Story = StoryObj<typeof ArtifactTile>

export const LinkTile: Story = {
	args: {
		tone: 'link',
		glyph: <IconLink />,
		name: 'Prévia — fix/cupom-se',
		kind: 'Link',
		when: '10:31',
		render: <a href="#preview" />,
	},
}

export const ImageTile: Story = {
	args: {
		tone: 'default',
		glyph: <IconPhoto />,
		name: 'cupom-iphone-se.png',
		kind: 'Imagem',
		when: '10:28',
	},
}

export const FileTile: Story = {
	args: {
		tone: 'default',
		glyph: <IconFileDiff />,
		name: 'fix-cupom-se.diff',
		kind: 'Arquivo',
		when: '10:30',
		render: <button type="button" />,
	},
}

export const Grid: Story = {
	decorators: [
		Story => (
			<div className="w-[340px]">
				<Story />
			</div>
		),
	],
	render: () => (
		<div className="grid grid-cols-2 gap-3">
			<ArtifactTile tone="link" glyph={<IconLink />} name="Prévia — fix/cupom-se" kind="Link" when="10:31" />
			<ArtifactTile glyph={<IconPhoto />} name="cupom-iphone-se.png" kind="Imagem" when="10:28" />
			<ArtifactTile glyph={<IconFileDiff />} name="fix-cupom-se.diff" kind="Arquivo" when="10:30" />
		</div>
	),
}

export const Chip: Story = {
	decorators: [
		Story => (
			<div className="w-[300px]">
				<Story />
			</div>
		),
	],
	render: () => (
		<ArtifactChip glyph={<IconLink />} name="Prévia — fix/cupom-se" detail="link · enviado ao grupo" render={<a href="#preview" />} />
	),
}

export const ChipWithoutOpen: Story = {
	decorators: [
		Story => (
			<div className="w-[300px]">
				<Story />
			</div>
		),
	],
	render: () => <ArtifactChip glyph={<IconPhoto />} name="cupom-iphone-se.png" detail="imagem · 10:28" trailing={null} />,
}
