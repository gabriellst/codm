// AUTO-GENERATED — do not edit.
import { GoClient, type GoClientConfig } from './go/Client'
import { TypescriptClient, type TypescriptClientConfig } from './typescript/Client'
import { TypescriptCloudClient, type TypescriptCloudClientConfig } from './typescript-cloud/Client'

export interface ClientConfig {
	go: GoClientConfig
	typescript: TypescriptClientConfig
	typescript_cloud: TypescriptCloudClientConfig
}

export class Client {
	readonly go: GoClient
	readonly typescript: TypescriptClient
	readonly typescript_cloud: TypescriptCloudClient

	private constructor(config: ClientConfig) {
		this.go = GoClient.create(config.go)
		this.typescript = TypescriptClient.create(config.typescript)
		this.typescript_cloud = TypescriptCloudClient.create(config.typescript_cloud)
	}

	static create(config: ClientConfig): Client {
		return new Client(config)
	}
}
