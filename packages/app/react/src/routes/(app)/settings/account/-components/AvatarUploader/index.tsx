import { useState, useRef } from 'react'
import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { IconUpload } from '@tabler/icons-react'

import { Avatar, AvatarImage, AvatarFallback } from '@codm/app-ui/avatar'
import { Button } from '@codm/app-ui/button'
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

			<div className="flex flex-row items-center gap-2.5">
				<input
					ref={fileInputRef}
					type="file"
					accept="image/*"
					className="sr-only"
					aria-label={t('account.profile.avatar.uploadAriaLabel')}
					onChange={handleFileChange}
				/>
				<Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
					<IconUpload className="size-3.5" />
					{t('account.profile.avatar.upload')}
				</Button>
				{displayUrl ? (
					// D3 (jxl4Y) — measured plain muted text (pTGAx: no fill, no stroke, `#6a6a6a` label),
					// not the destructive red this used to carry. Removing a photo isn't a dangerous action
					// the way deleting the account is — the design keeps it visually quiet.
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="text-muted-foreground hover:text-muted-foreground"
						onClick={handleRemove}
					>
						{t('account.profile.avatar.remove')}
					</Button>
				) : null}
			</div>
		</div>
	)
}
