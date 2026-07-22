package enums

// RemoteType classifies a channel.remote_created / remote_updated entity.
type RemoteType string

const (
	RemoteTypeUser      RemoteType = "USER"
	RemoteTypeGroup     RemoteType = "GROUP"
	RemoteTypeBroadcast RemoteType = "BROADCAST"
)
