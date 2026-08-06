import { injectable } from 'tsyringe-neo'
import { Controller, BaseError, HttpStatusCode, z } from '@codm/core-typescript'
import { GetEntitlement, GetEntitlementOutputSchema } from '../../usecases/GetEntitlement'
import type { InterfaceErrors } from '../../errors'

export const GetEntitlementControllerInputSchema = z.object({}).example([{}])

export const GetEntitlementControllerOutputSchema = GetEntitlementOutputSchema.example([
	{ active: true, plan: 'free', userId: '019e4d24-6524-7041-9e1c-8108180cddae' },
])

/**
 * "Does this install get to run" — the whole of entitlement post-pivot (spec decision 1). PUBLIC on
 * purpose: the caller is the local daemon's CloudSession revalidation (T7), authenticated by the
 * `Authorization: Bearer <device token>` header alone, never a better-auth cookie or the local
 * operator — so neither OperatorMiddleware nor any `ctx` applies here.
 */
@injectable()
export class GetEntitlementController extends Controller<
	typeof GetEntitlementControllerInputSchema,
	typeof GetEntitlementControllerOutputSchema
> {
	readonly path = '/cloud/entitlement'
	readonly method = 'get' as const
	readonly description = 'Resolve a device token (Bearer) into the account entitlement'
	readonly inputSchema = GetEntitlementControllerInputSchema
	readonly outputSchema = GetEntitlementControllerOutputSchema

	constructor(private readonly getEntitlement: GetEntitlement) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const token = bearerToken(request.headers?.authorization)
		if (!token) throw new BaseError<InterfaceErrors>('UNAUTHORIZED', 'missing Authorization: Bearer <device token>')

		const result = await this.getEntitlement.execute({ token })
		return { status: HttpStatusCode.OK, data: result }
	}
}

/** `Authorization: Bearer <token>` → `<token>`, or undefined for any other/absent header shape. */
function bearerToken(header: string | undefined): string | undefined {
	if (!header?.startsWith('Bearer ')) return undefined
	return header.slice('Bearer '.length).trim() || undefined
}
