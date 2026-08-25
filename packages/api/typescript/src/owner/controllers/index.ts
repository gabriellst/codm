export { CreateOwnerController } from './CreateOwner'
export { UpdateOwnerSettingsController } from './UpdateOwnerSettings'
export { DisableOwnerController } from './DisableOwner'
export { EnableOwnerController } from './EnableOwner'
export { SetActiveOwnerController } from './SetActiveOwner'

import { CreateOwnerController } from './CreateOwner'
import { UpdateOwnerSettingsController } from './UpdateOwnerSettings'
import { DisableOwnerController } from './DisableOwner'
import { EnableOwnerController } from './EnableOwner'
import { SetActiveOwnerController } from './SetActiveOwner'

/**
 * O QUE ESTE CONTEXTO MONTA (Decisão 10). Todo contexto expõe o mesmo símbolo, e é isso que deixa o
 * gerador da composição sem ramo — nos 7 mecânicos é o barril inteiro, nos três que carregam
 * condicional a seleção mora aqui, ao lado das classes que ela escolhe.
 */
export default {
	CreateOwnerController,
	UpdateOwnerSettingsController,
	DisableOwnerController,
	EnableOwnerController,
	SetActiveOwnerController,
}
