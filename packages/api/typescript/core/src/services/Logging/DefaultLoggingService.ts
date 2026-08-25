import { injectable } from 'tsyringe-neo'
import { Config } from '../../utils/Config'
import { LoggingArgs, LoggingService } from './LoggingService'
import { MockLoggingService } from './MockLoggingService'
import { OtlpLoggingService } from './OtlpLoggingService'

/**
 * The ONE class the registry declares for logging (spec D13): the constructor picks the transport
 * from `Config` — OTLP when `OTEL_COLLECTOR_LOG_URL` is configured, console (`MockLoggingService`)
 * when it isn't. Replaces `createLoggingServiceFactory` + its binding indirection — the container
 * owns the lifecycle (singleton), the decision lives in the constructor, and the registry only
 * declares the class.
 */
@injectable()
export class DefaultLoggingService extends LoggingService {
	private readonly delegate: LoggingService

	constructor() {
		super()
		if (!Config.env.OTEL_COLLECTOR_LOG_URL) {
			console.warn('[boot] OTEL_COLLECTOR_LOG_URL is not configured — logs fall back to console only.')
			this.delegate = new MockLoggingService()
		} else {
			this.delegate = new OtlpLoggingService({ component: Config.env.OTEL_SERVICE_NAME, project: Config.project })
		}
	}

	debug(args: LoggingArgs): void {
		this.delegate.debug(args)
	}

	error(args: LoggingArgs): void {
		this.delegate.error(args)
	}

	info(args: LoggingArgs): void {
		this.delegate.info(args)
	}

	warn(args: LoggingArgs): void {
		this.delegate.warn(args)
	}
}
