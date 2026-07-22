// CONTEXT-ORIGIN · APPROVED pair · examples/pairs/synthetic-expo-form-state-subscribe
// task:        synthetic-expo-form-state-subscribe
// stamp:       expo-formsub-iter7
// docTreeHash: 46468161d9ca
// model:       sonnet
// graded:      2026-06-12T17:35:14.911Z
// source:      packages/app/expo/app/(sheets)/kit-form/index.tsx (archived eval build, applied at HEAD)
// Verbatim extract of the archived eval build — NOT a live module. Do not import it.
import { useEffect, useMemo } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { router } from 'expo-router'
import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { Haptics } from 'react-native-nitro-haptics'
import { useTranslation } from 'react-i18next'
import { z } from 'zod/v4'
import {
	useCreateKit,
	useListProductsForKit,
	createKitMutationRequestSchema,
	listKitsQueryKey,
	ProductCostTypeEnum,
	type ProductCostType,
	type ListProductsForKit200,
} from '@template/client-typescript/typescript'
import { Protected } from '@/components/Protected'
import { KeyboardAware } from '@/components/ui/KeyboardAware'
import { Input, InputGroup } from '@/components/ui/Input'
import { NumField } from '@/components/ui/NumField'
import { Button } from '@/components/ui/Button'
import { Eyebrow } from '@/components/ui/Eyebrow'
import { IconClose } from '@/components/ui/Icons'
import { fg, fs, surfaces } from '@/lib/tokens'
import { useTypedSearchParams } from '@/lib/typed-route'
import type { DeepPartial } from '@/lib/types'
import { kitFormSchema, type KitFormData } from './-types'
import { useKitFormStore } from './-stores/useKitFormStore'
import { KitItemEditor } from './-components/KitItemEditor'
import { KitItemList } from './-components/KitItemList'
import { ProductPicker } from './-components/ProductPicker'

type Product = ListProductsForKit200['items'][number]

const KIT_TYPES = Object.values(ProductCostTypeEnum) as ProductCostType[]

const paramsSchema = z.object({
	type: z
		.enum(['SINGLE', 'MULTIPLE'])
		.catch('SINGLE')
		.default('SINGLE'),
})

export default function KitFormSheet() {
	const { t } = useTranslation()
	const queryClient = useQueryClient()
	const createKit = useCreateKit()

	const [{ type: urlType }] = useTypedSearchParams(paramsSchema)
	const pickerOpen = useKitFormStore((state) => state.pickerOpen)
	const setPickerOpen = useKitFormStore((state) => state.setPickerOpen)

	useEffect(() => {
		return () => useKitFormStore.getState().reset()
	}, [])

	// Products fetched once at the sheet level — used by the picker overlay
	// (cache hit) and by item rows for name resolution.
	const { data: productsData } = useListProductsForKit()
	const productsById = useMemo<Map<string, Product>>(() => {
		const map = new Map<string, Product>()
		for (const p of productsData?.items ?? []) map.set(p.id, p)
		return map
	}, [productsData])

	const defaultValues: DeepPartial<KitFormData> = {
		type: urlType,
		shipping: 0,
		items: [],
		editingSelection: null,
		editorProductId: null,
		editorQuantity: 1,
		editorQuantityModifier: 'EQ',
	}

	const form = useForm({
		defaultValues,
		validators: { onChange: kitFormSchema },
		onSubmit: async ({ value }) => {
			const result = createKitMutationRequestSchema.safeParse({
				name: value.name,
				type: value.type,
				shipping: value.shipping,
				cost: value.cost,
				items: value.items,
			})
			if (!result.success) return

			await createKit.mutateAsync(
				{ data: result.data },
				{
					onSuccess: () => {
						Haptics.notification('success')
						router.back()
					},
					onSettled: () =>
						queryClient.invalidateQueries({ queryKey: listKitsQueryKey() }),
				},
			)
		},
	})

	const handleSelectProduct = (product: Product) => {
		form.setFieldValue('editorProductId', product.id)
		setPickerOpen(false)
	}

	return (
		<Protected>
			<KeyboardAware style={{ backgroundColor: surfaces.surface1 }}>
				<ScrollView
					className="flex-1"
					contentContainerStyle={{ paddingBottom: 32 }}
					keyboardShouldPersistTaps="handled"
				>
					{/* Header */}
					<View className="flex-row items-center justify-between px-5 pt-4 pb-2">
						<View className="w-8" />
						<Text
							className="text-foreground font-sans-bold text-center"
							style={{ fontSize: fs.headerTitle }}
						>
							{t('kitForm.title')}
						</Text>
						<Pressable
							onPress={() => router.back()}
							accessibilityRole="button"
							accessibilityLabel={t('common.close')}
							hitSlop={12}
						>
							<IconClose size={20} color={fg.fg1} />
						</Pressable>
					</View>

					<View className="px-5 gap-5 pt-4">
						{/* Kit name */}
						<form.Field name="name">
							{field => (
								<View className="gap-1.5">
									<Text className="text-foreground-subtle font-sans-semi text-xs uppercase">
										{t('kitForm.fields.name.label')}
									</Text>
									<InputGroup>
										<Input
											value={field.state.value ?? ''}
											onChangeText={field.handleChange}
											onBlur={field.handleBlur}
											placeholder={t('kitForm.fields.name.placeholder')}
											accessibilityLabel={t('kitForm.fields.name.label')}
										/>
									</InputGroup>
								</View>
							)}
						</form.Field>

						{/* Kit type selector */}
						<form.Field name="type">
							{field => (
								<View className="gap-1.5">
									<Text className="text-foreground-subtle font-sans-semi text-xs uppercase">
										{t('kitForm.fields.type.label')}
									</Text>
									<View className="flex-row gap-2">
										{KIT_TYPES.map(kt => {
											const isSelected = (field.state.value ?? 'SINGLE') === kt
											return (
												<Pressable
													key={kt}
													onPress={() => field.handleChange(kt)}
													accessibilityRole="button"
													className={[
														'flex-1 py-3 items-center rounded-lg border',
														isSelected
															? 'bg-foreground border-foreground'
															: 'bg-transparent border-border',
													].join(' ')}
												>
													<Text
														className={[
															'font-sans-semi text-sm',
															isSelected ? 'text-background' : 'text-foreground-subtle',
														].join(' ')}
													>
														{t(`enums.ProductCostType.${kt}`)}
													</Text>
												</Pressable>
											)
										})}
									</View>
								</View>
							)}
						</form.Field>

						{/* Shipping cost */}
						<form.Field name="shipping">
							{field => (
								<NumField
									label={t('kitForm.fields.shipping.label')}
									value={field.state.value ?? 0}
									onChange={field.handleChange}
									step={1}
									min={0}
								/>
							)}
						</form.Field>

						{/* Optional extra cost */}
						<form.Field name="cost">
							{field => (
								<View className="gap-1.5">
									<Text className="text-foreground-subtle font-sans-semi text-xs uppercase">
										{t('kitForm.fields.cost.label')}
									</Text>
									<InputGroup>
										<Input
											value={field.state.value != null ? String(field.state.value) : ''}
											onChangeText={text => {
												const n = parseFloat(text)
												field.handleChange(isNaN(n) ? undefined : n)
											}}
											onBlur={field.handleBlur}
											keyboardType="decimal-pad"
											accessibilityLabel={t('kitForm.fields.cost.label')}
										/>
									</InputGroup>
								</View>
							)}
						</form.Field>

						{/* Items section */}
						<View className="gap-3">
							<Eyebrow>{t('kitForm.fields.items.section')}</Eyebrow>

							<KitItemEditor
								form={form}
								onOpenPicker={() => setPickerOpen(true)}
								productsById={productsById}
							/>

							<KitItemList
								form={form}
								productsById={productsById}
								onOpenPicker={() => setPickerOpen(true)}
							/>
						</View>

						{/* Submit */}
						<form.Subscribe
							selector={s => ({
								canSubmit: s.canSubmit,
								isSubmitting: s.isSubmitting,
								values: s.values,
							})}
						>
							{({ canSubmit, isSubmitting, values }) => {
								const apiCheck = createKitMutationRequestSchema.safeParse({
									name: values.name,
									type: values.type,
									shipping: values.shipping,
									cost: values.cost,
									items: values.items,
								})
								const isDisabled =
									!canSubmit ||
									isSubmitting ||
									createKit.isPending ||
									!apiCheck.success
								return (
									<Button
										label={t('kitForm.submit')}
										fullWidth
										onPress={() => void form.handleSubmit()}
										disabled={isDisabled}
									/>
								)
							}}
						</form.Subscribe>
					</View>
				</ScrollView>
			</KeyboardAware>

			<ProductPicker
				visible={pickerOpen}
				onClose={() => setPickerOpen(false)}
				onSelect={handleSelectProduct}
			/>
		</Protected>
	)
}
