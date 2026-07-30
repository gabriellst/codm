// Shared (root) context controllers barrel. The root context carries exactly two entries, and both
// are seams rather than product surface: the PUBLIC readiness endpoint (mounted always — it is what
// the Tauri shell's supervisor probes before any session exists) and the TEST-ONLY gateway ingress,
// mounted exclusively under CODEDM_E2E (shared/index.ts) and refused under production
// (src/boot/assert-e2e-safe.ts). Exported here so the wiring-completeness rail (WIRE-03) sees them
// registered rather than orphaned.
export { HealthController } from './Health'
export { TestIngressController } from './TestIngressController'
