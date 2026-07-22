namespace TemplateContracts;

@doc("The kind of change that produced a PageContentChanged event.")
enum PageChangeKind {
  PAGE_CREATED: "PAGE_CREATED",
  BLOCK_ADDED: "BLOCK_ADDED",
  BLOCK_EDITED: "BLOCK_EDITED",
}
