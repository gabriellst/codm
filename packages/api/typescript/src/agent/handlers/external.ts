// External (integration-event) handlers for the terminal (agent-runtime) context.
//
// The severed-saga closer (phase-6b): BC4 Thread & Routing publishes the FROZEN
// `integration.message.classified`; this handler consumes it and invokes `RunIssueTurn` — the
// engine's one runtime trigger. It resolves thread/workspace/provider + the prompt (from the
// transcript read seam), mints the issueId per the classification decision (matched vs new-issue
// slug), and runs the (stubbed-in-tests) runner, whose context-private `terminal.*` facts the
// existing `PublishAgentIntegrationEvents` bridge republishes as `integration.issue.opened` /
// `agent.reply_drafted` / `issue.completed` / `issue.stop_raised`. The classification/routing seam
// stays clean — the engine is triggered by event only, never wired into a use case.
export { RunIssueTurnOnClassification } from './RunIssueTurnOnClassification'
