/**
 * The polarity of a BARE answer typed in the group (fase 3, item 3) — a whole message that is only "sim"
 * or "não" (and their spellings, `BARE_ANSWERS`). Context-local: never persisted, never on the wire.
 */
export enum BareAnswer {
	YES = 'YES',
	NO = 'NO',
}
