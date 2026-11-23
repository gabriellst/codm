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

// CODM domain enums (Phase-0 contract lock) — single-sourced here, pgEnum-paired
// (materialized as text columns per the repo's never-pgEnum convention), consumed by
// the TS core + the Go gateway/worker via the generated per-language bindings.
import "./enums/channel-kind.tsp";
import "./enums/channel-status.tsp";
import "./enums/contact-kind.tsp";
// Channel wire surface — full origin-channel port (defined-and-dormant except where the
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
import "./enums/mcp-scope.tsp";
import "./enums/workspace-badge.tsp";
import "./enums/thread-status.tsp";
import "./enums/thread-mode.tsp";
import "./enums/issue-status.tsp";
import "./enums/issue-life-state.tsp";
import "./enums/issue-timeline-item-kind.tsp";
import "./enums/issue-archive-reason.tsp";
import "./enums/issue-control-source.tsp";
import "./enums/irreversible-action-kind.tsp";
import "./enums/regret-window-outcome.tsp";
import "./enums/panel-action-kind.tsp";
import "./enums/panel-action-status.tsp";
import "./enums/panel-action-outcome.tsp";
import "./enums/stop-kind.tsp";
import "./enums/stop-resolution.tsp";
// Fase 3 ("emagrecer o grupo") — the output policy's vocabulary: the level of what an issue says, the
// group's mode, where the policy sent it, what an ask's answer authorizes, and the block-notice cause.
import "./enums/issue-signal-level.tsp";
import "./enums/group-output-mode.tsp";
import "./enums/output-routing.tsp";
import "./enums/ask-effect.tsp";
import "./enums/block-cause.tsp";
import "./enums/ask-answer-kind.tsp";
// The permission regime an agent turn runs under — cross-boundary because the mailbox column, the run
// token claim and every runner's argv table are typed by it.
import "./enums/permission-posture.tsp";
import "./enums/classification-method.tsp";
import "./enums/artifact-kind.tsp";
import "./enums/transcript-kind.tsp";
import "./enums/mailbox-item-kind.tsp";
import "./enums/mailbox-target-kind.tsp";
import "./enums/message-author.tsp";
import "./enums/buffer-size.tsp";
// The weekday axis of a thread LOOP's recurrence — the scheduled prompt the operator configures per
// conversation. Cross-boundary because the same closed set types the DB column, the controller schema
// (and therefore the SDK the console's weekday picker renders from) and the schedule value object.
import "./enums/day-of-week.tsp";
// WHICH SHAPE that recurrence has — a wall clock on chosen weekdays, or a plain "every N minutes".
// Cross-boundary for the same three reasons the weekday axis is: it discriminates the DB row, the
// controller's schedule union (and therefore the SDK member the console validates against), and the
// value object that answers "when is the next run?".
import "./enums/loop-schedule-kind.tsp";
import "./enums/attach-flow-style.tsp";
import "./enums/onboarding-step.tsp";
// Persistence-lane discriminator of the SINGLE shared_outbox table in the shared SQLite
// store. Cross-boundary because BOTH backends write rows into that one table and each
// consumer claims only its own lane — the value is a contract between two processes.
import "./enums/outbox-source.tsp";
// Fase 4 ("vazão") — the quota budget, the task slots, the claim order, batches and the declared publish
// command: who spent quota, which provider window a limit belongs to, a task's priority (and why) and kind
// of work, what a queued item is, where each batch item went, the health badge and why slots are limited,
// and how a publish command ended / what follows it.
import "./enums/usage-role.tsp";
import "./enums/provider-limit-window.tsp";
import "./enums/issue-priority.tsp";
import "./enums/priority-reason.tsp";
import "./enums/issue-work-kind.tsp";
import "./enums/mailbox-claim-class.tsp";
import "./enums/batch-item-destination-kind.tsp";
import "./enums/batch-status.tsp";
import "./enums/quota-state.tsp";
import "./enums/slot-limit.tsp";
import "./enums/publish-run-outcome.tsp";
import "./enums/publish-follow-up-kind.tsp";

import "./events/index.tsp";

@service(#{ title: "Template Contracts" })
namespace TemplateContracts;
