namespace TemplateContracts;

@doc("Operator composer mode on a Thread. STEER = agents live, typed text is a whisper injected into agent context (never sent to the channel); DIRECT = thread paused, the operator talks directly on the channel as themselves. Promoted from the modeling's inline composerMode (mirrors the SenderIdentity promotion).")
enum ThreadMode {
  STEER: "STEER",
  DIRECT: "DIRECT",
}
