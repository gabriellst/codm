// CONTEXT-ORIGIN: template@v1.9 W1 (2026-07-20) — Tier-3 exemplar, not live code

/**
 * Membership role within a tenant Owner. RESPONSIBLE + ADMIN may manage; MEMBER may view.
 *
 * NOTE (D2 rename): the base template's single-user model calls the owning user the
 * "responsible" party (Owner.responsibleUserId). This multi-user exemplar keeps that
 * vocabulary — the top role is RESPONSIBLE (was OWNER in the pre-split template).
 */
export enum Role {
	RESPONSIBLE = 'RESPONSIBLE',
	ADMIN = 'ADMIN',
	MEMBER = 'MEMBER',
}
