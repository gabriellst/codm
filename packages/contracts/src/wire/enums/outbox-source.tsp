namespace TemplateContracts;

@doc("Producer lane inside the SINGLE shared_outbox table of the shared SQLite store. Both processes write to the same table, so every row carries the lane that produced it and each consumer claims only its own slice — the Go domain-event dispatcher claims `gateway`, the Go SqlExternalMediator claims `integration`, and the TS daemon claims `api`. Lowercase wire values are frozen: rows discriminated by these exact strings already exist in user databases, so changing a value is a data migration, not cosmetics.")
enum OutboxSource {
  API: "api",
  GATEWAY: "gateway",
  INTEGRATION: "integration",
}
