import { LoggingArgs, LoggingService } from './LoggingService'
import { injectable } from 'tsyringe-neo'

@injectable()
export class MockLoggingService extends LoggingService {
	private logs: Array<{ level: string; args: LoggingArgs; timestamp: Date }> = []

	debug(args: LoggingArgs): void {
		this.logs.push({ level: 'debug', args, timestamp: new Date() })
		console.debug('[DEBUG]', args)
	}

	error(args: LoggingArgs): void {
		this.logs.push({ level: 'error', args, timestamp: new Date() })
		console.error('[ERROR]', args)
	}

	info(args: LoggingArgs): void {
		this.logs.push({ level: 'info', args, timestamp: new Date() })
		console.info('[INFO]', args)
	}

	warn(args: LoggingArgs): void {
		this.logs.push({ level: 'warn', args, timestamp: new Date() })
		console.warn('[WARN]', args)
	}

	// Helper methods for testing
	getLogs(): Array<{ level: string; args: LoggingArgs; timestamp: Date }> {
		return [...this.logs]
	}

	clearLogs(): void {
		this.logs = []
	}

	getLogsByLevel(level: string): Array<{ level: string; args: LoggingArgs; timestamp: Date }> {
		return this.logs.filter(log => log.level === level)
	}
}
