export { ListenEventsController } from './ListenEvents'
export { GetUserInfoController } from './GetUserInfo'
export { GetMyAccountController } from './GetMyAccount'
export { GetHomeDashboardController } from './GetHomeDashboard'
export { GetAttachThreadWizardController } from './GetAttachThreadWizard'
export { GetSettingsController } from './GetSettings'
export { GetOnboardingController } from './GetOnboarding'
export { GetContactAvatarController } from './GetContactAvatar'
export { GetOperatorIdentityController } from './GetOperatorIdentity'
export { CompleteOnboardingController } from './CompleteOnboarding'
export { SaveOnboardingStepController } from './SaveOnboardingStep'

import { ListenEventsController } from './ListenEvents'
import { GetUserInfoController } from './GetUserInfo'
import { GetMyAccountController } from './GetMyAccount'
import { GetHomeDashboardController } from './GetHomeDashboard'
import { GetAttachThreadWizardController } from './GetAttachThreadWizard'
import { GetSettingsController } from './GetSettings'
import { GetOnboardingController } from './GetOnboarding'
import { GetContactAvatarController } from './GetContactAvatar'
import { GetOperatorIdentityController } from './GetOperatorIdentity'
import { CompleteOnboardingController } from './CompleteOnboarding'
import { SaveOnboardingStepController } from './SaveOnboardingStep'

/**
 * O QUE ESTE CONTEXTO MONTA (Decisão 10). Todo contexto expõe o mesmo símbolo, e é isso que deixa o
 * gerador da composição sem ramo — nos 7 mecânicos é o barril inteiro, nos três que carregam
 * condicional a seleção mora aqui, ao lado das classes que ela escolhe.
 */
export default {
	ListenEventsController,
	GetUserInfoController,
	GetMyAccountController,
	GetHomeDashboardController,
	GetAttachThreadWizardController,
	GetSettingsController,
	GetOnboardingController,
	GetContactAvatarController,
	GetOperatorIdentityController,
	CompleteOnboardingController,
	SaveOnboardingStepController,
}
