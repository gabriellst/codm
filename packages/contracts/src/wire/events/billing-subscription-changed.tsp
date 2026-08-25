import "./_base.tsp";

namespace TemplateContracts;

@doc("Published by the TS billing context whenever an owner's subscription posture changes (created / plan changed / canceled / resubscribed / access-affecting settlement). A THIN TRIGGER: no plan or status payload — consumers (quota's GovernResourcesOnSubscriptionChanged) re-derive the effective entitlement from billing's derivers at handling time, so a stale or reordered delivery can never apply stale facts. The owner travels on the envelope `ownerId`.")
model SubscriptionChangedEvent extends IntegrationEvent {
  name: "integration.billing.subscription_changed";
}
