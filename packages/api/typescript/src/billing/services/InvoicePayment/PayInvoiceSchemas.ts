// The endpoint's discriminated unions, COMPOSED from the strategies' leaf schemas — the leaves
// live with the strategy that implements them; this file only assembles. Adding a method =
// new strategy file + one leaf per union here + registry entry (the `satisfies` check in
// InvoicePaymentStrategyRegistry refuses to compile until the registry covers the new leaf).
import type Z from 'zod'
import { z } from '@template/core-typescript'
import { CardPayInvoiceInputSchema, CardPayInvoiceOutputSchema } from './CardInvoicePaymentStrategy'
import { PixPayInvoiceInputSchema, PixPayInvoiceOutputSchema } from './PixInvoicePaymentStrategy'

export const PayInvoicePaymentSchema = z.discriminatedUnion('method', [CardPayInvoiceInputSchema, PixPayInvoiceInputSchema])
export type PayInvoicePayment = Z.infer<typeof PayInvoicePaymentSchema>

export const PayInvoiceResponseSchema = z.discriminatedUnion('method', [CardPayInvoiceOutputSchema, PixPayInvoiceOutputSchema])
export type PayInvoiceResponse = Z.infer<typeof PayInvoiceResponseSchema>

/** The method literals the pay-invoice unions actually carry — what the registry must cover. */
export type SupportedPayInvoiceMethod = PayInvoicePayment['method']
