package enums

import "template/contracts-go/wire"

// GroupRole is the role of a member inside a group. Retargeted onto the frozen
// contracts wire binding (classification §C.1: exact value-set match, dormant) —
// a name/import-only swap.
type GroupRole = wire.GroupRole

const (
	GroupRoleMember     = wire.GroupRolemember
	GroupRoleAdmin      = wire.GroupRoleadmin
	GroupRoleSuperAdmin = wire.GroupRolesuper_admin
)
