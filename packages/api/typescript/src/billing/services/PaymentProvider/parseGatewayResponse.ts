import type Z from 'zod'
import { BaseError } from '@template/core-typescript'
import type { InterfaceErrors } from '../../errors'

/**
 * Contract boundary with the gateway: EVERY raw HTTP response passes through here before it is read.
 * A shape outside the contract fails LOUD (PROVIDER_ERROR with the zod issues) instead of becoming
 * a silent `as T` that corrupts status/values downstream. The schemas live in
 * `<Gateway>PaymentProvider/schemas/` — lenient (`.nullish()`) on everything that isn't an
 * invariant, so a NEW or absent field doesn't break; only a truly incompatible shape breaks.
 */
export function parseGatewayResponse<S extends Z.ZodType>(schema: S, data: unknown, gateway: string): Z.output<S> {
	const parsed = schema.safeParse(data)
	if (!parsed.success) {
		throw new BaseError<InterfaceErrors>('PROVIDER_ERROR', `${gateway}: unexpected gateway response shape — ${parsed.error.message}`)
	}
	return parsed.data
}
