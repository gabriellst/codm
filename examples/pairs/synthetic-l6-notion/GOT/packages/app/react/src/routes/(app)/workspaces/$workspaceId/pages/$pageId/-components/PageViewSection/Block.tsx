import { useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { BlockTypeEnum, type PageViewBlockNode } from '@codedm/client-typescript/typescript'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

import { CreateBlockControl } from './CreateBlockControl'

interface BlockProps extends ComponentProps<'div'> {
	block: PageViewBlockNode
	pageId: string
}

function TextBlock({ block }: { block: PageViewBlockNode }) {
	return <p className="text-sm text-foreground leading-relaxed">{block.content}</p>
}

function HeadingBlock({ block }: { block: PageViewBlockNode }) {
	return <h2 className="text-lg font-semibold text-foreground">{block.content}</h2>
}

function ToggleBlock({ block, pageId }: { block: PageViewBlockNode; pageId: string }) {
	const { t } = useTranslation()
	const [open, setOpen] = useState(false)

	return (
		<div className="flex flex-col gap-1">
			<Button
				type="button"
				variant="ghost"
				className="justify-start gap-2 px-0 h-auto text-sm font-medium text-foreground"
				aria-label={t('page.toggleAriaLabel', { content: block.content })}
				aria-expanded={open}
				onClick={() => setOpen(prev => !prev)}
			>
				{open ? (
					<IconChevronDown className="size-4 text-muted-foreground" />
				) : (
					<IconChevronRight className="size-4 text-muted-foreground" />
				)}
				{block.content}
			</Button>
			{open && (
				<div className="ml-4 flex flex-col gap-2">
					{block.children.map(child => (
						<Block key={child.id} block={child} pageId={pageId} />
					))}
					<CreateBlockControl pageId={pageId} parentBlockId={block.id} />
				</div>
			)}
		</div>
	)
}

const BLOCK_RENDERERS: Record<
	(typeof BlockTypeEnum)[keyof typeof BlockTypeEnum],
	(props: { block: PageViewBlockNode; pageId: string }) => React.ReactElement
> = {
	[BlockTypeEnum.TEXT]: ({ block }) => <TextBlock block={block} />,
	[BlockTypeEnum.HEADING]: ({ block }) => <HeadingBlock block={block} />,
	[BlockTypeEnum.TOGGLE]: ({ block, pageId }) => <ToggleBlock block={block} pageId={pageId} />,
}

export function Block({ block, pageId, className, ...props }: BlockProps) {
	const Renderer = BLOCK_RENDERERS[block.type]
	return (
		<div role="listitem" className={cn(className)} {...props}>
			<Renderer block={block} pageId={pageId} />
		</div>
	)
}
