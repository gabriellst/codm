// AUTO-GENERATED — do not edit.
import { GoClient, type GoClientConfig } from './go/Client'
import { TypescriptClient, type TypescriptClientConfig } from './typescript/Client'

export interface ClientConfig {
	go: GoClientConfig
	typescript: TypescriptClientConfig
}

export class Client {
	readonly go: GoClient
	readonly typescript: TypescriptClient

	private constructor(config: ClientConfig) {
		this.go = GoClient.create(config.go)
		this.typescript = TypescriptClient.create(config.typescript)
	}

	static create(config: ClientConfig): Client {
		return new Client(config)
	}
}
