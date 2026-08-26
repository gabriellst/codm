package channel

import (
	"time"

	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/gateway/mock"
	"template/core-go/registry"
	"template/core-go/repositories"

	"go.uber.org/fx"
)

// Overlays is this bounded context's declared divergence from `real` per
// environment column (registry.App composes base=real + Overlays[env] —
// core/registry/registry.go). Colocated with Module on purpose (spec D3: "cada
// módulo declara o próprio overlay, colocado") — cmd/api/main.go stays a shell
// that only reads CODM_ENV and hands the column to registry.App; it never
// names a channel-specific type.
//
// ONLY the ChannelFactory binding diverges. `real` binds
// whatsapp.NewWhatsmeowChannelFactory (Module, module.go) over a live
// whatsmeow session; both `integration` and `e2e` swap it for the scripted
// mock.MockChannelFactory (services/gateway/mock — spec D5) so gateway-owned
// facts (QR frames, pairing, contacts, inbound messages) travel through the
// SAME production pipelines (mapper.MapEvent, the real DomainEventRepository)
// with no phone and no whatsmeow client involved. Because neither decorator
// below requests the original gateway.ChannelFactory as a dependency, fx never
// invokes whatsapp.NewWhatsmeowChannelFactory — or, transitively,
// whatsapp.NewWhatsmeowStore, its only consumer — under either overlay: the
// whatsmeow adapter is not merely unused, it never runs (fx providers resolve
// on demand).
//
// The store is DELIBERATELY absent from this overlay — swapping it is not a
// code-level divergence at all. db/sqlite.NewSqliteStore (shared.Module)
// always opens cfg.DataDir (CODM_DATA_DIR); a test/e2e run points that env var
// at a scratch dir from the OUTSIDE (spec D10, harness/e2e concern), so there
// is nothing left for an fx-level swap to do here — declaring one would just
// be a second place deciding the same fact.
var Overlays = registry.Overlays{
	registry.EnvIntegration: fx.Decorate(func(domainEventRepo repositories.DomainEventRepository) gateway.ChannelFactory {
		// Zero-value Scenario: connects and pairs immediately, no QR frames, no
		// contacts, no inbound messages (services/gateway/mock/scenario.go
		// docblock) — the honest, unopinionated default for this column. A
		// per-test scripted Scenario is a testenv (plan T5) concern, out of
		// this task's scope fence; Go-internal tests that need one construct
		// their own mock.NewMockChannelFactory(scenario, repo) directly today.
		return mock.NewMockChannelFactory(mock.Scenario{}, domainEventRepo)
	}),
	registry.EnvE2e: fx.Decorate(func(domainEventRepo repositories.DomainEventRepository) gateway.ChannelFactory {
		return mock.NewMockChannelFactory(defaultE2eScenario(), domainEventRepo)
	}),
}

// defaultE2eScenario is the e2e column's roteiro declarado no boot (spec D6 —
// determinism with NO runtime control plane: no endpoint, no config file,
// mutates a Scenario after construction). A plain Go function rather than a
// config field or a scenario file — the SIMPLEST option that still serves the
// QR-pairing e2e spec (plan T10): two QR frames to render, and two contacts so
// ContactStep (plan T9) has real data to show. Grows on demand, same policy as
// MockChannel's no-op methods (services/gateway/mock/channel.go).
//
// AutoPairAfter: 2s — NOT 0 (T10, measured against the real Playwright spec,
// 12-channel-qr.spec.ts). The first QR frame is always returned SYNCHRONOUSLY
// by ConnectChannelHandler (it reads off GetQRChannel before responding), so
// the browser always sees it — but with AutoPairAfter: 0 the pairing clock
// (runPairingClock, mock/channel.go) races that same HTTP response on a
// SEPARATE goroutine and can flip the projected status to CONNECTED before
// ConnectChannelForm's first `useGetChannel` poll ever fires, so the QR
// visibility assertion would be racing an unobservable window rather than
// asserting a real state. 2s gives that poll (POLL_INTERVAL_MS = 2000 in
// ConnectChannelForm) a comfortable window to observe CONNECTING before the
// scenario pairs — a Go-side timing fix, not a spec-side sleep/retry.
func defaultE2eScenario() mock.Scenario {
	return mock.Scenario{
		QRFrames:      []string{"codm-e2e-qr-1", "codm-e2e-qr-2"},
		AutoPairAfter: 2 * time.Second,
		Contacts: []mock.ContactSeed{
			{RemoteID: "5511999990001@s.whatsapp.net", RemoteType: "USER", Name: "Ada Lovelace"},
			{RemoteID: "5511999990002@s.whatsapp.net", RemoteType: "USER", Name: "Alan Turing"},
		},
	}
}
