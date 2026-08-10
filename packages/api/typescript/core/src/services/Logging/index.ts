import { DefaultLoggingService } from './DefaultLoggingService'
import type { LoggingService } from './LoggingService'

export * from './DefaultLoggingService'
export * from './LoggingService'
export * from './MockLoggingService'
export * from './OtlpLoggingService'

/**
 * Deprecated shim — T3 deletes this.
 *
 * `src/shared/registry.ts` (out of this task's scope — T3 owns it) still calls
 * `const resolveRealLoggingService = createLoggingServiceFactory()` and later
 * `resolveRealLoggingService()` to resolve the `real` `LoggingService` binding. `LoggingBinding.ts`
 * (the factory's original home) is gone — `DefaultLoggingService` (spec D13) replaces it as the ONE
 * declarable class the registry should bind directly. This shim exists ONLY to keep that call site
 * compiling until T3 rewires the `real` binding to `DefaultLoggingService` and deletes both the call
 * site and this export.
 *
 * Preserves the original factory's lazy-singleton shape (memoized instance per call) so a `real`
 * OTLP-backed resolve still shares one `LoggerProvider`/`BatchLogRecordProcessor` instead of
 * leaking one per resolve.
 */
// T3 deletes this shim
export const createLoggingServiceFactory = (): (() => LoggingService) => {
	const instance = new DefaultLoggingService()
	return () => instance
}
