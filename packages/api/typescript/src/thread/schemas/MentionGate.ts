import { z } from '@codedm/core-typescript'

/** MentionGate discriminated-union VO — a tag is required exactly when the gate is enabled. */
export const MentionGateSchema = z.discriminatedUnion('enabled', [
	z.object({ enabled: z.literal(false) }),
	z.object({ enabled: z.literal(true), tag: z.string().trim().min(1) }),
])
