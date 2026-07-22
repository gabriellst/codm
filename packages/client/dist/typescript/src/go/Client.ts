// AUTO-GENERATED — do not edit.
import {
	listActivity,
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

	listActivity(...args: Parameters<typeof listActivity>): ReturnType<typeof listActivity> {
		return (listActivity as (...a: any[]) => ReturnType<typeof listActivity>)(...args.slice(0, -1), { baseURL: this.config.baseUrl, client: this.config.fetch, ...(args.at(-1) as object | undefined) })
	}
}
