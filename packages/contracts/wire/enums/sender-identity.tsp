namespace TemplateContracts;

@doc("Who an outbound channel message is delivered as. AGENT (labeled agent reply), ROUTER (clarification question, no label), OPERATOR (direct message while paused). Promoted from the modeling's inline senderIdentity union.")
enum SenderIdentity {
  AGENT: "AGENT",
  ROUTER: "ROUTER",
  OPERATOR: "OPERATOR",
}
