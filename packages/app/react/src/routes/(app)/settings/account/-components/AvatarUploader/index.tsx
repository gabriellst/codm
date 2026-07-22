import { useState, useRef } from 'react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconUpload, IconTrash } from '@tabler/icons-react'

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AvatarUploaderProps extends Omit<ComponentProps<'div'>, 'onChange'> {
	/** Current picture URL (from profile). */
	value: string | null
	/** Called with the selected File when user picks an image. */
	onUpload: (file: File) => void
	/** Called when user removes the current picture. */
	onRemove: () => void
	/** Initials to show when there is no image (e.g. "JD"). */
	fallbackInitials: string
}

/**
 * AvatarUploader — Avatar + upload/remove buttons.
 * Displays a local preview immediately after file selection (before the actual upload).
 * Leaf component — receives value, onUpload, onRemove, fallbackInitials as props.
 */
export function AvatarUploader({ value, onUpload, onRemove, fallbackInitials, className, ...props }: AvatarUploaderProps) {
	const { t } = useTranslation()
	const [previewUrl, setPreviewUrl] = useState<string | null>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)

	const displayUrl = previewUrl ?? value

	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0]
		if (!file) return
		const objectUrl = URL.createObjectURL(file)
		setPreviewUrl(objectUrl)
		onUpload(file)
	}

	function handleRemove() {
		setPreviewUrl(null)
		if (fileInputRef.current) fileInputRef.current.value = ''
		onRemove()
	}

	return (
		<div className={cn('flex items-center gap-4', className)} {...props}>
			<Avatar size="lg" className="size-16">
				{displayUrl ? <AvatarImage src={displayUrl} alt={fallbackInitials} /> : null}
				<AvatarFallback className="text-base">{fallbackInitials}</AvatarFallback>
			</Avatar>

			<div className="flex flex-col gap-2">
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					className="sr-only"
					aria-label={t('account.profile.avatar.uploadAriaLabel')}
					onChange={handleFileChange}
				/>
				<Button type="button" variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
					<IconUpload className="size-3.5" />
					{t('account.profile.avatar.upload')}
				</Button>
				{displayUrl ? (
					<Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleRemove}>
						<IconTrash className="size-3.5" />
						{t('account.profile.avatar.remove')}
					</Button>
				) : null}
			</div>
		</div>
	)
}
