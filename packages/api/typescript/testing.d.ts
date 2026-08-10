// packages/api/typescript/testing.d.ts — COMMITTED, HAND-WRITTEN structural contract for the
// `/testing` subpath (spec Decision 9, T7 FALLBACK).
//
// THE SPIKE (recorded verdict): `dts-bundle-generator` was tried first, per spec Decision 9's
// preferred path (`bun add -d dts-bundle-generator`, `node_modules/.bin/dts-bundle-generator -o
// … tests/support/testing.ts`, both with an explicit `--project tsconfig.json` and with default
// discovery). It CHOKED — not on decorators, but on this project's `moduleResolution: "bundler"` +
// extensionless relative imports (`@tsconfig/bun`'s suggested config, used repo-wide): every
// barrel it needed to descend into (`core/src/index.ts`, `packages/contracts/db/schema/index.ts`,
// `packages/contracts/generated/typescript/src/wire/enums/index.ts`) failed with
// `TS2307: Cannot find module './X' or its corresponding type declarations` for every single
// extensionless specifier, because dts-bundle-generator's internal compiler host does not resolve
// them under `bundler` resolution the way `tsc`'s own CLI does. This is a REPO-WIDE resolution
// convention (every workspace omits extensions), not something fixable from this one file or a
// generator flag — so per spec Decision 9, this is the FALLBACK path: a hand-written, self-
// contained structural contract instead of a generated one.
//
// WHY THIS STAYS HONEST: the "minimal seed surface" below is not the full domain entity shape
// (User/Owner/Workspace/Thread/Issue/UserProfile all carry far more — see their `*Schema` in
// `src/**/entities/*.ts`) — it is the READ surface every `AggregateRoot`-backed given exposes via
// `BaseEntity.id: Id` (`core/src/entities/BaseEntity.ts`), which is the ONLY field any known
// consumer (the react harness's `givenThread(...).id.value` call sites, pre-T8) navigates on a
// seeded aggregate today. A consumer that needs another field gets a `tsc` error pointing exactly
// at this file — the fix is widening the type here, never casting around it at the call site.
//
// ONE non-flat dependency, DELIBERATE: enum-shaped override fields (`kind`, `platform`, `provider`,
// …) import the REAL wire enums from `@codm/contracts-typescript/wire/enums` rather than hand-
// rolled string-literal unions. A literal union LOOKS self-contained but is a forked parallel
// schema (Non-Negotiable #2 — "never fork a parallel schema; compose instead") that also fails to
// type-check honestly: TypeScript treats a `string` enum as nominal, so a bare `'ORGANIZATION'`
// literal is not assignable where `OwnerKind` is expected — the freshness gate at the bottom of
// `tests/support/testing.ts` (`satisfies TestingSurface`) would not even compile with literals,
// let alone stay falsifiable. `@codm/contracts-typescript` is a committed, generated workspace
// package (`packages/contracts/generated/typescript`), not backend `src` — but it is NOT currently
// a declared dependency of `packages/app/react`. T8 (which consumes this file) needs to add it
// there; flagged in the T7 report as a required follow-up, not a silent assumption.
//
// THE FRESHNESS GATE (no byte-diff generator to run, so no `bun testing:check-dts` regenerate-and-
// compare): `tests/support/testing.ts` ends with a `satisfies TestingSurface` check against the
// types below. If a given's signature drifts from this file, backend `tsc` fails AT THAT LINE —
// FALSIFIED per the Gate (see the T7 report): narrowing a given's overrides here without touching
// `testing.ts` turns the check red; reverting turns it green again.

import type {
	OwnerKind,
	WorkspaceBadge,
	ContactKind,
	ChannelKind,
	ChannelStatus,
	ProviderKind,
	BufferSize,
	StopKind,
	StopResolution,
	IssueStatus,
} from '@codm/contracts-typescript/wire/enums'

export interface TestBedLike {
	resolve<T>(token: unknown): T
	readonly ownerId: string
}

export interface IntegrationContainer {
	resolve<T>(token: unknown): T
}

export interface IntegrationBackend {
	url: string
	container: IntegrationContainer
	asTestBed(): TestBedLike
	reset(): Promise<void>
	stop(): Promise<void>
}

/** The one field every `AggregateRoot`-backed given exposes that a consumer has ever navigated. */
export interface SeedAggregateRef {
	readonly id: {
		readonly value: string
	}
}

export type SeedUser = SeedAggregateRef
export type SeedAccount = SeedAggregateRef
export type SeedOwner = SeedAggregateRef
export type SeedWorkspace = SeedAggregateRef
export type SeedThread = SeedAggregateRef
export type SeedIssue = SeedAggregateRef
export type SeedUserProfile = SeedAggregateRef

/**
 * Structural match of `core/src/types/BaseEvent.ts` / `BaseDomainEvent.ts`'s PUBLIC surface — both
 * classes carry no private fields (unlike `TestBed`), so this needs no cast bridge in `testing.ts`:
 * any object satisfying this shape structurally satisfies the real `BaseDomainEvent` parameter type.
 */
export interface SeedDomainEvent {
	readonly name: string
	readonly id: string
	readonly time: string
	/**
	 * `object`, not `unknown`: `givenDomainEvent`'s real parameter is `BaseDomainEvent` at its
	 * DEFAULT generic (`typeof BaseDomainEventSchema`, an empty-object payload schema) — TS infers
	 * that as an almost-universal `{}` (accepts any non-nullish value structurally), which is how
	 * real callers pass concrete subclasses with their OWN payload shape (e.g. `OwnerCreatedEvent`'s
	 * `{ ownerId, name }` — see `given/events.test.ts`). `object` is the narrowest type still
	 * assignable into that `{}` slot; `unknown` is too wide (also admits primitives/null/undefined).
	 */
	readonly payload: object
	readonly entityId?: string
	readonly ownerId?: string
	toJSON(): unknown
	serialize(): string
}

export interface SeedStop {
	stopId: string
	ownerId: string
	issueId?: string
	threadId: string
	kind: StopKind
	title: string
	detail: string
	raisedAt: Date
	resolution?: StopResolution
	resolvedAt?: Date
}

export interface SeedParticipant {
	participantId: string
	name: string
	source: string
	canInvoke: boolean
}

export interface ChannelOverrides {
	channelId?: string
	ownerId?: string
	platform?: ChannelKind
	name?: string
	status?: ChannelStatus
	ownerRemoteId?: string
	updatedAt?: Date
}

export interface RemoteOverrides {
	channelId: string
	remoteId: string
	name: string
	type?: ContactKind
	platform?: ChannelKind
	avatarUrl?: string
}

export interface RemoteMembershipOverrides {
	channelId: string
	groupId: string
	memberId: string
	isAdmin?: boolean
}

export function startIntegrationBackend(options?: { ownerId?: string }): Promise<IntegrationBackend>

export function givenUser(
	testBed: TestBedLike,
	overrides?: Partial<{ name: string | null; email: string; emailVerified: boolean; image: string | null }>,
): Promise<SeedUser>

export function givenAccount(
	testBed: TestBedLike,
	userId: string,
	overrides?: Partial<{ accountId: string; providerId: string }>,
): Promise<SeedAccount>

export function givenUserWithAccount(
	testBed: TestBedLike,
	overrides?: {
		user?: Partial<{ name: string | null; email: string; emailVerified: boolean; image: string | null }>
		account?: Partial<{ accountId: string; providerId: string }>
	},
): Promise<{ user: SeedUser; account: SeedAccount }>

export function givenActiveSession(testBed: TestBedLike, userId: string): Promise<{ sessionId: string; token: string }>

export function givenOwner(
	testBed: TestBedLike,
	overrides?: Partial<{
		name: string
		kind: OwnerKind
		responsibleUserId: string
		timezone: string
		pictureUrl: string
	}>,
): Promise<SeedOwner>

export function givenOwnerWithResponsible(
	testBed: TestBedLike,
	overrides?: {
		user?: Parameters<typeof givenUserWithAccount>[1]
		owner?: Parameters<typeof givenOwner>[1]
	},
): Promise<{ user: SeedUser; account: SeedAccount; owner: SeedOwner }>

export function givenWorkspace(
	testBed: TestBedLike,
	overrides?: Partial<{ ownerId: string; path: string; badges: WorkspaceBadge[] }>,
): Promise<SeedWorkspace>

export const GIVEN_MENTION_TAG: string

export function givenThread(
	testBed: TestBedLike,
	overrides?: Partial<{
		ownerId: string
		channelId: string
		contactExternalId: string
		contactDisplayName: string
		contactKind: ContactKind
		workspaceId: string
		providers: ProviderKind[]
		bufferSize: BufferSize
		mentionTag: string
		participants: SeedParticipant[]
	}>,
): Promise<SeedThread>

export function givenChannel(testBed: TestBedLike, overrides?: ChannelOverrides): Promise<{ channelId: string }>

export function givenRemote(testBed: TestBedLike, overrides: RemoteOverrides): Promise<RemoteOverrides>

export function givenRemoteMembership(testBed: TestBedLike, overrides: RemoteMembershipOverrides): Promise<RemoteMembershipOverrides>

export function givenIssue(
	testBed: TestBedLike,
	overrides?: Partial<{
		ownerId: string
		threadId: string
		key: string
		title: string
		provider: ProviderKind
		status: IssueStatus
		completedAt: Date
	}>,
): Promise<SeedIssue>

export function givenStop(
	testBed: TestBedLike,
	overrides?: Partial<{
		stopId: string
		ownerId: string
		issueId: string
		threadId: string
		kind: StopKind
		title: string
		detail: string
	}>,
): Promise<SeedStop>

export function givenDomainEvent(testBed: TestBedLike, event: SeedDomainEvent): Promise<void>

export function givenUserProfile(
	testBed: TestBedLike,
	overrides?: Partial<{ userId: string; timezone: string; language: string }>,
): Promise<SeedUserProfile>

/**
 * The AGGREGATED shape `tests/support/testing.ts` checks itself against via `satisfies` — the
 * freshness gate (see the docblock above). Kept as one object type so a single `satisfies` line
 * in `testing.ts` covers the whole catalog instead of one assertion per export.
 */
export interface TestingSurface {
	startIntegrationBackend: typeof startIntegrationBackend
	givenUser: typeof givenUser
	givenAccount: typeof givenAccount
	givenUserWithAccount: typeof givenUserWithAccount
	givenActiveSession: typeof givenActiveSession
	givenOwner: typeof givenOwner
	givenOwnerWithResponsible: typeof givenOwnerWithResponsible
	givenWorkspace: typeof givenWorkspace
	GIVEN_MENTION_TAG: typeof GIVEN_MENTION_TAG
	givenThread: typeof givenThread
	givenChannel: typeof givenChannel
	givenRemote: typeof givenRemote
	givenRemoteMembership: typeof givenRemoteMembership
	givenIssue: typeof givenIssue
	givenStop: typeof givenStop
	givenDomainEvent: typeof givenDomainEvent
	givenUserProfile: typeof givenUserProfile
}
