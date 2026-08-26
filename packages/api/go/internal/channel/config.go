package channel

import (
	"template/contracts-go/wire"
	"template/core-go/config"
)

// ConfigService is this bounded context's declared identity for
// core/config.Load: the env-var prefix every core-owned key resolves under
// first (so e.g. the port key resolves under this prefix before falling
// back to its bare name), this service's own default for the outbox
// event-group id, and which shared_outbox lanes this service claims from —
// the "gateway" domain-event lane for its own SqliteOutboxDispatcher, the
// "integration" lane for its ExternalMediator. Colocated with the rest of
// channel's declared divergence (overlay.go) — core never hardcodes any of
// these values itself (spec T11 AC-1: core-go must stay reusable by any Go
// service). Both cmd/api/main.go and the Go-internal test harness
// (qr_pairing_test.go) compose against this SAME value, so the service's
// identity is declared exactly once.
var ConfigService = config.Service{
	Prefix:                  "CHANNEL",
	EventGroupIDDefault:     "codm-gateway",
	OutboxSource:            wire.OutboxSourcegateway,
	IntegrationOutboxSource: wire.OutboxSourceintegration,
}
