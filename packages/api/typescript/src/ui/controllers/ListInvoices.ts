import { injectable } from 'tsyringe-neo'
import { Controller, HttpStatusCode, z } from '@template/core-typescript'
import { AuthAccountMiddleware } from '@auth/middlewares/AuthAccountMiddleware'
import { RequireOwner } from '@owner/middlewares'
import { CurrencyCode } from '@template/contracts-typescript/wire/enums'
import { InvoiceStatus } from '@billing/enums'
import { ListInvoices, ListInvoicesOutputSchema } from '../usecases/billing/ListInvoices'
import { PaymentMethodType, PlanName } from '@template/contracts-typescript/wire/enums'

export const ListInvoicesControllerInput = z
	.object({
		ctx: z.object({
			session: z.object({
				ownerId: z.string(),
			}),
		}),
	})
	.example([{ ctx: { session: { ownerId: 'owner-uuid' } } }])

export const ListInvoicesControllerOutput = ListInvoicesOutputSchema.example([
	{
		invoices: [
			{
				invoiceId: 'native:owner-uuid:first',
				number: 'INV-0001',
				pdfUrl: 'https://example.com/invoices/inv-0001.pdf',
				amountCents: 29900,
				currency: CurrencyCode.BRL,
				status: InvoiceStatus.PAID,
				paidAt: new Date('2026-06-22T00:00:00Z'),
				overdue: false,
				description: 'Fatura native:owner-uuid:first',
				planName: PlanName.PRO,
				dueDate: null,
				payableMethods: [PaymentMethodType.CARD],
			},
			{
				invoiceId: 'native:owner-uuid:second',
				number: null,
				pdfUrl: null,
				amountCents: 0,
				currency: CurrencyCode.BRL,
				status: InvoiceStatus.OVERDUE,
				paidAt: null,
				overdue: true,
				description: 'Fatura native:owner-uuid:second',
				planName: null,
				dueDate: null,
				payableMethods: [PaymentMethodType.CARD, PaymentMethodType.PIX],
			},
		],
	},
])

@injectable()
export class ListInvoicesController extends Controller<typeof ListInvoicesControllerInput, typeof ListInvoicesControllerOutput> {
	readonly path = '/ui/billing/invoices'
	readonly method = 'get' as const
	readonly description = 'List the payment history for the authenticated owner'
	readonly inputSchema = ListInvoicesControllerInput
	readonly outputSchema = ListInvoicesControllerOutput

	override middlewares = [AuthAccountMiddleware, RequireOwner]

	constructor(private listInvoices: ListInvoices) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const data = await this.listInvoices.execute({ ownerId: request.ctx.session.ownerId })

		return {
			status: HttpStatusCode.OK,
			data,
		}
	}
}
