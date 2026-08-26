export { AuthPassthroughController } from './AuthPassthrough'
export { GetSessionController } from './GetSession'
export { UploadAvatarController } from './UploadAvatar'
export { DesktopCallbackController } from './DesktopCallback'
export { SignInSocialController } from './SignInSocial'
export { TestMintSessionController } from './TestMintSession'

import { AuthPassthroughController } from './AuthPassthrough'
import { GetSessionController } from './GetSession'
import { UploadAvatarController } from './UploadAvatar'
import { DesktopCallbackController } from './DesktopCallback'
import { byEnvironment } from '@codm/core-typescript'
import { SignInSocialController } from './SignInSocial'
import { TestMintSessionController } from './TestMintSession'

/**
 * O QUE ESTE CONTEXTO MONTA (Decisão 10). Todo contexto expõe o mesmo símbolo, e é isso que deixa o
 * gerador da composição sem ramo — nos 7 mecânicos é o barril inteiro, nos três que carregam
 * condicional a seleção mora aqui, ao lado das classes que ela escolhe.
 */
/**
 * A costura test-only de identidade, montada SÓ na coluna `e2e` — mesmo despacho DECLARADO que
 * `shared/controllers/index.ts` usa, nunca um `if` sobre flag crua. `byEnvironment` lê a coluna que o
 * `start()` já selecionou, e é seguro no escopo do módulo porque o `server.ts` chama
 * `setBoundedContextEnvironment` ANTES de importar a composição.
 */
const testControllers = byEnvironment<Record<string, typeof TestMintSessionController>>({
	default: {},
	e2e: { TestMintSessionController },
})

export default {
	AuthPassthroughController,
	GetSessionController,
	UploadAvatarController,
	DesktopCallbackController,
	SignInSocialController,
	...testControllers,
}
