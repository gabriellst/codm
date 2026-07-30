/**
 * @codm/client-typescript runtime entrypoint.
 *
 * Public exports for consumers (frontend apps + backend Client class):
 *  - configureClient({ <service>: baseUrl, ... }) — set per-service base URLs once at boot
 *  - getBaseUrl(service) / getConfig() / resetClient() — inspection + test helpers
 *  - createClient(service) — factory the per-service wrappers use
 *  - RequestConfig / ResponseConfig / ResponseErrorConfig types — used by Kubb operations
 */

export { configureClient, getBaseUrl, getConfig, resetClient, resolveURL } from './config'
export type { ServiceBaseUrls } from './config'

export { createClient } from './client'
export type {
	Client,
	RequestConfig,
	ResponseConfig,
	ResponseErrorConfig,
	ResponseType,
	RetryConfig,
} from './client'
