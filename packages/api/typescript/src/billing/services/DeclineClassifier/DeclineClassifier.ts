import { injectable } from 'tsyringe-neo'
import { DeclineReason } from '@template/contracts-typescript/wire/enums'

export enum DeclineClass {
	SOFT = 'SOFT',
	HARD = 'HARD',
}

// Hard = permanente (o cartão não vai passar off-session até o dono agir): expirado, ou 3DS/auth
// exigido (uma MIT off-session não autentica). Todo o resto é soft (temporário → retenta). Ausente
// = soft cauteloso. Extensível: novo DeclineReason cai em soft por default; mova para HARD_DECLINES
// quando for permanente.
const HARD_DECLINES: ReadonlySet<DeclineReason> = new Set([DeclineReason.CARD_EXPIRED, DeclineReason.AUTHENTICATION_REQUIRED])

@injectable()
export class DeclineClassifier {
	classify(declineCode?: DeclineReason): DeclineClass {
		return declineCode && HARD_DECLINES.has(declineCode) ? DeclineClass.HARD : DeclineClass.SOFT
	}
}
