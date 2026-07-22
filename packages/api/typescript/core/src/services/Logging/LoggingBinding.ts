import { Config } from '../../utils/Config'
import { LoggingService } from './LoggingService'
import { MockLoggingService } from './MockLoggingService'
import { OtlpLoggingService } from './OtlpLoggingService'

/**
 * Builds the `real`-environment `LoggingService` resolver bound in `shared/registry.ts`.
 *
 * Returns a **lazy singleton**: the closure-captured `cached` value is constructed at most once, no
 * matter how many times the returned function is called. This matters because `OtlpLoggingService`
 * owns a `LoggerProvider` with a `BatchLogRecordProcessor` — constructing a fresh instance per DI
 * resolve would leak one processor (and its own export queue/timer) per resolve instead of sharing
 * a single exporter for the process lifetime.
 *
 * Fail-safe: if `OTEL_COLLECTOR_LOG_URL` is unset, building an `OtlpLoggingService` would point its
 * exporter at an empty URL — which fails (silently or on first flush) instead of at boot. Falling
 * back to `MockLoggingService` (console output) keeps boot green and a single `console.warn` makes
 * the misconfiguration visible in deploy logs instead of a swallowed export failure.
 *
 * Exposed as a factory (not a module-level singleton) so callers — and tests — can build independent,
 * isolated resolvers instead of sharing cached state across call sites/test cases.
 */
export function createLoggingServiceFactory(): () => LoggingService {
	let cached: LoggingService | undefined

	return () => {
		if (cached) return cached

		if (!Config.env.OTEL_COLLECTOR_LOG_URL) {
			console.warn(
				'[boot] OTEL_COLLECTOR_LOG_URL is not configured — OtlpLoggingService will not be bound; logs fall back to console only (MockLoggingService).',
			)
			cached = new MockLoggingService()
			return cached
		}

		cached = new OtlpLoggingService({
			component: Config.env.OTEL_SERVICE_NAME,
			project: Config.project,
		})
		return cached
	}
}
