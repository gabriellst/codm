// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-expo-form-state-subscribe
// task:        synthetic-expo-form-state-subscribe
// stamp:       expo-formsub-iter7
// docTreeHash: 46468161d9ca
// model:       sonnet
// graded:      2026-06-12T17:35:14.911Z
// source:      packages/app/expo/app/(sheets)/kit-form/-components/ProductPicker/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
// packages/app/expo/app/(sheets)/kit-form/-components/ProductPicker/index.tsx
//
// In-page overlay for picking a product to add to the kit. Does NOT change
// the URL — visibility is tracked by the kit-form store in the parent sheet.
// The overlay is rendered inside a Modal so it sits above the sheet content;
// it is destroyed when the sheet unmounts so its open state never persists.

import { FlatList, Modal, Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
	useListProductsForKit,
	type ListProductsForKit200,
} from '@codedm/client-typescript/typescript'
import { formatMoney } from '@/lib/format'
import { fg, surfaces } from '@/lib/tokens'
import { IconClose } from '@/components/ui/Icons'

type Product = ListProductsForKit200['items'][number]

interface ProductPickerProps {
	visible: boolean
	onClose: () => void
	onSelect: (product: Product) => void
}

export function ProductPicker({ visible, onClose, onSelect }: ProductPickerProps) {
	const { t } = useTranslation()
	const { data, isLoading } = useListProductsForKit()

	const items = data?.items ?? []

	return (
		<Modal
			visible={visible}
			transparent
			animationType="slide"
			onRequestClose={onClose}
		>
			<Pressable
				style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}
				onPress={onClose}
			/>
			<View
				style={{
					backgroundColor: surfaces.surface1,
					borderTopLeftRadius: 20,
					borderTopRightRadius: 20,
					maxHeight: '70%',
				}}
			>
				<View className="flex-row items-center justify-between px-5 pt-4 pb-3">
					<Text className="text-foreground font-sans-bold text-base">
						{t('kitForm.picker.title')}
					</Text>
					<Pressable
						onPress={onClose}
						accessibilityRole="button"
						accessibilityLabel={t('common.close')}
						hitSlop={12}
					>
						<IconClose size={20} color={fg.fg1} />
					</Pressable>
				</View>

				{isLoading ? (
					<View className="items-center py-8">
						<Text className="text-foreground-subtle font-sans text-sm">{t('common.loading')}</Text>
					</View>
				) : (
					<FlatList
						data={items}
						keyExtractor={item => item.id}
						contentContainerStyle={{ paddingBottom: 32 }}
						renderItem={({ item }) => (
							<ProductRow product={item} onSelect={onSelect} />
						)}
						ItemSeparatorComponent={() => (
							<View className="h-px bg-border mx-5" />
						)}
					/>
				)}
			</View>
		</Modal>
	)
}

function ProductRow({
	product,
	onSelect,
}: {
	product: Product
	onSelect: (product: Product) => void
}) {
	const { t } = useTranslation()
	const cost = product.currentCost
	const formattedCost = formatMoney(cost.amountCents / 100, cost.currency)

	return (
		<Pressable
			onPress={() => onSelect(product)}
			accessibilityRole="button"
			className="flex-row items-center justify-between px-5 py-3.5 active:bg-popover"
		>
			<View className="flex-1 pr-3">
				<Text className="text-foreground font-sans-semi text-sm" numberOfLines={1}>
					{product.name}
				</Text>
				{product.sku ? (
					<Text className="text-foreground-subtle font-sans text-xs mt-0.5">{product.sku}</Text>
				) : null}
			</View>
			<Text className="text-muted-foreground font-sans-semi text-sm">
				{t('kitForm.picker.cost')}: {formattedCost}
			</Text>
		</Pressable>
	)
}
