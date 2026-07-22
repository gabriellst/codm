// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/enums/channel_status.go
// Harvested verbatim for the enum skill exemplar set — do not edit; re-harvest instead.
package enums

type ChannelStatus string

// Values: CREATED CONNECTING CONNECTED DISCONNECTED DELETED
const (
	ChannelStatusCreated      ChannelStatus = "CREATED"
	ChannelStatusConnecting   ChannelStatus = "CONNECTING"
	ChannelStatusConnected    ChannelStatus = "CONNECTED"
	ChannelStatusDisconnected ChannelStatus = "DISCONNECTED"
	ChannelStatusDeleted      ChannelStatus = "DELETED"
)
