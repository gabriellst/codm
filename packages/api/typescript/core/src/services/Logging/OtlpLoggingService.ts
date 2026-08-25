import { Logger, SeverityNumber } from '@opentelemetry/api-logs'
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-grpc'
import { CompressionAlgorithm } from '@opentelemetry/otlp-exporter-base'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs'
import { LoggingService, LoggingArgs, LoggingLevel } from './LoggingService'
import { Config } from '../../utils/Config'
import { BaseError } from '../../types/BaseError'
import type { BaseInfrastructureErrors } from '../../errors/codes'
import { injectable } from 'tsyringe-neo'

export interface OtlpLoggingServiceArgs {
	/**
	 * Specific part of the project that this service belongs to.
	 *
	 * @example 'Backend'
	 */
	component: string
	container?: {
		id: string
		image: {
			id: string
			name: string
			tags: string
		}
		name: string
	}
	/** Unique ID for each replica of this service. */
	instanceId?: string
	/** Name of the project that this service belongs to. */
	project: string
	/**
	 * Must follow SemVer.
	 *
	 * @example '1.0.0'
	 */
	version?: string
}

@injectable()
export class OtlpLoggingService extends LoggingService {
	private readonly service
	private readonly logger: Logger

	constructor({ component, container, instanceId = process.env.INSTANCE_ID!, project, version = '1.0.0' }: OtlpLoggingServiceArgs) {
		super()
		this.service = new LoggerProvider({
			resource: resourceFromAttributes({
				...(container && {
					'container.id': container.id,
					'container.image.id': container.image.id,
					'container.image.name': container.image.name,
					'container.image.tags': container.image.tags,
					'container.name': container.name,
				}),
				'service.instance.id': instanceId,
				'service.name': component,
				'service.namespace': project,
				'service.version': version,
			}),
			processors: [
				new BatchLogRecordProcessor(
					new OTLPLogExporter({
						compression: CompressionAlgorithm.GZIP,
						concurrencyLimit: 10,
						url: Config.env.OTEL_COLLECTOR_LOG_URL,
					}),
				),
			],
		})

		this.logger = this.service.getLogger('default')
	}

	private log(level: LoggingLevel, { content, severity }: LoggingArgs): void {
		if (!content) {
			throw new BaseError<BaseInfrastructureErrors>('MISSING_LOG_CONTENT', "You must provide the 'content' argument in order to log.")
		}

		this.logger.emit({
			body: content,
			timestamp: new Date(),
			// Dynamic key: LEVEL + optional severity suffix maps onto SeverityNumber's member names
			// (DEBUG/DEBUG2/…); keyof typeof narrows the computed string to the enum's key set.
			severityNumber: SeverityNumber[`${level.toUpperCase()}${severity === 1 ? '' : severity}` as keyof typeof SeverityNumber],
		})
	}

	debug(args: LoggingArgs): void {
		this.log('debug', args)
	}

	error(args: LoggingArgs): void {
		this.log('error', args)
	}

	info(args: LoggingArgs): void {
		this.log('info', args)
	}

	warn(args: LoggingArgs): void {
		this.log('warn', args)
	}
}
