package enums

import "template/contracts-go/wire"

// MessageAuthor says who WROTE a message — the hand, not the account.
//
// Distinct from `FromMe`, which says whose ACCOUNT a message came from: once this product can send,
// a from-me message is either the owner typing or the product replying, and only this field
// separates them. A consumer that cannot tell them apart answers itself.
//
// Retargeted onto the frozen contracts wire binding — a name/import-only swap.
type MessageAuthor = wire.MessageAuthor

const (
	MessageAuthorHuman  = wire.MessageAuthorHUMAN
	MessageAuthorSystem = wire.MessageAuthorSYSTEM
)
