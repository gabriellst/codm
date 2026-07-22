import "@typespec/openapi";
import "@typespec/openapi3";

// BK Dash enums (iter 41a slice — proves the codegen pipeline before the bulk port)
import "./enums/currency-code.tsp";
import "./enums/payment-status.tsp";
import "./enums/sales-platform.tsp";

// BK Dash enums (iter 41b bulk — spec §7.0 organized by BC group)
// Identity
import "./enums/role.tsp";
import "./enums/notification-currency-mode.tsp";
import "./enums/fcm-platform.tsp";
// Integration
import "./enums/store-integration-type.tsp";
import "./enums/checkout-platform.tsp";
import "./enums/marketing-platform.tsp";
import "./enums/connection-mode.tsp";
import "./enums/infoproduct-platform.tsp";
// Sales
import "./enums/payment-method.tsp";
import "./enums/payment-gateway.tsp";
import "./enums/transaction-kind.tsp";
import "./enums/transaction-status.tsp";
import "./enums/order-transaction-fee-type.tsp";
import "./enums/dispute-status.tsp";
// Catalog
import "./enums/product-status.tsp";
import "./enums/product-cost-type.tsp";
import "./enums/quantity-modifier.tsp";
// Marketing
import "./enums/campaign-status.tsp";
import "./enums/ad-spend-group-by.tsp";
import "./enums/business-account-status.tsp";
import "./enums/ad-account-status.tsp";
import "./enums/ad-attribution.tsp";
import "./enums/ad-tree-level.tsp";
import "./enums/marketing-profile-status.tsp";
// Tracking
import "./enums/pixel-event-type.tsp";
// Finance
import "./enums/tax-type.tsp";
import "./enums/tax-deduction-type.tsp";
import "./enums/operational-cost-category.tsp";
import "./enums/operational-cost-recurrency.tsp";
import "./enums/operational-cost-payment-status.tsp";
import "./enums/operational-cost-flow.tsp";
import "./enums/shipping-cost-mode.tsp";
import "./enums/warranty-period.tsp";
// Analytics
import "./enums/goal-type.tsp";
import "./enums/timezone-mode.tsp";
import "./enums/cost-kind.tsp";
import "./enums/day-of-week.tsp";
import "./enums/day-period.tsp";
import "./enums/time-frequency.tsp";
import "./enums/tenancy-scope.tsp";
import "./enums/dashboard-mode.tsp";
// Identity / Generic
import "./enums/language.tsp";
import "./enums/country.tsp";
import "./enums/timezone.tsp";
// Notifications
import "./enums/notification-category.tsp";
import "./enums/notification-origin.tsp";
import "./enums/notification-channel.tsp";
// Billing
import "./enums/plan-tier.tsp";
import "./enums/plan-period.tsp";
import "./enums/billing-platform.tsp";
import "./enums/plan-feature.tsp";
import "./enums/subscription-event-type.tsp";
// Generic
// Sync
import "./enums/sync-event-name.tsp";
// Notion app
import "./enums/block-type.tsp";
import "./enums/page-change-kind.tsp";

import "./events/index.tsp";

@service(#{ title: "Template Contracts" })
namespace TemplateContracts;

@doc("A platform identifier that may belong to any integration category — used by cross-category surfaces (sync trigger, integration activation) where the specific category is not fixed.")
union Platform {
  SalesPlatform,
  CheckoutPlatform,
  PaymentGateway,
  MarketingPlatform,
  InfoproductPlatform,
}
