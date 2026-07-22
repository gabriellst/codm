namespace TemplateContracts;

@doc("Type of a content block in a page tree. TOGGLE is the only container type — only a TOGGLE may hold child blocks.")
enum BlockType {
  TEXT: "TEXT",
  HEADING: "HEADING",
  TOGGLE: "TOGGLE",
}
