namespace TemplateContracts;

@doc("Why the provider CLI ended a turn — the `stop_reason` carried by the terminal `result` frame of the stream-json transport (GOAL-agent-abstraction §4.2/§4.3). Closed set: `stopReason: string` is forbidden by the same rule as `model: string`. UNKNOWN absorbs a value a future CLI build emits that this contract does not yet name — the runner logs a warn and keeps draining, it never crashes. NOT to be confused with StopKind: this is a TRANSPORT-level turn terminator, not the 'Needs you' domain stop.")
enum AgentStopReason {
  END_TURN: "END_TURN",
  MAX_TOKENS: "MAX_TOKENS",
  STOP_SEQUENCE: "STOP_SEQUENCE",
  TOOL_USE: "TOOL_USE",
  PAUSE_TURN: "PAUSE_TURN",
  REFUSAL: "REFUSAL",
  UNKNOWN: "UNKNOWN",
}
