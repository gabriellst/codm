import "./_base.tsp";

namespace TemplateContracts;

@doc("BC5 Issue Execution -> BC6 Artifact Registry. A non-code output (image/file/link) was produced by an agent. The draft's payload field `name` is renamed `artifactName` to avoid colliding with the envelope `name` discriminator.")
model ArtifactRecordedEvent extends IntegrationEvent {
  name: "integration.artifact.recorded";
  artifactId: string;
  threadId: string;
  issueId?: string;
  kind: ArtifactKind;
  artifactName: string;
}
