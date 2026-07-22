// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/shared/events/channel_event.go
// Harvested verbatim for the event skill exemplar set — do not edit; re-harvest instead.
package events

import "encoding/json"

// ChannelEvent is the discriminated union of all channel-side events.
//
// @union field=Payload discriminatedBy=Name
// @variant Name=channel.channel_created           type=ChannelCreatedPayload
// @variant Name=channel.gateway_connected         type=GatewayConnectedPayload
// @variant Name=channel.gateway_disconnected      type=GatewayDisconnectedPayload
// @variant Name=channel.message_sent              type=ChannelMessageSentPayload
// @variant Name=channel.message_received          type=ChannelMessageReceivedPayload
// @variant Name=channel.message_edited            type=ChannelMessageEditedPayload
// @variant Name=channel.message_deleted           type=ChannelMessageDeletedPayload
// @variant Name=channel.message_delivered         type=ChannelMessageDeliveredPayload
// @variant Name=channel.message_seen              type=ChannelMessageSeenPayload
// @variant Name=channel.remote_pinned             type=ChannelRemotePinnedPayload
// @variant Name=channel.remote_unpinned           type=ChannelRemoteUnpinnedPayload
// @variant Name=channel.remote_archived           type=ChannelRemoteArchivedPayload
// @variant Name=channel.remote_unarchived         type=ChannelRemoteUnarchivedPayload
// @variant Name=channel.remote_muted              type=ChannelRemoteMutedPayload
// @variant Name=channel.remote_unmuted            type=ChannelRemoteUnmutedPayload
// @variant Name=channel.remote_marked_as_unread   type=ChannelRemoteMarkedAsUnreadPayload
// @variant Name=channel.remote_chat_seen          type=ChannelRemoteChatSeenPayload
// @variant Name=channel.remote_updated            type=ChannelRemoteUpdatedPayload
// @variant Name=channel.remote_created            type=ChannelRemoteCreatedPayload
// @variant Name=channel.remote_deleted            type=ChannelRemoteDeletedPayload
// @variant Name=channel.remotes_synced            type=ChannelRemotesSyncedPayload
// @variant Name=channel.messages_synced           type=ChannelMessagesSyncedPayload
// @variant Name=channel.membership_added          type=ChannelMembershipAddedPayload
// @variant Name=channel.membership_removed        type=ChannelMembershipRemovedPayload
type ChannelEvent struct {
	Name    string          `json:"name"`
	Payload json.RawMessage `json:"payload"`
}
