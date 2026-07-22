// Shared (root) context controllers barrel. The root context normally has no HTTP surface; the only
// entry is the TEST-ONLY gateway ingress seam, mounted exclusively under CODEDM_E2E (shared/index.ts)
// and refused under production (src/boot/assert-e2e-safe.ts). Exported here so the wiring-completeness
// rail (WIRE-03) sees it registered rather than orphaned.
export { TestIngressController } from './TestIngressController'
