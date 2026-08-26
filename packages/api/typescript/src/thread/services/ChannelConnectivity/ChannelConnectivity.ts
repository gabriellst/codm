/**
 * BC1 → BC4 read seam: is a channel currently CONNECTED? AttachThread + SendDirectMessage gate on
 * it. Reads the Go-owned `gateway.channels` read-model table directly (a table read, not a
 * cross-context write-model import — the gateway is a separate Go process/context).
 */
export abstract class ChannelConnectivity {
	abstract isConnected(channelId: string): Promise<boolean>
	abstract anyConnected(ownerId: string): Promise<boolean>
}
