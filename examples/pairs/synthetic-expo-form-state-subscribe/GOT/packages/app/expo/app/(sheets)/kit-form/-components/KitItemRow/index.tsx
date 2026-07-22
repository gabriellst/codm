// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-expo-form-state-subscribe
// task:        synthetic-expo-form-state-subscribe
// stamp:       expo-formsub-iter7
// docTreeHash: 46468161d9ca
// model:       sonnet
// graded:      2026-06-12T17:35:14.911Z
// source:      packages/app/expo/app/(sheets)/kit-form/-components/KitItemRow/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
// packages/app/expo/app/(sheets)/kit-form/-components/KitItemRow/index.tsx
//
// The 3-mode discriminant selector keeps list rows stable while the editor
// fields are changing. Returning a number (not an object) means TanStack
// Form's structural-equality check only triggers a re-render when the
// editing mode changes — typing in the editor does NOT re-render list rows.
//
//   0 → idle (no row is being edited)
//   1 → this row is the one being edited (highlight)
//   2 → another row is being edited (dim)

import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
	QuantityModifierEnum,
	type CreateKitMutationRequest,
} from '@codedm/client-typescript/typescript'
import type { KitForm } from '../../-types'

type KitItem = CreateKitMutationRequest['items'][number]

interface KitItemRowProps {
	form: KitForm
	item: KitItem
	index: number
	productName: string
}

export function KitItemRow({ form, item, index, productName }: KitItemRowProps) {
	const { t } = useTranslation()

	// Batch-load editor fields + set editingSelection in one React 18 commit.
	const handleSelect = () => {
		form.setFieldValue('editingSelection', { index })
		form.setFieldValue('editorProductId', item.productId)
		form.setFieldValue('editorQuantity', item.quantity)
		form.setFieldValue('editorQuantityModifier', item.quantityModifier)
	}

	return (
		<form.Subscribe
			selector={s => {
				const sel = s.values.editingSelection
				if (sel == null) return 0 as const
				return sel.index === index ? (1 as const) : (2 as const)
			}}
		>
			{mode => {
				const isSelected = mode === 1
				const isOtherEditing = mode === 2

				return (
					<Pressable
						onPress={handleSelect}
						accessibilityRole="button"
						accessibilityLabel={productName}
						className={[
							'flex-row items-center gap-3 py-3 px-3.5 border rounded-lg',
							isOtherEditing ? 'opacity-40' : '',
							isSelected
								? 'bg-muted border-border-strong'
								: 'bg-card/30 border-border',
						].join(' ')}
					>
						<View className="flex-1">
							<Text className="text-foreground font-sans-semi text-sm" numberOfLines={1}>
								{productName}
							</Text>
							<Text className="text-foreground-subtle font-sans text-xs mt-0.5">
								{t(`enums.QuantityModifier.${item.quantityModifier}`)} {item.quantity}
							</Text>
						</View>
						{isSelected ? (
							<Text className="text-foreground-subtle font-sans-semi text-xs uppercase">
								{t('kitForm.fields.editor.saveItem')}
							</Text>
						) : null}
					</Pressable>
				)
			}}
		</form.Subscribe>
	)
}
