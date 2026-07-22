// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/channel/projections/channel.go
// Harvested verbatim for the projection skill exemplar set — do not edit; re-harvest instead.
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
