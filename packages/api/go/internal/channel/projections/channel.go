package projections

import "time"

// Channel is a pure read-model record that mirrors the channels projection
// table. It is written by the channelProjector and read directly by query
// handlers. No domain logic, no invariants, no events.
type Channel struct {
	ID             string     `db:"id"`
	OwnerID        string     `db:"owner_id"`
	Platform       string     `db:"platform"`
	Status         string     `db:"status"`
	ConnectedAt    *time.Time `db:"connected_at"`
	DisconnectedAt *time.Time `db:"disconnected_at"`
	CreatedAt      time.Time  `db:"created_at"`
	UpdatedAt      time.Time  `db:"updated_at"`
	Version        int64      `db:"version"`
}
