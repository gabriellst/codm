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
// Channel wire surface — full medscall port (defined-and-dormant except where the
// first gateway phase exercises them). Message payload / receipt / presence / sync enums.
import "./enums/message-type.tsp";
import "./enums/direction.tsp";
import "./enums/presence-type.tsp";
import "./enums/chat-presence-type.tsp";
import "./enums/history-sync-type.tsp";
import "./enums/membership-action.tsp";
import "./enums/group-role.tsp";
import "./enums/special-platform-event-type.tsp";
import "./enums/provider-kind.tsp";
import "./enums/provider-status.tsp";
// Agent-runtime wire vocabulary (GOAL-agent-abstraction §4.2, Fase 1 contract lock). Cross-boundary
// because the agent seam, the SSE frames and the persisted session row all carry them; typed here so
// `model: string` / `stopReason: string` cannot exist at any call site.
import "./enums/agent-model-id.tsp";
import "./enums/agent-stop-reason.tsp";
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
// Persistence-lane discriminator of the SINGLE shared_outbox table in the shared SQLite
// store. Cross-boundary because BOTH backends write rows into that one table and each
// consumer claims only its own lane — the value is a contract between two processes.
import "./enums/outbox-source.tsp";

import "./events/index.tsp";

@service(#{ title: "Template Contracts" })
namespace TemplateContracts;
