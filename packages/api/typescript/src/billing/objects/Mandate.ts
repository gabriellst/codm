import { BaseValueObject, z } from '@template/core-typescript'
import Z from 'zod'

export const MandateSchema = z.object({
	acceptedAt: z.date(),
	// Audit/compliance trail captured at mandate acceptance. Nullable —
	// legacy mandates and non-HTTP callers won't have these.
	ip: z.string().nullable().optional(),
	userAgent: z.string().nullable().optional(),
	consentVersion: z.string().nullable().optional(),
})

export class Mandate extends BaseValueObject<typeof MandateSchema> {
	static override schema = MandateSchema

	equals(other: Mandate): boolean {
		return this.acceptedAt.getTime() === other.acceptedAt.getTime()
	}

	override toString(): string {
		return this.acceptedAt.toISOString()
	}
}

export interface Mandate extends Z.infer<typeof MandateSchema> {}

export type MandateProps = Z.input<typeof MandateSchema>
