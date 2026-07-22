// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-expo-form-state-subscribe
// task:        synthetic-expo-form-state-subscribe
// stamp:       expo-formsub-iter7
// docTreeHash: 46468161d9ca
// model:       sonnet
// graded:      2026-06-12T17:35:14.911Z
// source:      packages/app/expo/app/(sheets)/kit-form/-components/KitItemList/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
// packages/app/expo/app/(sheets)/kit-form/-components/KitItemList/index.tsx
//
// Renders the list of committed kit items. The FlatList data is derived from
// `form.Subscribe` on `items` — the list itself re-renders only when items
// change, not when editor fields (editorQuantity, editorProductId, etc.)
// change. The empty-state CTA opens the product picker.

import { FlatList, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ListProductsForKit200 } from '@template/client-typescript/typescript'
import type { KitForm } from '../../-types'
import { KitItemRow } from '../KitItemRow'

type Product = ListProductsForKit200['items'][number]

interface KitItemListProps {
	form: KitForm
	productsById: Map<string, Product>
	onOpenPicker: () => void
}

export function KitItemList({ form, productsById, onOpenPicker }: KitItemListProps) {
	const { t } = useTranslation()

	return (
		<form.Subscribe selector={s => s.values.items ?? []}>
			{items => {
				if (items.length === 0) {
					return (
						<View className="items-center py-6 gap-3">
							<Text className="text-foreground font-sans-semi text-sm">
								{t('kitForm.fields.items.emptyTitle')}
							</Text>
							<Text className="text-foreground-subtle font-sans text-sm text-center px-6">
								{t('kitForm.fields.items.emptyBody')}
							</Text>
							<Pressable
								onPress={onOpenPicker}
								accessibilityRole="button"
								className="mt-1 px-4 py-2 border border-border rounded-pill"
							>
								<Text className="text-foreground font-sans-semi text-sm">
									{t('kitForm.fields.items.addCta')}
								</Text>
							</Pressable>
						</View>
					)
				}

				return (
					<FlatList
						data={items}
						scrollEnabled={false}
						keyExtractor={(_, i) => String(i)}
						contentContainerStyle={{ gap: 8 }}
						renderItem={({ item, index }) => {
							const product = productsById.get(item.productId ?? '')
							const productName = product?.name ?? item.productId ?? ''
							return (
								<KitItemRow
									form={form}
									item={item as { productId: string; quantity: number; quantityModifier: import('@template/client-typescript/typescript').QuantityModifier }}
									index={index}
									productName={productName}
								/>
							)
						}}
					/>
				)
			}}
		</form.Subscribe>
	)
}
