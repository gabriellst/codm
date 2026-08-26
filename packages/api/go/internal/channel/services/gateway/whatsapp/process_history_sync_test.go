package whatsapp

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow/proto/waCommon"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/proto/waHistorySync"
	"go.mau.fi/whatsmeow/proto/waWeb"
	wameowtypes "go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"

	channelenums "template/api-go/internal/channel/enums"
	"template/api-go/internal/channel/projections"
	remoterepo "template/api-go/internal/channel/repositories/remote"
)

// ──────────────────────────────────────────────────────────────────────────────
// trackingRemoteProjectionRepo — wraps fakeRemoteProjectionRepo and records
// ApplyHistoricalMessages + UpsertAll calls for assertion.
// ──────────────────────────────────────────────────────────────────────────────

type trackingRemoteProjectionRepo struct {
	existing                  map[string]*projections.Remote
	upserted                  []*projections.Remote
	applyHistoricalMsgsCalled bool
	applyHistoricalMsgsInput  []*projections.Message
}

func (r *trackingRemoteProjectionRepo) FindAllByChannel(_ context.Context, _ string) (map[string]*projections.Remote, error) {
	result := make(map[string]*projections.Remote, len(r.existing))
	for k, v := range r.existing {
		result[k] = v
	}
	return result, nil
}

func (r *trackingRemoteProjectionRepo) UpsertAll(_ context.Context, remotes []*projections.Remote) error {
	r.upserted = append(r.upserted, remotes...)
	return nil
}

func (r *trackingRemoteProjectionRepo) ApplyHistoricalMessages(_ context.Context, msgs []*projections.Message) error {
	r.applyHistoricalMsgsCalled = true
	r.applyHistoricalMsgsInput = append(r.applyHistoricalMsgsInput, msgs...)
	return nil
}

// Unused interface methods (no-ops).
func (r *trackingRemoteProjectionRepo) Find(_ context.Context, _, _ string) (*projections.Remote, error) {
	return nil, nil
}
func (r *trackingRemoteProjectionRepo) List(_ context.Context, _ string, _ remoterepo.ListOptions) ([]*projections.Remote, error) {
	return nil, nil
}
func (r *trackingRemoteProjectionRepo) Save(_ context.Context, _ *projections.Remote) error {
	return nil
}
func (r *trackingRemoteProjectionRepo) InsertIfNew(_ context.Context, _ *projections.Remote) (bool, error) {
	return false, nil
}
func (r *trackingRemoteProjectionRepo) ResetUnreadCount(_ context.Context, _, _ string) error {
	return nil
}
func (r *trackingRemoteProjectionRepo) ApplyLatestMessage(_ context.Context, _ *projections.Message) error {
	return nil
}
func (r *trackingRemoteProjectionRepo) RecomputePreviewIfLatest(_ context.Context, _, _, _ string) error {
	return nil
}
func (r *trackingRemoteProjectionRepo) UpsertContactSnapshot(_ context.Context, _ []*projections.Remote) error {
	return nil
}
func (r *trackingRemoteProjectionRepo) UpdateMembership(_ context.Context, _, _ string, _ []remoterepo.MembershipRow) error {
	return nil
}
func (r *trackingRemoteProjectionRepo) AddMember(_ context.Context, _, _ string, _ remoterepo.MembershipRow) error {
	return nil
}
func (r *trackingRemoteProjectionRepo) RemoveMember(_ context.Context, _, _, _ string) error {
	return nil
}
func (r *trackingRemoteProjectionRepo) BackfillLastMessagePreview(_ context.Context, _ string) error {
	return nil
}
func (r *trackingRemoteProjectionRepo) BulkUpdateMemberships(_ context.Context, _ string, _ map[string][]remoterepo.MembershipRow) error {
	return nil
}
func (r *trackingRemoteProjectionRepo) UpdateAvatar(_ context.Context, _, _, _ string) error {
	return nil
}

var _ remoterepo.RemoteProjectionRepository = (*trackingRemoteProjectionRepo)(nil)

// ──────────────────────────────────────────────────────────────────────────────
// trackingMsgRepo — wraps fakeMessageProjectionRepo and records what was upserted.
// ──────────────────────────────────────────────────────────────────────────────

type trackingMsgRepo struct {
	fakeMessageProjectionRepo
	insertedCount int
	upserted      []*projections.Message
}

func (r *trackingMsgRepo) UpsertAllIfNew(_ context.Context, msgs []*projections.Message) (int, error) {
	r.upserted = append(r.upserted, msgs...)
	return r.insertedCount, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// buildTestHistorySync builds a waHistorySync.HistorySync wrapped in
// wameowtypes.HistorySync with the given conversations.
// ──────────────────────────────────────────────────────────────────────────────

func buildTestHistorySync(convs []*waHistorySync.Conversation) *wameowtypes.HistorySync {
	syncType := waHistorySync.HistorySync_INITIAL_BOOTSTRAP
	return &wameowtypes.HistorySync{
		Data: &waHistorySync.HistorySync{
			SyncType:      &syncType,
			Conversations: convs,
		},
	}
}

// buildTestConv creates a single conversation with one received message.
func buildTestConv(convID, msgID string, ts uint64) *waHistorySync.Conversation {
	fromMe := false
	return &waHistorySync.Conversation{
		ID: &convID,
		Messages: []*waHistorySync.HistorySyncMsg{
			{Message: &waWeb.WebMessageInfo{
				Key: &waCommon.MessageKey{
					RemoteJID: proto.String(convID),
					ID:        &msgID,
					FromMe:    &fromMe,
				},
				Message:          &waE2E.Message{Conversation: proto.String("test message")},
				MessageTimestamp: &ts,
			}},
		},
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// TestApplyHistorySyncBatch_NoOrphanStubs
//
// Verifies that applyHistorySyncBatch does NOT create stub remotes for unknown
// senders. Stub creation was removed in the platform-decoupling refactor:
// known contacts come from StreamContactSnapshot (called after AppStateSyncComplete),
// and unknown contacts get stubs only when a live message arrives via RemoteCreatedProjector.
// ──────────────────────────────────────────────────────────────────────────────

func TestApplyHistorySyncBatch_NoOrphanStubs(t *testing.T) {
	channelID := uuid.New()
	now := time.Now().UTC()
	ts := uint64(now.Unix())

	userID1 := "5511111111111@s.whatsapp.net"
	userID2 := "5522222222222@s.whatsapp.net"
	groupID := "120363000000001@g.us"

	hs := buildTestHistorySync([]*waHistorySync.Conversation{
		buildTestConv(userID1, "MSG001", ts),
		buildTestConv(userID2, "MSG002", ts),
		buildTestConv(groupID, "MSG003", ts),
	})

	// Empty remote projection — no existing remotes.
	remoteRepo := &trackingRemoteProjectionRepo{
		existing: map[string]*projections.Remote{},
	}
	msgRepo := &trackingMsgRepo{insertedCount: 3}
	domainRepo := &fakeDomainEventRepo{}

	ch := &WhatsmeowChannel{
		instanceID:      channelID,
		ownerID:         "tenant",
		domainEventRepo: domainRepo,
		messageProjRepo: msgRepo,
		remoteProjRepo:  remoteRepo,
	}

	ch.applyHistorySyncBatch(context.Background(), hs)

	// No stubs should be created — applyHistorySyncBatch no longer calls UpsertAll
	// for orphan senders. Unknown contacts are handled by RemoteCreatedProjector
	// when a live message arrives.
	if len(remoteRepo.upserted) != 0 {
		t.Fatalf("want 0 stubs upserted (no stub creation in applyHistorySyncBatch), got %d", len(remoteRepo.upserted))
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// TestApplyHistorySyncBatch_ExistingRemotesPreserved
//
// Verifies that applyHistorySyncBatch does not modify existing remote rows.
// Message-derived fields (last_message_at, etc.) are folded via
// ApplyHistoricalMessages, not via UpsertAll.
// ──────────────────────────────────────────────────────────────────────────────

func TestApplyHistorySyncBatch_ExistingRemotesPreserved(t *testing.T) {
	channelID := uuid.New()
	now := time.Now().UTC()
	ts := uint64(now.Unix())

	existingID := "5511111111111@s.whatsapp.net"
	newID := "5599999999999@s.whatsapp.net"

	// Seed existing remote with a known name — must survive the batch.
	remoteRepo := &trackingRemoteProjectionRepo{
		existing: map[string]*projections.Remote{
			existingID: {
				ChannelID: channelID.String(),
				RemoteID:  existingID,
				Name:      "Alice",
				Type:      string(channelenums.RemoteTypeUser),
				CreatedAt: now,
				UpdatedAt: now,
			},
		},
	}
	msgRepo := &trackingMsgRepo{insertedCount: 2}
	domainRepo := &fakeDomainEventRepo{}

	hs := buildTestHistorySync([]*waHistorySync.Conversation{
		buildTestConv(existingID, "MSG_EXISTING", ts),
		buildTestConv(newID, "MSG_NEW", ts),
	})

	ch := &WhatsmeowChannel{
		instanceID:      channelID,
		ownerID:         "tenant",
		domainEventRepo: domainRepo,
		messageProjRepo: msgRepo,
		remoteProjRepo:  remoteRepo,
	}

	ch.applyHistorySyncBatch(context.Background(), hs)

	// No stubs should be upserted — stub creation was removed.
	if len(remoteRepo.upserted) != 0 {
		t.Fatalf("want 0 upserted rows, got %d; upserted: %+v", len(remoteRepo.upserted), remoteRepo.upserted)
	}

	// Existing remote name must be unchanged.
	existing := remoteRepo.existing[existingID]
	if existing.Name != "Alice" {
		t.Fatalf("existing remote Name must be Alice, got %q", existing.Name)
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// TestProcessHistorySyncMessages_FoldsDerivedFields
//
// Verifies that ApplyHistoricalMessages is called with the message records so
// derived fields (last_message_id, last_message_at) are folded into the Remote
// projection. Unread count is NOT bumped for historical messages.
// ──────────────────────────────────────────────────────────────────────────────

func TestProcessHistorySyncMessages_FoldsDerivedFields(t *testing.T) {
	channelID := uuid.New()
	now := time.Now().UTC()
	ts := uint64(now.Unix())

	remoteID := "5511111111111@s.whatsapp.net"

	// Seed one existing remote.
	remoteRepo := &trackingRemoteProjectionRepo{
		existing: map[string]*projections.Remote{
			remoteID: {
				ChannelID: channelID.String(),
				RemoteID:  remoteID,
				Name:      "Bob",
				Type:      string(channelenums.RemoteTypeUser),
				CreatedAt: now,
				UpdatedAt: now,
			},
		},
	}
	msgRepo := &trackingMsgRepo{insertedCount: 3}
	domainRepo := &fakeDomainEventRepo{}

	// 3 messages from the same remote.
	ts1 := uint64(now.Add(-10 * time.Minute).Unix())
	ts2 := uint64(now.Add(-5 * time.Minute).Unix())
	ts3 := ts // newest

	hs := buildTestHistorySync([]*waHistorySync.Conversation{
		{
			ID: &remoteID,
			Messages: []*waHistorySync.HistorySyncMsg{
				buildTestConv(remoteID, "MSG_A", ts1).Messages[0],
				buildTestConv(remoteID, "MSG_B", ts2).Messages[0],
				buildTestConv(remoteID, "MSG_C", ts3).Messages[0],
			},
		},
	})

	ch := &WhatsmeowChannel{
		instanceID:      channelID,
		ownerID:         "tenant",
		domainEventRepo: domainRepo,
		messageProjRepo: msgRepo,
		remoteProjRepo:  remoteRepo,
	}

	ch.applyHistorySyncBatch(context.Background(), hs)

	// ApplyHistoricalMessages must have been called.
	if !remoteRepo.applyHistoricalMsgsCalled {
		t.Fatal("want ApplyHistoricalMessages to be called after UpsertAllIfNew")
	}

	// ApplyHistoricalMessages must receive all 3 message records.
	if len(remoteRepo.applyHistoricalMsgsInput) != 3 {
		t.Fatalf("want ApplyHistoricalMessages called with 3 records, got %d", len(remoteRepo.applyHistoricalMsgsInput))
	}

	// Each record must reference the correct remote and channel.
	for _, msg := range remoteRepo.applyHistoricalMsgsInput {
		if msg.RemoteID != remoteID {
			t.Fatalf("msg.RemoteID mismatch: want %s, got %s", remoteID, msg.RemoteID)
		}
		if msg.ChannelID != channelID.String() {
			t.Fatalf("msg.ChannelID mismatch: want %s, got %s", channelID.String(), msg.ChannelID)
		}
		// ID must be populated (UUID generated by BuildHistorySyncMessageRecords).
		if msg.ID == "" {
			t.Fatal("msg.ID must be populated")
		}
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// TestProcessHistorySyncMessages_HistoricalMessagesDeliveredSeenNil
//
// Verifies that historical messages have DeliveredAt set to their OccurredAt
// timestamp but SeenAt left nil. Delivery is certain (the message is in
// history), but seen status is left nil so it can only advance via live
// read receipts. See historyMsgReceipts in mapper/history_sync.go.
// ──────────────────────────────────────────────────────────────────────────────

func TestProcessHistorySyncMessages_HistoricalMessagesDeliveredSeenNil(t *testing.T) {
	channelID := uuid.New()
	now := time.Now().UTC()

	remoteID := "5511111111111@s.whatsapp.net"

	// Seed one existing remote.
	remoteRepo := &trackingRemoteProjectionRepo{
		existing: map[string]*projections.Remote{
			remoteID: {
				ChannelID: channelID.String(),
				RemoteID:  remoteID,
				Name:      "Charlie",
				Type:      string(channelenums.RemoteTypeUser),
				CreatedAt: now,
				UpdatedAt: now,
			},
		},
	}
	msgRepo := &trackingMsgRepo{insertedCount: 2}
	domainRepo := &fakeDomainEventRepo{}

	// 2 messages: one received, one sent — both historical.
	ts1 := uint64(now.Add(-10 * time.Minute).Unix())
	ts2 := uint64(now.Add(-5 * time.Minute).Unix())

	hs := buildTestHistorySync([]*waHistorySync.Conversation{
		{
			ID: &remoteID,
			Messages: []*waHistorySync.HistorySyncMsg{
				// Received message
				{Message: &waWeb.WebMessageInfo{
					Key: &waCommon.MessageKey{
						RemoteJID: proto.String(remoteID),
						ID:        proto.String("MSG_RECEIVED"),
						FromMe:    proto.Bool(false),
					},
					Message:          &waE2E.Message{Conversation: proto.String("received message")},
					MessageTimestamp: &ts1,
				}},
				// Sent message
				{Message: &waWeb.WebMessageInfo{
					Key: &waCommon.MessageKey{
						RemoteJID: proto.String(remoteID),
						ID:        proto.String("MSG_SENT"),
						FromMe:    proto.Bool(true),
					},
					Message:          &waE2E.Message{Conversation: proto.String("sent message")},
					MessageTimestamp: &ts2,
				}},
			},
		},
	})

	ch := &WhatsmeowChannel{
		instanceID:      channelID,
		ownerID:         "tenant",
		domainEventRepo: domainRepo,
		messageProjRepo: msgRepo,
		remoteProjRepo:  remoteRepo,
	}

	ch.applyHistorySyncBatch(context.Background(), hs)

	// ApplyHistoricalMessages must receive 2 message records.
	if len(remoteRepo.applyHistoricalMsgsInput) != 2 {
		t.Fatalf("want 2 messages, got %d", len(remoteRepo.applyHistoricalMsgsInput))
	}

	// First message (received at ts1).
	msg1 := remoteRepo.applyHistoricalMsgsInput[0]
	if msg1.DeliveredAt == nil {
		t.Fatal("received message: DeliveredAt must be non-nil")
	}
	if msg1.SeenAt != nil {
		t.Fatalf("received message: SeenAt must be nil for history messages, got %v", msg1.SeenAt)
	}
	occurredAt1 := time.Unix(int64(ts1), 0).UTC()
	if !msg1.DeliveredAt.Equal(occurredAt1) {
		t.Fatalf("received message: DeliveredAt mismatch: want %v, got %v", occurredAt1, msg1.DeliveredAt)
	}

	// Second message (sent at ts2).
	msg2 := remoteRepo.applyHistoricalMsgsInput[1]
	if msg2.DeliveredAt == nil {
		t.Fatal("sent message: DeliveredAt must be non-nil")
	}
	if msg2.SeenAt != nil {
		t.Fatalf("sent message: SeenAt must be nil for history messages, got %v", msg2.SeenAt)
	}
	occurredAt2 := time.Unix(int64(ts2), 0).UTC()
	if !msg2.DeliveredAt.Equal(occurredAt2) {
		t.Fatalf("sent message: DeliveredAt mismatch: want %v, got %v", occurredAt2, msg2.DeliveredAt)
	}
}
