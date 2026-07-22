namespace TemplateContracts;

@doc("Membership role within a Store. OWNER + ADMIN may manage; MEMBER may view + use most features.")
enum Role {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
}
