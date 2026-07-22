import type Z from 'zod'
import { z } from '@template/core-typescript'

// QR code resource returned by `GET /payments/{id}/pixQrCode`. Every field is `.nullish()` — the
// provider already falls back gracefully (empty string / default expiry) when Asaas omits them
// (no field here is a true invariant).
export const AsaasPixQrCodeResponseSchema = z.object({
	encodedImage: z.string().nullish(),
	payload: z.string().nullish(),
	expirationDate: z.string().nullish(),
})

export type AsaasPixQrCodeResponse = Z.infer<typeof AsaasPixQrCodeResponseSchema>
