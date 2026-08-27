// External (integration-event) handlers for the issue (BC5 Issue Execution) context.
// Materializes the Issue aggregate + stops from the terminal engine's execution facts
// (integration.issue.opened / completed / stop_raised).
export { MaterializeIssueFromExecution } from './MaterializeIssueFromExecution'
// O stop de execução muda o STATUS da issue. A LINHA do stop continua sendo do `thread` (B4) — este
// handler é o segundo consumidor do mesmo fato, não um segundo publicador dele.
export { MarkIssueNeedsInputFromStop } from './MarkIssueNeedsInputFromStop'
