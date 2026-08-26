// Package flows holds END-TO-END journeys through a bounded context: a real fx app booted via
// core/testenv, real HTTP, real SQLite, and the real mapper → outbox → handler → projector chain,
// with no phone involved (the gateway is a scripted mock.Scenario).
//
// ── THIS MIRRORS THE TYPESCRIPT SIDE ON PURPOSE ─────────────────────────────────────────────────
//
// `packages/api/typescript/tests/` has carried `flows/`, `architecture/`, `kernel/`, `spikes/` and
// `support/` for a long time, and `tests/flows/*.flow.test.ts` means exactly what this folder means:
// a test whose subject is a JOURNEY rather than an artifact (inbound-routing, orchestrator-turn,
// issue-resume). Go had no `tests/` tree at all, so the same category had nowhere to live and the
// files sat loose at the context root instead.
//
// One repo, two languages, one mental model: if you know where a flow test lives in TypeScript, you
// now know where it lives in Go. That is worth more than either language's local idiom, because the
// people reading this repo cross the boundary constantly and the architecture is deliberately
// symmetric everywhere else (controllers/, usecases/, entities/, handlers/, repositories/, events/,
// errors/, enums/ are already spelled identically on both sides).
//
// ── WHAT BELONGS HERE, AND WHAT DOES NOT ────────────────────────────────────────────────────────
//
// Here: a test that cannot name ONE artifact as its subject — it boots the context and asserts on
// what came out the far end (a projection row, a shared_outbox row).
//
// Not here: anything that can name its artifact. Those stay colocated as `<name>_test.go` next to
// `<name>.go`, which is the rule for every other test in this module and remains unchanged
// (entities/, handlers/, projections/projectors/, the three repositories/ …).
//
// ── THE GO-IDIOM TRADE-OFF, STATED RATHER THAN HIDDEN ───────────────────────────────────────────
//
// `package channel_test` living beside `package channel` is the idiomatic Go black-box test, and
// leaving that directory gives it up. It is legal because these files only ever used EXPORTED
// identifiers — measured before the move: channel.ConfigService, channel.Module, channel.Overlays,
// and nothing else (the other `channel.*` strings in these files are event names, not Go selectors).
// The `internal/` visibility rule still permits the import: `template/api-go/tests/flows` and
// `template/api-go/internal/channel` share the `template/api-go` root.
//
// A flow spanning two contexts has a home here too, which the previous context-local placement could
// not offer.
package flows
