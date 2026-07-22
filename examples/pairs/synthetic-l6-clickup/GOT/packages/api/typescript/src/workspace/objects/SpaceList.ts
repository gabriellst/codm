import { BaseValueObject, z } from '@codedm/core-typescript'
import Z from 'zod'

export const SpaceListSchema = z.object({
	id: z.uuid(),
	name: z.string().min(1),
	position: z.number().int().min(0),
})

export type SpaceListProps = Z.infer<typeof SpaceListSchema>

export class SpaceList extends BaseValueObject<typeof SpaceListSchema> {
	static override schema = SpaceListSchema
}

export interface SpaceList extends SpaceListProps {}
