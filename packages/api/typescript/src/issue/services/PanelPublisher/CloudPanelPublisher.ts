import { injectable } from 'tsyringe-neo'
import { Config } from '@codm/core-typescript'
import { TypescriptCloudClient } from '@codm/client-typescript/typescript-cloud/Client'
import { CloudSession } from '@shared/services/CloudSession'
import { PanelPublisher, type PanelBatch } from './PanelPublisher'

/**
 * The real push: `PUT /panel/sync` and `POST /panel/groups/:threadId/rotate` on the cloud, through the
 * generated cloud client, authenticated with the user session this install already holds.
 */
@injectable()
export class CloudPanelPublisher extends PanelPublisher {
	private client: TypescriptCloudClient | undefined

	constructor(private readonly session: CloudSession) {
		super()
	}

	protected async send(batch: PanelBatch): Promise<{ threadId: string; token: string }[] | undefined> {
		const headers = this.session.authorizationHeader()
		if (!headers || !Config.env.CLOUD_CONFIGURED) return undefined
		const response = await this.cloud().syncPanel(batch, { headers })
		return response.groups
	}

	protected async sendRotate(threadId: string): Promise<string | undefined> {
		const headers = this.session.authorizationHeader()
		if (!headers || !Config.env.CLOUD_CONFIGURED) return undefined
		const response = await this.cloud().rotatePanelLink(threadId, { headers })
		return response.token
	}

	protected cloudOrigin(): string {
		return Config.env.CODM_CLOUD_URL
	}

	private cloud(): TypescriptCloudClient {
		this.client ??= TypescriptCloudClient.create({ baseUrl: Config.env.CODM_CLOUD_URL })
		return this.client
	}
}
