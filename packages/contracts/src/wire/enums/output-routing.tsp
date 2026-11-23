namespace TemplateContracts;

@doc("Where the output policy sent one thing an issue said (fase 3, item 2), recorded on its transcript entry. GROUP: its own message in the group. DIGEST: one message together with the other questions/previews for the same person within the digest window. PANEL: timeline/panel only — never sent to the channel.")
enum OutputRouting {
  GROUP: "GROUP",
  DIGEST: "DIGEST",
  PANEL: "PANEL",
}
