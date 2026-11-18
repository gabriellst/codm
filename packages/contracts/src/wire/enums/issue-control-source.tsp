namespace TemplateContracts;

@doc("Where a pause or resume of an Issue came from. WHATSAPP: a control word (pare, segura, continue…) sent in the conversation with a target (a quoted issue message or one issue key). CONSOLE: the operator's pause/resume buttons on the issue detail. PANEL: a person identified on the group's cloud panel (fase 2, item 6b), executed by the daemon as that member.")
enum IssueControlSource {
  WHATSAPP: "WHATSAPP",
  CONSOLE: "CONSOLE",
  PANEL: "PANEL",
}
