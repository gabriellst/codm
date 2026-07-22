import "./_base.tsp";

// BK Dash events (iter 41a slice — proves end-to-end codegen for an Order event)
import "./order-updated.tsp";

// BK Dash Sales events (iter 41c Group A — go-worker → TS Sales/Notifications/Analytics)
import "./order-transaction-recorded.tsp";
import "./order-transaction-refunded.tsp";
import "./cart-abandoned.tsp";
import "./cart-linked-to-order.tsp";

// BK Dash Catalog events (iter 41c Group B — go-worker → TS Catalog/Analytics)
import "./product-updated.tsp";
import "./variant-updated.tsp";

// BK Dash Tracking events (iter 41c Group D — go-worker → TS Tracking/Sales)
import "./pixel-event-recorded.tsp";

// BK Dash Integration events (iter 41c Group E — go-worker → TS Integration/Notifications)
import "./integration-handshake-succeeded.tsp";
import "./integration-handshake-failed.tsp";
import "./integration-last-sync-updated.tsp";
import "./marketing-business-account-discovered.tsp";
import "./marketing-ad-account-discovered.tsp";
import "./integration-progress-updated.tsp";

// BK Dash TS-published intra-API events (iter 43-prereq: flagged by P5-SALES + P2-TENANCY re-emit agents)
import "./order-overridden.tsp";
import "./store-member-invited.tsp";

// BK Dash Billing events (iter 91 — P3-BILLING Task 2; TS Billing → TS Tenancy + Notifications)
import "./subscription-quota-updated.tsp";

// BK Dash Identity intra-API events (iter 130-132 — v3 Phase 0; TS Identity → Tenancy + Notifications)
import "./user-registered.tsp";
import "./fcm-token-registered.tsp";
import "./fcm-token-unregistered.tsp";
import "./user-preferences-updated.tsp";

// BK Dash Tenancy intra-API events (iter 133 — v3 Phase 0; TS Tenancy → Integration cascade)
import "./store-disabled.tsp";
import "./store-enabled.tsp";

// BK Dash Catalog intra-API events (iter 134 — v3 Phase 0; TS Catalog → Analytics for COGS cache invalidation)
import "./product-cost-created.tsp";
import "./product-cost-updated.tsp";
import "./product-cost-deleted.tsp";

// BK Dash Marketing intra-API events (iter 135 — v3 Phase 0; TS Marketing → Analytics for ROAS recompute)
import "./campaign-product-binding-created.tsp";
import "./campaign-product-binding-removed.tsp";

// BK Dash Finance intra-API events (iters 136+ — v3 Phase 0; TS Finance → Analytics for profit-margin recompute)
import "./taxes-updated.tsp";
import "./fees-configuration-updated.tsp";
import "./operational-cost-recorded.tsp";
import "./operational-cost-updated.tsp";
import "./operational-cost-deleted.tsp";
import "./operational-cost-status-overridden.tsp";
import "./warranty-reserve-created.tsp";
import "./warranty-reserve-updated.tsp";
import "./warranty-reserve-deleted.tsp";
import "./fx-rate-captured.tsp";

// BK Dash Integration outbound cross-service events (Phase 0 amendments iters 144+;
// TS Integration → Go sync worker via Redis Streams)
import "./integration-activated.tsp";
import "./integration-deactivated.tsp";

// BK Dash Procurement intra-API events (TS Procurement → Go audit consumer)
import "./purchase-order-recorded.tsp";
