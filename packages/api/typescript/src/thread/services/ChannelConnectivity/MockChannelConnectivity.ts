import { injectable } from 'tsyringe-neo'
import { ChannelConnectivity } from './ChannelConnectivity'

/** Test double — channels are connected by default. Tests exercising CHANNEL_NOT_CONNECTED /
 *  NO_CHANNEL_CONNECTED override with a stub returning false. */
@injectable()
export class MockChannelConnectivity extends ChannelConnectivity {
	async isConnected(_channelId: string): Promise<boolean> {
		return true
	}

	async anyConnected(_ownerId: string): Promise<boolean> {
		return true
	}
}
