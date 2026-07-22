// External (integration-event) handlers for the terminal (agent-runtime) context.
//
// SEAM (phase 6 — BC4 Thread & Routing): the terminal engine is TRIGGERED from here. When BC4
// classifies an inbound message into new work it publishes `integration.message.classified` (and
// `integration.thread.attached` warms indexing); a handler added here will consume those and invoke
// `RunTerminalSession`. Deliberately empty in this phase to keep the classification/routing seam
// clean — the engine (runtime + services + RunTerminalSession) is built and consumed independently.
export {}
