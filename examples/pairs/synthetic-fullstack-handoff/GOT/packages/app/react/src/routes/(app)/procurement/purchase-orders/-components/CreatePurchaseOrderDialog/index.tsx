import type { ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import {
	useCreatePurchaseOrder,
	listPurchaseOrdersQueryKey,
	CurrencyCodeEnum,
	createPurchaseOrderMutationRequestSchema,
	type CreatePurchaseOrderMutationRequest,
} from '@template/client-typescript/typescript'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { CurrencyInput } from '@/components/ui/currency-input'
import { useDialogStore } from '@/stores/useDialogStore'

type CreatePurchaseOrderDialogProps = ComponentProps<'div'>

/**
 * CreatePurchaseOrderDialog — form for creating a supplier purchase order.
 * Self-contained: owns form state, mutation, toast, and invalidation.
 * Opened via useDialogStore().show(<CreatePurchaseOrderDialog />).
 */
export function CreatePurchaseOrderDialog({ className, ...props }: CreatePurchaseOrderDialogProps) {
	const { t } = useTranslation()
	const hide = useDialogStore(s => s.hide)
	const queryClient = useQueryClient()

	const createPurchaseOrder = useCreatePurchaseOrder({
		mutation: {
			onSuccess: () => {
				toast.success(t('purchaseOrders.createDialog.successToast'))
				queryClient.invalidateQueries({ queryKey: listPurchaseOrdersQueryKey() })
				hide()
			},
		},
	})

	const defaultValues: CreatePurchaseOrderMutationRequest = {
		supplierName: '',
		totalAmount: {
			amountCents: 0,
			currency: CurrencyCodeEnum.BRL,
		},
	}

	const form = useForm({
		defaultValues,
		validators: { onChange: createPurchaseOrderMutationRequestSchema },
		onSubmit: async ({ value }) => {
			const result = createPurchaseOrderMutationRequestSchema.safeParse(value)
			if (!result.success) return
			await createPurchaseOrder.mutateAsync({ data: result.data })
		},
	})

	return (
		<div className={cn('flex flex-col gap-6 p-6', className)} {...props}>
			<div className="flex flex-col gap-1">
				<h2 className="text-lg font-semibold text-foreground">{t('purchaseOrders.createDialog.title')}</h2>
				<p className="text-sm text-muted-foreground">{t('purchaseOrders.createDialog.subtitle')}</p>
			</div>

			<form
				noValidate
				onSubmit={e => {
					e.preventDefault()
					e.stopPropagation()
					form.handleSubmit()
				}}
			>
				<FieldGroup>
					<form.Field name="supplierName">
						{field => (
							<Field>
								<FieldLabel htmlFor={field.name}>{t('purchaseOrders.createDialog.supplierName')}</FieldLabel>
								<Input
									id={field.name}
									placeholder={t('purchaseOrders.createDialog.supplierNamePlaceholder')}
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={e => field.handleChange(e.target.value)}
								/>
								{field.state.meta.errors[0] && <FieldError>{String(field.state.meta.errors[0] ?? '')}</FieldError>}
							</Field>
						)}
					</form.Field>

					<form.Field name="totalAmount">
						{field => (
							<Field>
								<FieldLabel htmlFor={field.name}>{t('purchaseOrders.createDialog.totalAmount')}</FieldLabel>
								<CurrencyInput
									id={field.name}
									amountCents={field.state.value?.amountCents ?? 0}
									currency={field.state.value?.currency ?? CurrencyCodeEnum.BRL}
									onAmountChange={cents => field.handleChange({ ...field.state.value, amountCents: cents })}
									onCurrencyChange={c => field.handleChange({ ...field.state.value, currency: c })}
								/>
								{field.state.meta.errors[0] && <FieldError>{String(field.state.meta.errors[0] ?? '')}</FieldError>}
							</Field>
						)}
					</form.Field>

					<form.Subscribe selector={s => [s.values, s.isSubmitting] as const}>
						{([values, isSubmitting]) => (
							<div className="flex justify-end gap-2 pt-2">
								<Button type="button" variant="outline" onClick={hide}>
									{t('purchaseOrders.createDialog.cancel')}
								</Button>
								<Button
									type="submit"
									disabled={!createPurchaseOrderMutationRequestSchema.safeParse(values).success || isSubmitting}
								>
									{isSubmitting ? <Spinner /> : t('purchaseOrders.createDialog.submit')}
								</Button>
							</div>
						)}
					</form.Subscribe>
				</FieldGroup>
			</form>
		</div>
	)
}
