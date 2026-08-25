// External (integration-event) handlers for the issue (BC5 Issue Execution) context.
// Materializes the Issue aggregate + stops from the terminal engine's execution facts
// (integration.issue.opened / completed / stop_raised).
export { MaterializeIssueFromExecution } from './MaterializeIssueFromExecution'
