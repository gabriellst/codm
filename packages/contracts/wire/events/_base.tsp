namespace TemplateContracts;

@discriminator("name")
@doc("Base envelope for all cross-service integration events.")
model IntegrationEvent {
  @doc("Discriminator: dotted event name.")
  name: string;

  @doc("UUID of the originating aggregate or entity.")
  entityId: string;

  @doc("Tenant or owner this event belongs to.")
  ownerId: string;

  @doc("RFC3339 timestamp when the event occurred.")
  @encode("rfc3339", string)
  occurredAt: utcDateTime;
}
