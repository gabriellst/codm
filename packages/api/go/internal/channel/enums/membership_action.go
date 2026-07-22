package enums

// MembershipAction describes a live change to a group's member set.
type MembershipAction string

const (
	MembershipActionJoined   MembershipAction = "joined"
	MembershipActionLeft     MembershipAction = "left"
	MembershipActionPromoted MembershipAction = "promoted"
	MembershipActionDemoted  MembershipAction = "demoted"
)
