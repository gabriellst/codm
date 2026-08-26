package enums

import "template/contracts-go/wire"

// MembershipAction describes a live change to a group's member set. Retargeted
// onto the frozen contracts wire binding (classification §C.1: exact value-set
// match, dormant) — a name/import-only swap.
type MembershipAction = wire.MembershipAction

const (
	MembershipActionJoined   = wire.MembershipActionjoined
	MembershipActionLeft     = wire.MembershipActionleft
	MembershipActionPromoted = wire.MembershipActionpromoted
	MembershipActionDemoted  = wire.MembershipActiondemoted
)
