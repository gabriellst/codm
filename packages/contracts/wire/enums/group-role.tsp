namespace TemplateContracts;

@doc("Role of a member inside a group. Descends the medscall channel GroupRole. Lowercase wire values preserved verbatim. Defined-and-dormant: the gateway.remote_memberships projection stores the boolean `is_admin` today; this enum is the harmonized closed set for consumers that need the full member/admin/super_admin gradient.")
enum GroupRole {
  MEMBER: "member",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
}
