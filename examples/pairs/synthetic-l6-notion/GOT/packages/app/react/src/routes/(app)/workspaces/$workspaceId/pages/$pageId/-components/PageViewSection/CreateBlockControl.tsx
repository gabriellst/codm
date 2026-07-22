import { useState, type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
	useAddBlock,
	addBlockMutationRequestSchema,
	getPageViewQueryKey,
	BlockTypeEnum,
	type BlockType,
} from '@template/client-typescript/typescript'
import { cn } from '@/lib/utils'
import { isEnumValue } from '@/lib/enums'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

interface CreateBlockControlProps extends ComponentProps<'form'> {
	pageId: string
	parentBlockId: string | null
}

export function CreateBlockControl({ pageId, parentBlockId, className, ...props }: CreateBlockControlProps) {
	const { t } = useTranslation()
	const queryClient = useQueryClient()

	const [type, setType] = useState<BlockType>(BlockTypeEnum.TEXT)
	const [content, setContent] = useState('')

	const addBlock = useAddBlock({
		mutation: {
			onSuccess: () => {
				setContent('')
				queryClient.invalidateQueries({ queryKey: getPageViewQueryKey(pageId) })
			},
		},
	})

	const canSubmit =
		content.trim().length > 0 &&
		addBlockMutationRequestSchema.safeParse({ type, content, parentBlockId }).success

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		if (!canSubmit || addBlock.isPending) return
		await addBlock.mutateAsync({ pageId, data: { type, content, parentBlockId } })
	}

	return (
		<form
			onSubmit={handleSubmit}
			className={cn('flex items-center gap-2 mt-1', className)}
			aria-label={t('page.addBlockFormAriaLabel')}
			{...props}
		>
			<Select
				enum={BlockTypeEnum}
				i18nPrefix="enums.BlockType"
				value={type}
				onValueChange={v => {
					if (isEnumValue(BlockTypeEnum, v)) setType(v)
				}}
				aria-label={t('page.blockTypeSelectorAriaLabel')}
			/>
			<Input
				value={content}
				onChange={e => setContent(e.target.value)}
				placeholder={t('page.blockContentPlaceholder')}
				aria-label={t('page.blockContentAriaLabel')}
				className="flex-1"
			/>
			<Button type="submit" disabled={!canSubmit || addBlock.isPending}>
				{addBlock.isPending ? <Spinner className="size-4" /> : null}
				{t('page.addBlockButton')}
			</Button>
		</form>
	)
}
