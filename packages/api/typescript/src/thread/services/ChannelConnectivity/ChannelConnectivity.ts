/**
 * BC1 → BC4 read seam: is a channel currently CONNECTED? AttachThread + SendDirectMessage gate on
 * it. Reads the Go-owned `gateway.channels` read-model table directly (a table read, not a
 * cross-context write-model import — the gateway is a separate Go process/context).
 */
export abstract class ChannelConnectivity {
	abstract isConnected(channelId: string): Promise<boolean>
	abstract anyConnected(ownerId: string): Promise<boolean>
	/**
	 * Since when THIS daemon has been able to hear the channel — the later of the channel's last connection
	 * and this process's boot; `undefined` while the channel is not connected (fase 3, item 1b). The deadline
	 * sweep waits a grace after it before applying a question's default, so the backlog a reconnect or a
	 * restart replays — which may carry the answer — is ingested first.
	 */
	abstract connectedSince(channelId: string): Promise<Date | undefined>
}
