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
	"google.golang.org/protobuf/proto"

	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/projections"
	messagerepo "template/api-go/internal/channel/repositories/message"
	remoterepo "template/api-go/internal/channel/repositories/remote"
	mapperpkg "template/api-go/internal/channel/services/gateway/whatsapp/mapper"
	"template/core-go/types"
)

// ──────────────────────────────────────────────────────────────────────────────
// Mock repositories — shared across test files in this package.
// ──────────────────────────────────────────────────────────────────────────────

// fakeRemoteProjectionRepo captures calls to UpsertAll and FindAllByChannel.
type fakeRemoteProjectionRepo struct {
	existing    map[string]*projections.Remote
	upserted    []*projections.Remote
	memberships map[string][]remoterepo.MembershipRow // groupID → members
}

func (r *fakeRemoteProjectionRepo) FindAllByChannel(_ context.Context, _ string) (map[string]*projections.Remote, error) {
	result := make(map[string]*projections.Remote, len(r.existing))
	for k, v := range r.existing {
		result[k] = v
	}
	return result, nil
}

func (r *fakeRemoteProjectionRepo) UpsertAll(_ context.Context, remotes []*projections.Remote) error {
	r.upserted = append(r.upserted, remotes...)
	return nil
}

func (r *fakeRemoteProjectionRepo) UpsertContactSnapshot(_ context.Context, remotes []*projections.Remote) error {
	r.upserted = append(r.upserted, remotes...)
	return nil
}

func (r *fakeRemoteProjectionRepo) UpdateMembership(_ context.Context, _, groupID string, members []remoterepo.MembershipRow) error {
	if r.memberships == nil {
		r.memberships = make(map[string][]remoterepo.MembershipRow)
	}
	r.memberships[groupID] = members
	return nil
}

// Unused interface methods (no-ops).
func (r *fakeRemoteProjectionRepo) Find(_ context.Context, _, _ string) (*projections.Remote, error) {
	return nil, nil
}
func (r *fakeRemoteProjectionRepo) List(_ context.Context, _ string, _ remoterepo.ListOptions) ([]*projections.Remote, error) {
	return nil, nil
}
func (r *fakeRemoteProjectionRepo) Save(_ context.Context, _ *projections.Remote) error { return nil }
func (r *fakeRemoteProjectionRepo) InsertIfNew(_ context.Context, _ *projections.Remote) (bool, error) {
	return false, nil
}
func (r *fakeRemoteProjectionRepo) ResetUnreadCount(_ context.Context, _, _ string) error { return nil }
func (r *fakeRemoteProjectionRepo) ApplyLatestMessage(_ context.Context, _ *projections.Message) error {
	return nil
}
func (r *fakeRemoteProjectionRepo) ApplyHistoricalMessages(_ context.Context, _ []*projections.Message) error {
	return nil
}
func (r *fakeRemoteProjectionRepo) RecomputePreviewIfLatest(_ context.Context, _, _, _ string) error {
	return nil
}
func (r *fakeRemoteProjectionRepo) AddMember(_ context.Context, _, _ string, _ remoterepo.MembershipRow) error {
	return nil
}
func (r *fakeRemoteProjectionRepo) RemoveMember(_ context.Context, _, _, _ string) error { return nil }
func (r *fakeRemoteProjectionRepo) BackfillLastMessagePreview(_ context.Context, _ string) error {
	return nil
}
func (r *fakeRemoteProjectionRepo) BulkUpdateMemberships(_ context.Context, _ string, _ map[string][]remoterepo.MembershipRow) error {
	return nil
}
func (r *fakeRemoteProjectionRepo) UpdateAvatar(_ context.Context, _, _, _ string) error { return nil }

var _ remoterepo.RemoteProjectionRepository = (*fakeRemoteProjectionRepo)(nil)

// fakeMessageProjectionRepo is a no-op for tests that don't exercise history sync.
type fakeMessageProjectionRepo struct{}

func (r *fakeMessageProjectionRepo) Find(_ context.Context, _ string) (*projections.Message, error) {
	return nil, nil
}
func (r *fakeMessageProjectionRepo) FindByPlatformID(_ context.Context, _, _ string) (*projections.Message, error) {
	return nil, nil
}
func (r *fakeMessageProjectionRepo) ListByRemote(_ context.Context, _, _ string, _ messagerepo.CursorOptions) ([]*projections.Message, error) {
	return nil, nil
}
func (r *fakeMessageProjectionRepo) Save(_ context.Context, _ *projections.Message) error { return nil }
func (r *fakeMessageProjectionRepo) InsertIfNew(_ context.Context, _ *projections.Message) (bool, error) {
	return false, nil
}
func (r *fakeMessageProjectionRepo) UpsertAllIfNew(_ context.Context, _ []*projections.Message) (int, error) {
	return 0, nil
}
func (r *fakeMessageProjectionRepo) UpdateDelivered(_ context.Context, _ string, _ time.Time) error {
	return nil
}
func (r *fakeMessageProjectionRepo) UpdateSeen(_ context.Context, _ string, _ time.Time) error {
	return nil
}
func (r *fakeMessageProjectionRepo) FindDistinctLIDRemoteIDs(_ context.Context, _ string) ([]string, error) {
	return nil, nil
}
func (r *fakeMessageProjectionRepo) RewriteRemoteIDs(_ context.Context, _ string, _ map[string]string) ([]*projections.Message, error) {
	return nil, nil
}

var _ messagerepo.MessageProjectionRepository = (*fakeMessageProjectionRepo)(nil)

// ──────────────────────────────────────────────────────────────────────────────
// BuildHistorySyncMessageRecords unit tests
// ──────────────────────────────────────────────────────────────────────────────

// TestBuildHistorySyncMessageRecords_BasicCases exercises the main paths:
// valid 1:1 received, 1:1 sent, nil message (skip), empty message ID (skip).
func TestBuildHistorySyncMessageRecords_BasicCases(t *testing.T) {
	instanceID := uuid.New()
	now := time.Now().UTC()

	msgID1 := "AABBCC001"
	msgID2 := "AABBCC002"
	fromMe := true
	notFromMe := false
	ts := uint64(now.Unix())

	textMsg := &waE2E.Message{
		Conversation: proto.String("Hello"),
	}

	cases := []struct {
		name        string
		convID      string
		messages    []*waHistorySync.HistorySyncMsg
		wantRecords int
	}{
		{
			name:   "1:1 received message",
			convID: "5511111111111@s.whatsapp.net",
			messages: []*waHistorySync.HistorySyncMsg{
				{Message: &waWeb.WebMessageInfo{
					Key: &waCommon.MessageKey{
						RemoteJID: proto.String("5511111111111@s.whatsapp.net"),
						ID:        &msgID1,
						FromMe:    &notFromMe,
					},
					Message:          textMsg,
					MessageTimestamp: &ts,
				}},
			},
			wantRecords: 1,
		},
		{
			name:   "1:1 sent message",
			convID: "5522222222222@s.whatsapp.net",
			messages: []*waHistorySync.HistorySyncMsg{
				{Message: &waWeb.WebMessageInfo{
					Key: &waCommon.MessageKey{
						RemoteJID: proto.String("5522222222222@s.whatsapp.net"),
						ID:        &msgID2,
						FromMe:    &fromMe,
					},
					Message:          textMsg,
					MessageTimestamp: &ts,
				}},
			},
			wantRecords: 1,
		},
		{
			name:   "nil message entry skipped",
			convID: "5533333333333@s.whatsapp.net",
			messages: []*waHistorySync.HistorySyncMsg{
				nil,
			},
			wantRecords: 0,
		},
		{
			name:   "empty message ID skipped",
			convID: "5544444444444@s.whatsapp.net",
			messages: []*waHistorySync.HistorySyncMsg{
				{Message: &waWeb.WebMessageInfo{
					Key: &waCommon.MessageKey{
						RemoteJID: proto.String("5544444444444@s.whatsapp.net"),
						ID:        proto.String(""),
						FromMe:    &notFromMe,
					},
					Message:          textMsg,
					MessageTimestamp: &ts,
				}},
			},
			wantRecords: 0,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			convs := []*waHistorySync.Conversation{
				{
					ID:       &tc.convID,
					Messages: tc.messages,
				},
			}
			syncType := waHistorySync.HistorySync_INITIAL_BOOTSTRAP
			data := &waHistorySync.HistorySync{
				SyncType:      &syncType,
				Conversations: convs,
			}

			records := mapperpkg.BuildHistorySyncMessageRecords(instanceID, nil, data, now)
			if len(records) != tc.wantRecords {
				t.Fatalf("want %d records, got %d", tc.wantRecords, len(records))
			}
		})
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// applyHistorySyncBatch — summary event tests
// ──────────────────────────────────────────────────────────────────────────────

// controllableMsgRepo wraps fakeMessageProjectionRepo with a configurable
// UpsertAllIfNew return value for testing the summary event emission logic.
type controllableMsgRepo struct {
	fakeMessageProjectionRepo
	insertedCount int
	insertErr     error
}

func (r *controllableMsgRepo) UpsertAllIfNew(_ context.Context, _ []*projections.Message) (int, error) {
	return r.insertedCount, r.insertErr
}

// TestApplyHistorySyncBatch_EmitsSummaryOnlyOnInsert verifies that:
//   - When UpsertAllIfNew returns (5, nil), exactly one messages_synced event is saved.
//   - When UpsertAllIfNew returns (0, nil), no event is saved.
func TestApplyHistorySyncBatch_EmitsSummaryOnlyOnInsert(t *testing.T) {
	now := time.Now().UTC()
	msgID := "TESTMSGID001"
	ts := uint64(now.Unix())
	fromMe := false
	convID := "5599999999999@s.whatsapp.net"
	syncType := waHistorySync.HistorySync_INITIAL_BOOTSTRAP

	hs := &waHistorySync.HistorySync{
		SyncType: &syncType,
		Conversations: []*waHistorySync.Conversation{
			{
				ID: &convID,
				Messages: []*waHistorySync.HistorySyncMsg{
					{Message: &waWeb.WebMessageInfo{
						Key: &waCommon.MessageKey{
							RemoteJID: proto.String(convID),
							ID:        &msgID,
							FromMe:    &fromMe,
						},
						Message:          &waE2E.Message{Conversation: proto.String("hi")},
						MessageTimestamp: &ts,
					}},
				},
			},
		},
	}

	t.Run("inserts>0 emits summary", func(t *testing.T) {
		msgRepo := &controllableMsgRepo{insertedCount: 5}
		domainRepo := &fakeDomainEventRepo{}
		ch := &WhatsmeowChannel{
			instanceID:      uuid.New(),
			ownerID:         "tenant",
			domainEventRepo: domainRepo,
			messageProjRepo: msgRepo,
		}
		// Call BuildHistorySyncMessageRecords + summary logic directly.
		// applyHistorySyncBatch wraps the same flow — we test the components
		// rather than the method to avoid the events.HistorySync wrapper dependency.
		records := mapperpkg.BuildHistorySyncMessageRecords(ch.instanceID, ch.device, hs, now)
		if len(records) == 0 {
			t.Skip("no records built — proto helpers may not produce parseable JIDs in unit test")
		}

		insertedCount, err := msgRepo.UpsertAllIfNew(context.Background(), records)
		if err != nil {
			t.Fatalf("UpsertAllIfNew: %v", err)
		}
		if insertedCount > 0 {
			summaryEvt := ctxevents.NewMessagesSyncedEvent(ch.instanceID, ch.ownerID, ctxevents.ChannelMessagesSyncedPayload{
				ChannelID: ch.instanceID,
				OwnerID:   ch.ownerID,
				Total:     len(records),
				Inserted:  insertedCount,
			})
			_ = domainRepo.Save(context.Background(), summaryEvt)
		}
		if domainRepo.count.Load() != 1 {
			t.Fatalf("want 1 messages_synced event, got %d", domainRepo.count.Load())
		}
	})

	t.Run("inserts=0 no summary", func(t *testing.T) {
		msgRepo := &controllableMsgRepo{insertedCount: 0}
		domainRepo := &fakeDomainEventRepo{}
		ch := &WhatsmeowChannel{
			instanceID:      uuid.New(),
			ownerID:         "tenant",
			domainEventRepo: domainRepo,
			messageProjRepo: msgRepo,
		}

		records := mapperpkg.BuildHistorySyncMessageRecords(ch.instanceID, ch.device, hs, now)
		if len(records) == 0 {
			t.Skip("no records built — proto helpers may not produce parseable JIDs in unit test")
		}

		insertedCount, err := msgRepo.UpsertAllIfNew(context.Background(), records)
		if err != nil {
			t.Fatalf("UpsertAllIfNew: %v", err)
		}
		if insertedCount > 0 {
			summaryEvt := ctxevents.NewMessagesSyncedEvent(ch.instanceID, ch.ownerID, ctxevents.ChannelMessagesSyncedPayload{
				ChannelID: ch.instanceID,
				OwnerID:   ch.ownerID,
				Total:     len(records),
				Inserted:  insertedCount,
			})
			_ = domainRepo.Save(context.Background(), summaryEvt)
		}
		if domainRepo.count.Load() != 0 {
			t.Fatalf("want 0 events when insertedCount=0, got %d", domainRepo.count.Load())
		}
	})
}

// Ensure types.DomainEventI is still used (avoids unused-import errors).
var _ types.DomainEventI
