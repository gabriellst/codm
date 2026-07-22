package enums

// GroupRole is the role of a member inside a group.
type GroupRole string

const (
	GroupRoleMember     GroupRole = "member"
	GroupRoleAdmin      GroupRole = "admin"
	GroupRoleSuperAdmin GroupRole = "super_admin"
)
