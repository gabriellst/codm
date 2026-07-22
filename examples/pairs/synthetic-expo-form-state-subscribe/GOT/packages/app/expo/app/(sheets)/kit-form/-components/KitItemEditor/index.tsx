// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-expo-form-state-subscribe
// task:        synthetic-expo-form-state-subscribe
// stamp:       expo-formsub-iter7
// docTreeHash: 46468161d9ca
// model:       sonnet
// graded:      2026-06-12T17:35:14.911Z
// source:      packages/app/expo/app/(sheets)/kit-form/-components/KitItemEditor/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
// packages/app/expo/app/(sheets)/kit-form/-components/KitItemEditor/index.tsx
//
// Editor for building one kit item: pick a product, set quantity and
// quantityModifier. The screen owns `useForm`; this component receives the
// form as a typed prop (FRM-P04).
//
// Action button branches:
//   editingSelection == null  → "Add item" — appends to items[]
//   editingSelection != null  → "Save item" — replaces items[index]

import { Pressable, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import {
	QuantityModifierEnum,
	type QuantityModifier,
	type ListProductsForKit200,
} from '@codedm/client-typescript/typescript'
import { NumField } from '@/components/ui/NumField'
import type { KitForm } from '../../-types'

type Product = ListProductsForKit200['items'][number]

interface KitItemEditorProps {
	form: KitForm
	onOpenPicker: () => void
	productsById: Map<string, Product>
}

const MODIFIERS = Object.values(QuantityModifierEnum) as QuantityModifier[]

export function KitItemEditor({ form, onOpenPicker, productsById }: KitItemEditorProps) {
	const { t } = useTranslation()

	return (
		<View className="gap-3 p-4 bg-card rounded-xl border border-border">
			{/* Product field — tapping opens the picker overlay */}
			<form.Field name="editorProductId">
				{field => {
					const product = field.state.value ? productsById.get(field.state.value) : null
					return (
						<View className="gap-1.5">
							<Text className="text-foreground-subtle font-sans-semi text-xs uppercase">
								{t('kitForm.fields.editor.product.label')}
							</Text>
							<Pressable
								onPress={onOpenPicker}
								accessibilityRole="button"
								className="border border-border rounded-lg px-3.5 py-3 flex-row items-center justify-between active:bg-popover"
							>
								<Text
									className={
										product
											? 'text-foreground font-sans-semi text-sm'
											: 'text-foreground-subtle font-sans text-sm'
									}
									numberOfLines={1}
								>
									{product
										? product.name
										: t('kitForm.fields.editor.product.placeholder')}
								</Text>
							</Pressable>
						</View>
					)
				}}
			</form.Field>

			{/* Quantity stepper */}
			<form.Field name="editorQuantity">
				{field => (
					<NumField
						label={t('kitForm.fields.editor.quantity.label')}
						value={field.state.value ?? 1}
						onChange={field.handleChange}
						step={1}
						min={1}
					/>
				)}
			</form.Field>

			{/* Quantity modifier selector — pill chips */}
			<form.Field name="editorQuantityModifier">
				{field => (
					<View className="gap-1.5">
						<Text className="text-foreground-subtle font-sans-semi text-xs uppercase">
							{t('kitForm.fields.editor.modifier.label')}
						</Text>
						<View className="flex-row flex-wrap gap-2">
							{MODIFIERS.map(mod => {
								const isSelected = (field.state.value ?? 'EQ') === mod
								return (
									<Pressable
										key={mod}
										onPress={() => field.handleChange(mod)}
										accessibilityRole="button"
										className={[
											'px-3 py-1.5 rounded-pill border',
											isSelected
												? 'bg-foreground border-foreground'
												: 'bg-transparent border-border',
										].join(' ')}
									>
										<Text
											className={[
												'font-sans-semi text-xs',
												isSelected ? 'text-background' : 'text-foreground-subtle',
											].join(' ')}
										>
											{t(`enums.QuantityModifier.${mod}`)}
										</Text>
									</Pressable>
								)
							})}
						</View>
					</View>
				)}
			</form.Field>

			{/* Action button — branches on editingSelection */}
			<form.Subscribe
				selector={s => ({
					editingSelection: s.values.editingSelection,
					editorProductId: s.values.editorProductId,
					editorQuantity: s.values.editorQuantity,
					editorQuantityModifier: s.values.editorQuantityModifier,
					items: s.values.items,
				})}
			>
				{({ editingSelection, editorProductId, editorQuantity, editorQuantityModifier, items }) => {
					const canAdd = !!editorProductId && (editorQuantity ?? 0) >= 1

					const handleAddOrSave = () => {
						if (!editorProductId || (editorQuantity ?? 0) < 1) return
						const newItem = {
							productId: editorProductId,
							quantity: editorQuantity ?? 1,
							quantityModifier: editorQuantityModifier ?? 'EQ',
						}
						if (editingSelection != null && editingSelection.index != null) {
							const next = [...(items ?? [])]
							next[editingSelection.index] = newItem
							form.setFieldValue('items', next)
						} else {
							form.setFieldValue('items', [...(items ?? []), newItem])
						}
						// Reset editor to add-new-item state
						form.setFieldValue('editingSelection', null)
						form.setFieldValue('editorProductId', null)
						form.setFieldValue('editorQuantity', 1)
						form.setFieldValue('editorQuantityModifier', 'EQ')
					}

					return (
						<View className="gap-2">
							<Pressable
								onPress={handleAddOrSave}
								disabled={!canAdd}
								accessibilityRole="button"
								className={[
									'py-3 rounded-lg items-center',
									canAdd ? 'bg-foreground' : 'bg-muted opacity-50',
								].join(' ')}
							>
								<Text
									className={[
										'font-sans-semi text-sm',
										canAdd ? 'text-background' : 'text-foreground-subtle',
									].join(' ')}
								>
									{editingSelection != null
										? t('kitForm.fields.editor.saveItem')
										: t('kitForm.fields.editor.addItem')}
								</Text>
							</Pressable>

							{editingSelection != null ? (
								<Pressable
									onPress={() => {
										form.setFieldValue('editingSelection', null)
										form.setFieldValue('editorProductId', null)
										form.setFieldValue('editorQuantity', 1)
										form.setFieldValue('editorQuantityModifier', 'EQ')
									}}
									accessibilityRole="button"
									className="py-2 items-center"
								>
									<Text className="text-foreground-subtle font-sans-semi text-sm">
										{t('kitForm.fields.editor.cancelEdit')}
									</Text>
								</Pressable>
							) : null}
						</View>
					)
				}}
			</form.Subscribe>
		</View>
	)
}
