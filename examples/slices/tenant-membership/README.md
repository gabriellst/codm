# Exemplar: Tenant Membership (roles + invitations)

> **CONTEXT-ORIGIN:** `template@v1.9` W1 (2026-07-20) — **Tier-3 exemplar, not live code.**
> Nothing here is wired into DI, compiled by `tsconfig.build.json`, or exercised by the
> test suite. It is a faithful, self-contained reference for one pattern: turning the base
> template's **single-responsible-user** tenant into a **multi-user tenant with roles and
> email invitations**.

## Why this lives here and not in the base

The base `owner` context (`packages/api/typescript/src/owner`) models the tenant as a
**thin `Owner` aggregate**: `id (== ownerId)`, `kind`, and a single `responsibleUserId` — the
one user who answers for the tenant. Authorization in the base is deliberately trivial:
`RequireOwner` checks that `session.ownerId` resolves to an `Owner` whose
`responsibleUserId === user.id`, then stamps `ctx.ownerId`.

Decision **D2** (2026-07-20 de-template reorg, `.plans/2026-07-20-detemplate-reorg.md`) pulled
**membership / roles / invitations** out of the base. Most products never need more than one
responsible user per tenant; those that do can graft this exemplar in. Keeping it out of the
base means the template ships without a `Role` axis, a join table, an invitation lifecycle, or
role-gated middlewares that every new product would otherwise have to understand and prune.

## The `OWNER` → `RESPONSIBLE` rename

The base calls the owning user the **responsible** party (`Owner.responsibleUserId`). To keep
one vocabulary, this exemplar renames the top membership role from `OWNER` to **`RESPONSIBLE`**
(`enums/Role.ts` — `RESPONSIBLE | ADMIN | MEMBER`). Everywhere the pre-split code read
`Role.OWNER` (last-owner guards, `OwnerMembership.forOwner`, count-by-role), it now reads
`Role.RESPONSIBLE`. Error-code identifiers (`CANNOT_REMOVE_LAST_OWNER`, `OWNER_MEMBERSHIP_NOT_FOUND`)
are left verbatim so the diff against the original vertical stays legible.

## What the pattern is

A canonical multi-tenant membership slice, choreographed as:

```
InviteMemberController ─▶ InviteMember (usecase)
      ├─ guards ALREADY_A_MEMBER / INVITATION_ALREADY_PENDING
      ├─ OwnerInvitation.issue() → sha256(token) persisted; plain token only on the event
      └─ raises OwnerMemberInvitedEvent (domain)
            └─ OwnerMemberInvitedHandler → publishes integration.shared.owner.member_invited
                  └─ (a Notifications context consumes it and sends the invite email)

AcceptInvitationController ─▶ AcceptInvitation (usecase)
      ├─ InvitationTokenService.verify() decodes the signed envelope
      ├─ OwnerInvitation.accept() → hash + expiry + single-use guards
      └─ OwnerMembership.forInvitee() persisted, OwnerMemberAddedEvent raised

RemoveMember / ChangeMemberRole ── LAST_RESPONSIBLE guards (countByRole) ── bulk, per-member events
```

Cross-cutting authorization is two middlewares instead of the base's one:
`RequireOwnerMember` (stamps `ctx.membership = { id, userId, role, ownerIds }`) composed with
`RequireOwnerRole([Role.RESPONSIBLE, Role.ADMIN])` for the role allow-list.

## File map

| Area | Files |
|---|---|
| `enums/` | `Role.ts` — the RESPONSIBLE/ADMIN/MEMBER role axis |
| `entities/` | `OwnerMembership.ts` (many-to-many User↔Owner + role), `OwnerInvitation.ts` (token + expiry lifecycle) + unit tests |
| `repositories/` | `OwnerMembershipRepository/` and `OwnerInvitationRepository/` — interface + Drizzle + Mock + repo tests |
| `usecases/` | `InviteMember`, `AcceptInvitation`, `RemoveMember`, `ChangeMemberRole` + tests |
| `controllers/` | HTTP surface for the four commands |
| `events/` | `OwnerMemberInvited/Added/Removed/RoleChanged` domain events |
| `handlers/` | `OwnerMemberInvitedHandler` — bridges the domain event to the wire integration event |
| `middlewares/` | `RequireOwnerMember`, `RequireOwnerRole` + tests |
| `services/` | `InvitationTokenService` (HMAC envelope), `UserDirectoryService` port + `Mock` + `AuthUserDirectoryService` (hydrates member rows from `auth.users`) |
| `contracts/` | `owner-member-invited.tsp` — reference copy of the wire integration event |

## Grafting back in

To make this pattern live in a product:

1. **Schema** — re-add `owner_memberships` and `owner_invitations` to
   `packages/contracts/db/schema/owner.ts` (the shapes match the pre-split tables; see git
   history / migration `0054`) and generate a migration (`bun migrate:create`).
2. **Role enum** — either keep the contracts `Role` enum (`OWNER | ADMIN | MEMBER`) or add a
   `RESPONSIBLE` value; point the entities at whichever you choose (this exemplar uses a local
   `enums/Role.ts` so it stays self-contained).
3. **Code** — copy `entities/`, `repositories/`, `usecases/`, `controllers/`, `events/`,
   `handlers/`, `middlewares/`, `services/` into `src/owner` (or a dedicated context), dropping
   the `CONTEXT-ORIGIN` headers.
4. **DI** — register the membership/invitation repos, `InvitationTokenService`,
   `UserDirectoryService` (Mock for tests, `AuthUserDirectoryService` for integration/real) in
   `owner/registry.ts`, and export the new controllers + `OwnerMemberInvitedHandler` from the
   context barrels so `BoundedContext.create` picks them up.
5. **Authorization** — swap the base `RequireOwner` for `RequireOwnerMember` +
   `RequireOwnerRole([...])` on the controllers that need role gating.
6. **Wire** — the canonical `owner-member-invited.tsp` already lives in
   `packages/contracts/wire/events/`; add a Notifications consumer (`external.ts`) and
   re-run `bun contracts` / `bun sdk`.
