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

import "./events/index.tsp";

@service(#{ title: "Template Contracts" })
namespace TemplateContracts;
