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
