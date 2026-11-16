namespace TemplateContracts;

@doc("Where a pause or resume of an Issue came from. WHATSAPP: a control word (pare, segura, continue…) sent in the conversation with a target (a quoted issue message or one issue key). CONSOLE: the operator's pause/resume buttons on the issue detail.")
enum IssueControlSource {
  WHATSAPP: "WHATSAPP",
  CONSOLE: "CONSOLE",
}
