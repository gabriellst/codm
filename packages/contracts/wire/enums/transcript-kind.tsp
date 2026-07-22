namespace TemplateContracts;

@doc("Kind of transcript entry in a thread conversation. CONTACT (inbound), AGENT (agent reply), OPERATOR_DIRECT (operator spoke directly while paused), WHISPER (in-app steer, never sent to channel), ACTION (router/system audit line). Pattern from whatscode ChatEvent subtypes.")
enum TranscriptKind {
  CONTACT: "CONTACT",
  AGENT: "AGENT",
  OPERATOR_DIRECT: "OPERATOR_DIRECT",
  WHISPER: "WHISPER",
  ACTION: "ACTION",
}
