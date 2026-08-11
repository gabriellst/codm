package projectors

import (
	"context"
	"log/slog"
	"time"

	channelenums "template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/projections"
	messagerepo "template/api-go/internal/channel/repositories/message"
	remoterepo "template/api-go/internal/channel/repositories/remote"
	"template/api-go/internal/channel/services/gateway"
	"template/api-go/internal/channel/services/pool"
	"template/core-go/types"

	"github.com/google/uuid"
)

// ──────────────────────────────────────────────────────────────────────────────
// RemoteSnapshotProjector
//
// The single event-driven writer of the CONTACT-SNAPSHOT half of the remotes
// projection (the other half — live remote/message mutations — is
// RemoteProjector). Its exported entry point, SyncContactSnapshot, resolves
// the LIVE channel from the pool and streams its full contact/group roster
// through the SAME two-phase write RemoteProjector's sibling used to run
// inside the whatsmeow adapter (services/gateway/whatsapp/whatsmeow_channel.go,
// pre-T13: projectContactSnapshot/normalizeLIDMessages/hydrateContactAvatars —
// see git history). Moved out per the repo's citizen model (CLAUDE.md): a
// Projector writes projections via its ProjectionRepository, reacting to
// events; an adapter adapts protocol. WhatsmeowChannel.projectContactSnapshot
// did both at once — it held an injected RemoteProjectionRepository and wrote
// read-model rows directly from inside the platform adapter. T13 splits that:
// the adapter now only raises the fact (channel.gateway.sync_complete, via the
// mapper — unchanged), and this projector does 100% of the projection work,
// resolving the channel it needs to stream from purely through the
// gateway.Channel port (StreamContactSnapshot / HydrateAvatars /
// ResolvePhoneJID) — never an adapter-internal field.
//
// Handler/projector split (canon-fix, .plans/2026-08-10-eixo-ambiente-go.md):
// this projector does NOT subscribe to the mediator and does NOT raise
// channel.remotes_synced itself — a projector's surface is its
// ProjectionRepository, never a DomainEventRepository. The write-side
// handlers.RemoteSnapshotSyncedHandler (internal/channel/handlers/) owns
// channel.gateway.sync_complete: it calls SyncContactSnapshot below DIRECTLY
// (a plain Go call, not mediator fan-out — fan-out doesn't guarantee this
// runs before the handler raises the completion event) and, once phase 1's
// rows have landed, raises channel.remotes_synced itself from the counts
// SyncContactSnapshot returns. See that handler's docblock for the full
// two-event rationale (trigger vs. completion) — unchanged by this split,
// only which citizen raises the completion fact moved.
//
// Why this lived in the adapter originally (context for why it's safe to move
// now, not just where):
//   - Timing: PN↔LID mappings are only fully resolved in the device store
//     AFTER AppStateSyncComplete(regular) — StreamContactSnapshot would return
//     incomplete/wrong names if called earlier. This projector never calls it
//     early: it only runs off the SAME trigger event the adapter used to gate
//     on, so the timing invariant carries over unchanged.
//   - Immediacy: routing this through the outbox instead of a direct
//     in-process method call sounds like it trades latency for decoupling,
//     but SqliteOutboxDispatcher's NotifyStrategy wakes the dispatch loop via
//     an in-process nudge (core/services/outbox/sqlite_outbox_dispatcher.go),
//     not a poll-only loop — dispatch latency after the mapper's Save stays in
//     the low milliseconds, not a polling interval.
//   - Lifecycle: the adapter bound its background work to c.stopCtx, a
//     context cancelled the moment Disconnect() runs, so a torn-down channel
//     never wrote after teardown. This projector has no such context to
//     inherit — a channel can legitimately disconnect between the fact firing
//     and the outbox dispatcher getting around to it. It tolerates that
//     explicitly rather than assuming the channel is always still there:
//     pool.Get returns (nil, false) for a channel that's gone, Handle logs and
//     returns nil (not an error — the outbox row is still marked processed,
//     same as any other successfully handled event), and every write this
//     projector performs is idempotent (InsertIfNew/Upsert semantics on
//     RemoteProjectionRepository) — so a channel that reconnects and re-syncs
//     later simply re-runs this projector and fills in whatever a skipped or
//     partial run missed. No corruption risk from tolerating partial streams.
// ──────────────────────────────────────────────────────────────────────────────

type RemoteSnapshotProjector struct {
	pool    pool.ChannelPool
	repo    remoterepo.RemoteProjectionRepository
	msgRepo messagerepo.MessageProjectionRepository
}

// NewRemoteSnapshotProjector takes the channel pool (to resolve the live
// gateway.Channel by id), the remotes projection repository (phase 1 writes),
// and the message projection repository (LID normalization reads/writes —
// same dependency the old adapter's normalizeLIDMessages used). No
// DomainEventRepository here (canon-fix): raising channel.remotes_synced is
// the calling handler's job, not this projector's — see the docblock above.
func NewRemoteSnapshotProjector(
	pool pool.ChannelPool,
	repo remoterepo.RemoteProjectionRepository,
	msgRepo messagerepo.MessageProjectionRepository,
) *RemoteSnapshotProjector {
	return &RemoteSnapshotProjector{pool: pool, repo: repo, msgRepo: msgRepo}
}

// SnapshotResult carries phase 1's write counts back to the caller. A nil
// result (with a nil error) means the channel was not found in the pool —
// see the "Lifecycle" note below; the caller must treat that as a no-op, not
// an error, and must not raise channel.remotes_synced for it.
type SnapshotResult struct {
	ChannelID uuid.UUID
	OwnerID   string
	Total     int32
	Inserted  int32
}

// ──────────────────────────────────────────────────────────────────────────────
// SyncContactSnapshot
//
// Resolves the live channel from the pool and runs the two-phase snapshot:
//
//   - Phase 1 (synchronous): stream contacts/groups, bulk-upsert them plus
//     group memberships, normalize any LID-keyed messages to PN now that
//     resolution is possible, backfill preview columns, then return the
//     resulting counts so the caller can raise channel.remotes_synced.
//   - Phase 2 (background, non-blocking): rate-limited avatar hydration,
//     kicked off before returning so it overlaps the caller's own work.
//
// Exported so handlers.RemoteSnapshotSyncedHandler can call it DIRECTLY (a
// plain Go call, not mediator dispatch) — that direct call is what guarantees
// phase 1's rows land before the handler raises the completion event; mediator
// fan-out across sibling handlers does not order like that. A channel absent
// from the pool (disconnected/removed between the fact firing and this call)
// is logged and treated as a no-op, not an error — see the docblock's
// "Lifecycle" note.
// ──────────────────────────────────────────────────────────────────────────────

func (p *RemoteSnapshotProjector) SyncContactSnapshot(ctx context.Context, event types.DomainEventI) (*SnapshotResult, error) {
	e, err := types.UnmarshalDomainEvent[ctxevents.ChannelGatewaySyncCompletePayload](event)
	if err != nil {
		return nil, err
	}
	channelID := e.Payload.ChannelID
	ownerID := e.Payload.OwnerID

	ch, ok := p.pool.Get(channelID)
	if !ok {
		slog.Info("remote snapshot: channel not in pool — skipping",
			"channelId", channelID)
		return nil, nil
	}

	now := time.Now().UTC()
	var allRemotes []*projections.Remote
	allMemberships := make(map[string][]remoterepo.MembershipRow)
	var allRemoteIDs []string

	for snapshot := range ch.StreamContactSnapshot(ctx) {
		allRemoteIDs = append(allRemoteIDs, snapshot.RemoteID)
		allRemotes = append(allRemotes, &projections.Remote{
			ChannelID: channelID.String(),
			RemoteID:  snapshot.RemoteID,
			Type:      snapshot.RemoteType,
			Platform:  channelenums.PlatformWhatsApp,
			Name:      snapshot.Name,
			// AvatarURL is empty here — filled in by Phase 2 (hydrateContactAvatars).
			CreatedAt: now,
			UpdatedAt: now,
		})

		if snapshot.RemoteType == string(channelenums.RemoteTypeGroup) && len(snapshot.Members) > 0 {
			rows := make([]remoterepo.MembershipRow, 0, len(snapshot.Members))
			for _, m := range snapshot.Members {
				rows = append(rows, remoterepo.MembershipRow{
					MemberID: m.RemoteID,
					IsAdmin:  m.IsAdmin,
					JoinedAt: now,
				})
			}
			allMemberships[snapshot.RemoteID] = rows
		}
	}

	// ── Phase 1: write everything in two bulk operations ───────────────────

	if len(allRemotes) > 0 {
		if err := p.repo.UpsertContactSnapshot(ctx, allRemotes); err != nil {
			slog.Warn("remote snapshot: upsert failed", "channelId", channelID, "error", err)
		}
	}

	if len(allMemberships) > 0 {
		if err := p.repo.BulkUpdateMemberships(ctx, channelID.String(), allMemberships); err != nil {
			slog.Warn("remote snapshot: bulk memberships failed", "channelId", channelID, "error", err)
		}
	}

	p.normalizeLIDMessages(ctx, ch, channelID.String())

	if err := p.repo.BackfillLastMessagePreview(ctx, channelID.String()); err != nil {
		slog.Warn("remote snapshot: backfill last message preview failed",
			"channelId", channelID, "error", err)
	}

	slog.Info("remote snapshot: contact projection complete",
		"channelId", channelID,
		"total", len(allRemotes),
	)

	// ── Phase 2: avatar hydration in background (non-blocking) ────────────
	go p.hydrateContactAvatars(ch, channelID.String(), allRemoteIDs)

	// channel.remotes_synced is the COMPLETION signal (counts only). This
	// method does not raise it — it returns the counts so the caller
	// (handlers.RemoteSnapshotSyncedHandler) can raise it AFTER these rows
	// have actually landed, not off the trigger event. See docblock.
	return &SnapshotResult{
		ChannelID: channelID,
		OwnerID:   ownerID,
		Total:     int32(len(allRemotes)),
		Inserted:  int32(len(allRemotes)),
	}, nil
}

// normalizeLIDMessages rewrites messages stored with LID remote_ids to their
// PN equivalents, then re-applies them to remote rows so last_message_at and
// last_message_id are populated correctly. Must run after the contact
// snapshot upsert (remote PN rows exist) and after sync-complete (LID↔PN
// resolution is possible).
//
// Ported from the old adapter's normalizeLIDMessages, but resolves LIDs
// through gateway.Channel.ResolvePhoneJID — the port method already built for
// this exact translation — instead of reaching into whatsmeow's device store
// directly (resolvePN(c.device, ...)). ResolvePhoneJID returns the input
// unchanged when it isn't a LID or resolution fails, so "pn != lid" is the
// success signal; no whatsmeow-specific JID parsing needs to live here.
func (p *RemoteSnapshotProjector) normalizeLIDMessages(ctx context.Context, ch gateway.Channel, channelID string) {
	lidIDs, err := p.msgRepo.FindDistinctLIDRemoteIDs(ctx, channelID)
	if err != nil {
		slog.Warn("remote snapshot: failed to find LID message remote_ids",
			"channelId", channelID, "error", err)
		return
	}
	if len(lidIDs) == 0 {
		return
	}

	lidToPN := make(map[string]string, len(lidIDs))
	for _, lid := range lidIDs {
		pn := ch.ResolvePhoneJID(ctx, lid)
		if pn != lid {
			lidToPN[lid] = pn
		}
	}

	if len(lidToPN) == 0 {
		slog.Info("remote snapshot: LID messages found but no PN mappings resolved — skipping normalization",
			"channelId", channelID, "lids", len(lidIDs))
		return
	}

	rewritten, err := p.msgRepo.RewriteRemoteIDs(ctx, channelID, lidToPN)
	if err != nil {
		slog.Warn("remote snapshot: failed to rewrite LID message remote_ids",
			"channelId", channelID, "error", err)
		return
	}

	if len(rewritten) > 0 {
		if err := p.repo.ApplyHistoricalMessages(ctx, rewritten); err != nil {
			slog.Warn("remote snapshot: failed to apply rewritten messages to remote projections",
				"channelId", channelID, "error", err)
		}
	}

	slog.Info("remote snapshot: normalized LID messages to PN",
		"channelId", channelID,
		"lids", len(lidToPN),
		"messages", len(rewritten),
	)
}

// hydrateContactAvatars fetches and persists profile pictures for all contacts
// and groups in the snapshot. Runs in a background goroutine so phase 1's
// rows (and the remotes_synced signal) are visible immediately while avatars
// trickle in.
//
// Deliberately uses context.Background() rather than the Handle-scoped ctx:
// the outbox dispatcher's ctx is bound to processing THIS event and may be
// cancelled the moment Handle returns, which would abort avatar hydration
// before it starts. The old adapter avoided this with c.stopCtx (cancelled
// only on Disconnect); no such channel-lifecycle context is available through
// the port, so this settles for "runs until done or process shutdown" — the
// same "background, best-effort" intent, at the cost of not stopping early on
// a mid-hydration disconnect. Each write is independently safe (UpdateAvatar
// no-ops on a missing row), so a channel that disconnects mid-hydration just
// wastes a few rate-limited fetches, it does not corrupt state.
func (p *RemoteSnapshotProjector) hydrateContactAvatars(ch gateway.Channel, channelID string, remoteIDs []string) {
	if len(remoteIDs) == 0 {
		return
	}
	ctx := context.Background()
	updated := 0
	for update := range ch.HydrateAvatars(ctx, remoteIDs) {
		if update.AvatarURL == "" {
			continue
		}
		if err := p.repo.UpdateAvatar(ctx, channelID, update.RemoteID, update.AvatarURL); err != nil {
			slog.Warn("remote snapshot: update avatar failed",
				"channelId", channelID, "remoteId", update.RemoteID, "error", err)
			continue
		}
		updated++
	}
	slog.Info("remote snapshot: avatar hydration complete",
		"channelId", channelID,
		"total", len(remoteIDs),
		"updated", updated,
	)
}
