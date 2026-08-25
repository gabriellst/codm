export { DetectProvidersController } from './DetectProviders'
export { StreamTerminalSessionController } from './StreamTerminalSession'
// The four operations born in Fase 6 — the doors the MCP tools are generated FROM. Ordinary
// controllers: they enter the SDK and the emitted spec like any other, and the fact that they are
// also tools is declared by each class's own `static mcpScopes`.
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
export { SteerIssueTurnController } from './SteerIssueTurn'

import { byEnvironment, Config } from '@codm/core-typescript'
import { McpDoorController } from '../mcp/door'
import { DetectProvidersController } from './DetectProviders'
import { StreamTerminalSessionController } from './StreamTerminalSession'
import { CreateIssueController } from './CreateIssue'
import { TransitionIssueStatusController } from './TransitionIssueStatus'
import { RaiseStopController } from './RaiseStop'
import { AskOperatorController } from './AskOperator'
import { TestRunIssueTurnController } from './TestRunIssueTurn'
import { ForkIssueController } from './ForkIssue'
import { SteerIssueTurnController } from './SteerIssueTurn'

/**
 * O QUE ESTE CONTEXTO MONTA (Decisão 10) — três decisões de montagem, agora num lugar só.
 *
 * Elas moravam em `agent/index.ts`, e desceram para cá porque seleção de controller é assunto de
 * controller — e porque, com todo contexto expondo o mesmo símbolo montado, o gerador da composição
 * não precisa de um ramo para os três casos especiais.
 *
 * 1. PRODUÇÃO — tudo menos o gatilho de teste.
 * 2. CARVE-OUT DE OPENAPI — a porta MCP é uma rota REAL de produção (`/mcp/:scope`), mas emiti-la
 *    renderizaria um endpoint de ferramenta na SDK como hooks React Query sem consumidor. Mesma
 *    disciplina do `ChannelProxy` e do `TestIngressController`. A AC-6.8(d) cobra as DUAS metades —
 *    zero ocorrências no `openapi.json` E um `initialize` de ida e volta de verdade — porque "não
 *    emitido" não é a mesma afirmação que "não implementado".
 * 3. GATILHO DE TESTE — o mesmo carve-out, um ambiente mais apertado: a emissão nunca seleciona
 *    `e2e`, então ele é duplamente ausente da spec, e um boot de produção recusa qualquer ambiente
 *    não-`real`. Existe para uma spec anexar o observador SSE do console ANTES do run que quer ver.
 *
 * O argumento de tipo EXPLÍCITO no `byEnvironment` não é cerimônia: sem ele o TS infere a coluna de
 * `default` e a de `e2e` de forma independente e produz uma união não-sobreposta que falha a
 * atribuição estrutural.
 */
const productionControllers = {
	DetectProvidersController,
	StreamTerminalSessionController,
	CreateIssueController,
	TransitionIssueStatusController,
	RaiseStopController,
	AskOperatorController,
	ForkIssueController,
	SteerIssueTurnController,
}

const runtimeControllers = Config.env.EMIT_OPENAPI === 'true' ? productionControllers : { ...productionControllers, McpDoorController }

export default byEnvironment<
	typeof runtimeControllers | (typeof runtimeControllers & { TestRunIssueTurnController: typeof TestRunIssueTurnController })
>({
	default: runtimeControllers,
	e2e: { ...runtimeControllers, TestRunIssueTurnController },
})
