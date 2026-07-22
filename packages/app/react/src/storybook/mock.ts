// packages/app/react/src/storybook/mock.ts — MSW handler builders keyed off SDK query/mutation options.
// The SDK options object carries BOTH the endpoint url (queryKey/mutationKey[0].url, a literal via
// `as const`) and the response type (queryFn/mutationFn), so one import yields url-matching + inference.
import { http, HttpResponse, delay } from 'msw'
import type { RequestHandler } from 'msw'

import type { useSession } from '@/hooks'
import type { DeepPartial } from '@/lib'

// Structural interfaces that match the SDK's queryOptions/mutationOptions return shape.
// queryKey has at minimum one element that carries the URL as a string.
interface QueryOptionsLike<TData = unknown> {
	queryKey: readonly [{ url: string }, ...unknown[]]
	// biome-ignore lint/suspicious/noExplicitAny: function args for SDK queryFn compatibility
	queryFn?: ((...args: any[]) => TData | Promise<TData>) | undefined
}
interface MutationOptionsLike<TData = unknown> {
	mutationKey: readonly unknown[]
	// biome-ignore lint/suspicious/noExplicitAny: function args for SDK mutationFn compatibility
	mutationFn?: ((...args: any[]) => Promise<TData>) | undefined
}
type MutationMethod = 'post' | 'put' | 'patch' | 'delete'

type QueryResp<O> = O extends QueryOptionsLike<infer R> ? R : unknown
type MutationResp<O> = O extends MutationOptionsLike<infer R> ? R : unknown

const glob = (key: readonly [{ url: string }, ...unknown[]]) => `*${key[0].url}`
const mutationGlob = (key: readonly unknown[]) => `*${(key[0] as { url: string }).url}`

/** Mock a successful GET. `response` is a DeepPartial of the SDK response — type-checked, lean, cast-free. */
export function mockQuery<O extends QueryOptionsLike>(options: O, response: DeepPartial<QueryResp<O>>): RequestHandler {
	return http.get(glob(options.queryKey), () => HttpResponse.json(response as never))
}

/** Mock a never-resolving GET — drives the component's loading/skeleton state. */
export function loadingQuery(options: QueryOptionsLike): RequestHandler {
	return http.get(glob(options.queryKey), async () => {
		await delay('infinite')
		return HttpResponse.json(null)
	})
}

/** Mock a failed GET. Default 400 — a 4xx so ky fails fast (it retries 5xx). */
export function errorQuery(options: QueryOptionsLike, status = 400): RequestHandler {
	return http.get(glob(options.queryKey), () => new HttpResponse(null, { status }))
}

/** Mock a successful mutation. Method is explicit (it isn't in the SDK options); url + response inferred. */
export function mockMutation<O extends MutationOptionsLike>(method: MutationMethod, options: O, response: DeepPartial<MutationResp<O>>): RequestHandler {
	return http[method](mutationGlob(options.mutationKey), () => HttpResponse.json(response as never))
}

/** Mock a failed mutation (e.g. 409 ALREADY_EXISTS). */
export function mockMutationError(method: MutationMethod, options: MutationOptionsLike, status = 400): RequestHandler {
	return http[method](mutationGlob(options.mutationKey), () => new HttpResponse(null, { status }))
}

/** Mock the better-auth session endpoint so components calling useSession() get a fixed value.
 *  Typed off the app's own useSession so it stays in sync with the session shape. */
export function mockSession(session: ReturnType<typeof useSession>): RequestHandler {
	return http.get('*/v1/authentication/get-session', () => HttpResponse.json(session as never))
}
