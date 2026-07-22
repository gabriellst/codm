import "@typespec/openapi";
import "@typespec/openapi3";

// Generic, domain-agnostic enums shared across the kept SaaS-infra contexts
// (shared / auth / identity / tenancy / notifications / ui).

// Locale / geography
import "./enums/currency-code.tsp";
import "./enums/language.tsp";
import "./enums/timezone.tsp";

// Tenancy / identity
import "./enums/role.tsp";
import "./enums/owner-kind.tsp";
import "./enums/fcm-platform.tsp";

// Notifications
import "./enums/notification-category.tsp";
import "./enums/notification-origin.tsp";
import "./enums/notification-channel.tsp";

// Billing / plans
import "./enums/plan-tier.tsp";
import "./enums/plan-period.tsp";
import "./enums/plan-name.tsp";

// Billing / gateways + lifecycle
import "./enums/billing-platform.tsp";
import "./enums/charge-status.tsp";
import "./enums/checkout-intent.tsp";
import "./enums/checkout-session-status.tsp";
import "./enums/credit-note-reason.tsp";
import "./enums/credit-note-status.tsp";
import "./enums/decline-reason.tsp";
import "./enums/dispute-status.tsp";
import "./enums/payment-method-status.tsp";
import "./enums/payment-method-type.tsp";
import "./enums/subscription-status.tsp";

// Quota
import "./enums/quota-key.tsp";

import "./events/index.tsp";

@service(#{ title: "Template Contracts" })
namespace TemplateContracts;
