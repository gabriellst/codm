namespace TemplateContracts;

@doc("A live change to a group's member set. Descends the medscall channel MembershipAction. Lowercase wire values preserved verbatim. Defined-and-dormant: the membership_added / membership_removed wire events model the join/leave facts directly (with `isAdmin`); this enum is the harmonized closed set for the promoted/demoted transitions the source also emits.")
enum MembershipAction {
  JOINED: "joined",
  LEFT: "left",
  PROMOTED: "promoted",
  DEMOTED: "demoted",
}
