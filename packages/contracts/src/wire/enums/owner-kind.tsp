namespace TemplateContracts;

@doc("Discriminator for the tenant aggregate (Owner). Generic, product-agnostic placeholder values — a product specializes them (e.g. CLINIC / SOLO_DOCTOR, STORE / MERCHANT) by re-labelling. The kernel only cares that an ownerId resolves to some kind. Persisted on owner.owners.kind.")
enum OwnerKind {
  ORGANIZATION: "ORGANIZATION",
  INDIVIDUAL: "INDIVIDUAL",
}
