import { HttpStatusCode, registerErrorCodes } from '@template/core-typescript'

export type CardErrors =
	| 'CARD_NOT_FOUND'
	| 'CARD_BOARD_NOT_FOUND'
	| 'CARD_LIST_NOT_FOUND'
	| 'CARD_BOARD_ARCHIVED'
	| 'CARD_TITLE_EMPTY'

registerErrorCodes({
	CARD_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	CARD_BOARD_NOT_FOUND: HttpStatusCode.NOT_FOUND,
	CARD_LIST_NOT_FOUND: HttpStatusCode.UNPROCESSABLE_ENTITY,
	CARD_BOARD_ARCHIVED: HttpStatusCode.CONFLICT,
	CARD_TITLE_EMPTY: HttpStatusCode.UNPROCESSABLE_ENTITY,
})
