import { injectable } from 'tsyringe-neo'
import { ChannelConnectivity } from './ChannelConnectivity'

/** Test double — channels are connected by default, since the epoch (no grace after a connection). Tests
 *  exercising CHANNEL_NOT_CONNECTED / NO_CHANNEL_CONNECTED override with a stub returning false; a test of
 *  the grace after a (re)connection sets `since`. */
@injectable()
export class MockChannelConnectivity extends ChannelConnectivity {
	async isConnected(_channelId: string): Promise<boolean> {
		return true
	}

	async anyConnected(_ownerId: string): Promise<boolean> {
		return true
	}

	/** The instant every channel reads as connected since — the epoch unless a test moves it. */
	since: Date | undefined = new Date(0)

	async connectedSince(_channelId: string): Promise<Date | undefined> {
		return this.since
	}
}
