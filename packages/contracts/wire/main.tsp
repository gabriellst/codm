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

// CodeDM domain enums (Phase-0 contract lock) — single-sourced here, pgEnum-paired
// (materialized as text columns per the repo's never-pgEnum convention), consumed by
// the TS core + the Go gateway/worker via the generated per-language bindings.
import "./enums/channel-kind.tsp";
import "./enums/channel-status.tsp";
import "./enums/contact-kind.tsp";
import "./enums/provider-kind.tsp";
import "./enums/provider-status.tsp";
import "./enums/workspace-badge.tsp";
import "./enums/thread-status.tsp";
import "./enums/thread-mode.tsp";
import "./enums/issue-status.tsp";
import "./enums/issue-archive-reason.tsp";
import "./enums/stop-kind.tsp";
import "./enums/stop-resolution.tsp";
import "./enums/classification-method.tsp";
import "./enums/artifact-kind.tsp";
import "./enums/transcript-kind.tsp";
import "./enums/sender-identity.tsp";
import "./enums/buffer-size.tsp";
import "./enums/attach-flow-style.tsp";

import "./events/index.tsp";

@service(#{ title: "Template Contracts" })
namespace TemplateContracts;
