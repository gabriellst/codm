export interface LoggingArgs {
	content?: Record<string, any>
	severity?: 1 | 2 | 3 | 4
}
export type LoggingArgsArray = [a?: Record<string, any> | string, b?: string]

export type LoggingLevel = 'debug' | 'error' | 'info' | 'warn'

export abstract class LoggingService {
	abstract debug(args: LoggingArgs): void
	abstract error(args: LoggingArgs): void
	abstract info(args: LoggingArgs): void
	abstract warn(args: LoggingArgs): void
}
