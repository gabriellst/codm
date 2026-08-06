import { injectable } from 'tsyringe-neo'
import { Controller, BaseError, HttpStatusCode, z } from '@codm/core-typescript'
import { RevokeDevice } from '../../usecases/RevokeDevice'
import type { InterfaceErrors } from '../../errors'

export const RevokeDeviceControllerInputSchema = z.object({}).example([{}])

export const RevokeDeviceControllerOutputSchema = z.void()

/**
 * Logout (spec decision 4, AC-6). PUBLIC on purpose, same reasoning as GetEntitlement: the caller
 * authenticates with the `Authorization: Bearer <device token>` header being revoked, never a
 * better-auth cookie or the local operator.
 */
@injectable()
export class RevokeDeviceController extends Controller<
	typeof RevokeDeviceControllerInputSchema,
	typeof RevokeDeviceControllerOutputSchema
> {
	readonly path = '/cloud/devices/revoke'
	readonly method = 'post' as const
	readonly description = 'Revoke the device token presented as a Bearer credential'
	readonly inputSchema = RevokeDeviceControllerInputSchema
	readonly outputSchema = RevokeDeviceControllerOutputSchema

	constructor(private readonly revokeDevice: RevokeDevice) {
		super()
	}

	async handle(request: this['input']): Promise<this['output']> {
		const token = bearerToken(request.headers?.authorization)
		if (!token) throw new BaseError<InterfaceErrors>('UNAUTHORIZED', 'missing Authorization: Bearer <device token>')

		await this.revokeDevice.execute({ token })
		return { status: HttpStatusCode.NO_CONTENT, data: undefined }
	}
}

/** `Authorization: Bearer <token>` → `<token>`, or undefined for any other/absent header shape. */
function bearerToken(header: string | undefined): string | undefined {
	if (!header?.startsWith('Bearer ')) return undefined
	return header.slice('Bearer '.length).trim() || undefined
}
