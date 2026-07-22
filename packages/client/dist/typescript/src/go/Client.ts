// AUTO-GENERATED — do not edit.
import {
	connectChannel,
	listChannels,
	logoutChannel,
	sendMessage,
} from './client/index.ts'

export interface GoClientConfig {
	baseUrl: string
	fetch?: typeof fetch
}

export class GoClient {
	private constructor(private readonly config: GoClientConfig) {}

	static create(config: GoClientConfig): GoClient {
		return new GoClient(config)
	}

	connectChannel(...args: Parameters<typeof connectChannel>): ReturnType<typeof connectChannel> {
		return (connectChannel as (...a: any[]) => ReturnType<typeof connectChannel>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	listChannels(...args: Parameters<typeof listChannels>): ReturnType<typeof listChannels> {
		return (listChannels as (...a: any[]) => ReturnType<typeof listChannels>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	logoutChannel(...args: Parameters<typeof logoutChannel>): ReturnType<typeof logoutChannel> {
		return (logoutChannel as (...a: any[]) => ReturnType<typeof logoutChannel>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}

	sendMessage(...args: Parameters<typeof sendMessage>): ReturnType<typeof sendMessage> {
		return (sendMessage as (...a: any[]) => ReturnType<typeof sendMessage>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}
}
