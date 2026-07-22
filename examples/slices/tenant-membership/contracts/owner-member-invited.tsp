// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code
// SOLE copy since W3: the base contracts no longer ship this event (membership is
// exemplar-only per decision D2). A product grafting this exemplar moves this file
// back to packages/contracts/wire/events/ and re-imports it from wire/events/index.tsp
// (see README §"Grafting back in").

import "./_base.tsp";

namespace TemplateContracts;

@doc("Published by the TS Owner context after `InviteMember` creates a pending OwnerInvitation. Notifications consumes to send the invitation email; the invitation URL embeds `token` for redemption via `AcceptInvitation`.")
model OwnerMemberInvitedEvent extends IntegrationEvent {
  name: "integration.shared.owner.member_invited";

  // The Owner (tenant) the invite belongs to travels on the envelope `ownerId`
  // (a reserved IntegrationEvent field), not in the payload.

  @doc("Invitee email — they may not yet have a User account; AcceptInvitation looks up by email and creates/links as needed.")
  email: string;

  @doc("Role to grant on accept — Role (OWNER | ADMIN | MEMBER).")
  role: Role;

  @doc("Random URL-safe token embedded in the invite URL. Single-use; cleared on acceptance.")
  token: string;

  @doc("RFC3339 hard expiry. AcceptInvitation rejects invites past this point with INVITATION_EXPIRED.")
  @encode("rfc3339", string)
  expiresAt: utcDateTime;

  @doc("UserId of the inviter — for the invitation email's \"from\" attribution. Empty string when invite originated from an automated flow (rare today).")
  invitedByUserId: string;
}
