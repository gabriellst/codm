import { injectable } from 'tsyringe-neo'
import { Config } from '@codm/core-typescript'
import { TypescriptCloudClient } from '@codm/client-typescript/typescript-cloud/Client'
import { CloudSession } from '@shared/services/CloudSession'
import { PanelRosterRelay, type PanelCodeDelivery, type PanelRosterBatch } from './PanelRosterRelay'

/** The real pull: `PUT /panel/roster` on the cloud, with the user session this install already holds. */
@injectable()
export class CloudPanelRosterRelay extends PanelRosterRelay {
	private client: TypescriptCloudClient | undefined

	constructor(private readonly session: CloudSession) {
		super()
	}

	async sync(batch: PanelRosterBatch): Promise<PanelCodeDelivery[] | undefined> {
		const headers = this.session.authorizationHeader()
		if (!headers || !Config.env.CLOUD_CONFIGURED) return undefined
		this.client ??= TypescriptCloudClient.create({ baseUrl: Config.env.CODM_CLOUD_URL })
		const response = await this.client.syncPanelRoster(batch, { headers })
		return response.deliveries
	}
}
