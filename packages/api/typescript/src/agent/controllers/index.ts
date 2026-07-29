export { DetectProvidersController } from './DetectProviders'
export { StreamTerminalSessionController } from './StreamTerminalSession'
// The four operations born in Fase 6 — the doors the MCP tools are generated FROM. Ordinary
// controllers: they enter the SDK and the emitted spec like any other, and the fact that they are
// also tools is declared once, in `mcp/manifest.ts`.
export { CreateIssueController } from './CreateIssue'
export { TransitionIssueStatusController } from './TransitionIssueStatus'
export { RaiseStopController } from './RaiseStop'
export { AskOperatorController } from './AskOperator'
// TEST-ONLY (Fase 7). Exported HERE — the WIRE-03 rail requires every controller class to be in its
// barrel, and a controller hidden from the barrel is indistinguishable from dead wiring — while
// `agent/index.ts` decides whether it is actually MOUNTED. Same shape as `shared`'s gateway
// simulator: the barrel says the class exists, the composition root says when it serves.
export { TestRunIssueTurnController } from './TestRunIssueTurn'
export { ForkIssueController } from './ForkIssue'
