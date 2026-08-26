export { AttachThreadController } from './AttachThread'
export { DeleteThreadController } from './DeleteThread'
export { ConfigureContextBufferController } from './ConfigureContextBuffer'
export { ConfigureMentionGateController } from './ConfigureMentionGate'
export { ConfigureModelController } from './ConfigureModel'
export { ConfigurePromptController } from './ConfigurePrompt'
export { ConfigureThinkingIndicatorController } from './ConfigureThinkingIndicator'
export { ConfigureReactionsController } from './ConfigureReactions'
export { ConfigureStreamingController } from './ConfigureStreaming'
export { GetSessionChatController } from './GetSessionChat'
export { GetThreadSettingsController } from './GetThreadSettings'
export { PauseThreadController } from './PauseThread'
export { ResumeThreadController } from './ResumeThread'
export { SendDirectMessageController } from './SendDirectMessage'
export { SetParticipantInvocationController } from './SetParticipantInvocation'
export { SteerThreadController } from './SteerThread'
export { GetNeedsYouPanelController } from './GetNeedsYouPanel'
export { ResolveStopController } from './ResolveStop'
export { UpdateStopCriteriaController } from './UpdateStopCriteria'
// Thread LOOPS — the recurring scheduled whisper, five doors in one file (T11 / C21-C24).
export {
	ListThreadLoopsController,
	CreateThreadLoopController,
	UpdateThreadLoopController,
	SetThreadLoopEnabledController,
	DeleteThreadLoopController,
} from './ThreadLoops'
// TEST-ONLY (thinking-indicator spec, T5). Exported HERE — same discipline as `agent/controllers`'
// `TestRunIssueTurnController`: the WIRE-03 rail requires every controller class to be in its barrel,
// while THIS file's `byEnvironment` default export decides whether it is actually MOUNTED.
export { TestReadChannelSenderController } from './TestReadChannelSender'

import { byEnvironment } from '@codm/core-typescript'
import { AttachThreadController } from './AttachThread'
import { DeleteThreadController } from './DeleteThread'
import { ConfigureContextBufferController } from './ConfigureContextBuffer'
import { ConfigureMentionGateController } from './ConfigureMentionGate'
import { ConfigureModelController } from './ConfigureModel'
import { ConfigurePromptController } from './ConfigurePrompt'
import { ConfigureThinkingIndicatorController } from './ConfigureThinkingIndicator'
import { ConfigureReactionsController } from './ConfigureReactions'
import { ConfigureStreamingController } from './ConfigureStreaming'
import { GetSessionChatController } from './GetSessionChat'
import { GetThreadSettingsController } from './GetThreadSettings'
import { PauseThreadController } from './PauseThread'
import { ResumeThreadController } from './ResumeThread'
import { SendDirectMessageController } from './SendDirectMessage'
import { SetParticipantInvocationController } from './SetParticipantInvocation'
import { SteerThreadController } from './SteerThread'
import { GetNeedsYouPanelController } from './GetNeedsYouPanel'
import { ResolveStopController } from './ResolveStop'
import { UpdateStopCriteriaController } from './UpdateStopCriteria'
import {
	ListThreadLoopsController,
	CreateThreadLoopController,
	UpdateThreadLoopController,
	SetThreadLoopEnabledController,
	DeleteThreadLoopController,
} from './ThreadLoops'
import { TestReadChannelSenderController } from './TestReadChannelSender'

/**
 * O QUE ESTE CONTEXTO MONTA (Decisão 10). Todo contexto expõe o mesmo símbolo, e é isso que deixa o
 * gerador da composição sem ramo — nos 7 mecânicos é o barril inteiro, nos três que carregam
 * condicional a seleção mora aqui, ao lado das classes que ela escolhe.
 *
 * PRODUÇÃO — tudo menos a porta de teste. GATILHO DE TESTE — o mesmo carve-out do `TestIngressController`
 * (`shared/controllers/index.ts`) e do `TestRunIssueTurnController` (`agent/controllers/index.ts`):
 * `TestReadChannelSenderController` só monta sob `e2e`, nunca aparece na emissão OpenAPI (que nunca
 * seleciona `e2e`) e é recusado sob NODE_ENV=production (`setBoundedContextEnvironment`).
 */
const productionControllers = {
	AttachThreadController,
	DeleteThreadController,
	ConfigureContextBufferController,
	ConfigureMentionGateController,
	ConfigureModelController,
	ConfigurePromptController,
	ConfigureThinkingIndicatorController,
	ConfigureReactionsController,
	ConfigureStreamingController,
	GetSessionChatController,
	GetThreadSettingsController,
	PauseThreadController,
	ResumeThreadController,
	SendDirectMessageController,
	SetParticipantInvocationController,
	SteerThreadController,
	GetNeedsYouPanelController,
	ResolveStopController,
	UpdateStopCriteriaController,
	ListThreadLoopsController,
	CreateThreadLoopController,
	UpdateThreadLoopController,
	SetThreadLoopEnabledController,
	DeleteThreadLoopController,
}

export default byEnvironment<
	| typeof productionControllers
	| (typeof productionControllers & { TestReadChannelSenderController: typeof TestReadChannelSenderController })
>({
	default: productionControllers,
	e2e: { ...productionControllers, TestReadChannelSenderController },
})
