namespace TemplateContracts;

@doc("An action an issue's session can take that cannot be taken back (fase 2, item 3 — janela de arrependimento). The session runs it itself (a shell command inside the provider CLI), so codm recognises it by a declared command pattern and holds it for a few seconds before letting it through. GIT_PUSH: publishing commits to a remote. GIT_FORCE_PUSH: overwriting a remote branch's history. PR_MERGE: merging a pull request. RELEASE: creating a release. PACKAGE_PUBLISH: publishing a package to a registry. DEPLOY: deploying to a hosted environment.")
enum IrreversibleActionKind {
  GIT_PUSH: "GIT_PUSH",
  GIT_FORCE_PUSH: "GIT_FORCE_PUSH",
  PR_MERGE: "PR_MERGE",
  RELEASE: "RELEASE",
  PACKAGE_PUBLISH: "PACKAGE_PUBLISH",
  DEPLOY: "DEPLOY",
}
