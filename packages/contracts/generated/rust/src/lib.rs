// Committed entrypoint (like go.mod's module line) — src/wire/* is emitted by
// packages/contracts/codegen/emit-wire-rs.ts; this file and src/slot.rs are
// hand-maintained and survive a regen.
pub mod slot;
pub mod wire;
