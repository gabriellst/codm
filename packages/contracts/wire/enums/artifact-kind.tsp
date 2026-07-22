namespace TemplateContracts;

@doc("Kind of non-code output an agent recorded. IMAGE/FILE reference a local path; LINK references a URL (e.g. a preview deploy).")
enum ArtifactKind {
  IMAGE: "IMAGE",
  FILE: "FILE",
  LINK: "LINK",
}
