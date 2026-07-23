package projectors

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"

	channelenums "template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/projections"
	messagerepo "template/api-go/internal/channel/repositories/message"
	sharedenums "template/api-go/internal/shared/enums"
)

// ──────────────────────────────────────────────────────────────────────────────
// Mock Message Projection Repository
// ──────────────────────────────────────────────────────────────────────────────

type mockMessageProjectionRepo struct {
	// rows keyed by (channelID+"|"+platformMessageID) for FindByPlatformID
	rowsByPlatformID map[string]*projections.Message
	// rows keyed by internal UUID for Find
	rowsByID map[string]*projections.Message

	insertIfNewCalls   int
	saveCalls          []*projections.Message
	updateDeliveredArg []struct {
		id string
		at time.Time
	}
	updateSeenArg []struct {
		id string
		at time.Time
	}
}

func newMockMessageRepo() *mockMessageProjectionRepo {
	return &mockMessageProjectionRepo{
		rowsByPlatformID: make(map[string]*projections.Message),
		rowsByID:         make(map[string]*projections.Message),
	}
}

func (m *mockMessageProjectionRepo) platformKey(channelID, platformID string) string {
	return channelID + "|" + platformID
}

func (m *mockMessageProjectionRepo) Find(_ context.Context, messageID string) (*projections.Message, error) {
	return m.rowsByID[messageID], nil
}

func (m *mockMessageProjectionRepo) FindByPlatformID(_ context.Context, channelID, platformMessageID string) (*projections.Message, error) {
	return m.rowsByPlatformID[m.platformKey(channelID, platformMessageID)], nil
}

func (m *mockMessageProjectionRepo) ListByRemote(_ context.Context, _, _ string, _ messagerepo.CursorOptions) ([]*projections.Message, error) {
	return nil, nil
}

func (m *mockMessageProjectionRepo) Save(_ context.Context, msg *projections.Message) error {
	m.saveCalls = append(m.saveCalls, msg)
	m.rowsByID[msg.ID] = msg
	m.rowsByPlatformID[m.platformKey(msg.ChannelID, msg.PlatformMessageID)] = msg
	return nil
}

func (m *mockMessageProjectionRepo) InsertIfNew(_ context.Context, msg *projections.Message) (bool, error) {
	m.insertIfNewCalls++
	k := m.platformKey(msg.ChannelID, msg.PlatformMessageID)
	if _, exists := m.rowsByPlatformID[k]; exists {
		return false, nil
	}
	m.rowsByPlatformID[k] = msg
	m.rowsByID[msg.ID] = msg
	return true, nil
}

func (m *mockMessageProjectionRepo) UpsertAllIfNew(_ context.Context, msgs []*projections.Message) (int, error) {
	count := 0
	for _, msg := range msgs {
		inserted, _ := m.InsertIfNew(context.Background(), msg)
		if inserted {
			count++
		}
	}
	return count, nil
}

func (m *mockMessageProjectionRepo) UpdateDelivered(_ context.Context, messageID string, at time.Time) error {
	m.updateDeliveredArg = append(m.updateDeliveredArg, struct {
		id string
		at time.Time
	}{messageID, at})
	if row, ok := m.rowsByID[messageID]; ok {
		row.ApplyDelivered(at)
	}
	return nil
}

func (m *mockMessageProjectionRepo) UpdateSeen(_ context.Context, messageID string, at time.Time) error {
	m.updateSeenArg = append(m.updateSeenArg, struct {
		id string
		at time.Time
	}{messageID, at})
	if row, ok := m.rowsByID[messageID]; ok {
		row.ApplySeen(at)
	}
	return nil
}

func (m *mockMessageProjectionRepo) FindDistinctLIDRemoteIDs(_ context.Context, _ string) ([]string, error) {
	return nil, nil
}

func (m *mockMessageProjectionRepo) RewriteRemoteIDs(_ context.Context, _ string, _ map[string]string) ([]*projections.Message, error) {
	return nil, nil
}

var _ messagerepo.MessageProjectionRepository = (*mockMessageProjectionRepo)(nil)

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

func TestMessageReceivedProjector_InsertsRow(t *testing.T) {
	repo := newMockMessageRepo()
	p := NewMessageReceivedProjector(repo)

	channelID := uuid.New()
	expectedInternalID := uuid.New()
	ts := time.Now().Unix()
	evt := ctxevents.NewMessageReceivedEvent(channelID, "tenant", ctxevents.ChannelMessageReceivedPayload{
		ChannelID:         channelID,
		MessageID:         "msg-001",
		InternalMessageID: expectedInternalID,
		RemoteID:          "remote@s.whatsapp.net",
		SenderID:          "sender@s.whatsapp.net",
		FromMe:            false,
		Timestamp:         ts,
		OccurredAt:        time.Unix(ts, 0).UTC(),
		ObservedAt:        time.Now().UTC(),
		MessageType:       "TEXT",
		Platform:          "WHATSAPP",
		OwnerID:           "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if repo.insertIfNewCalls != 1 {
		t.Fatalf("expected 1 InsertIfNew call, got %d", repo.insertIfNewCalls)
	}
	k := repo.platformKey(channelID.String(), "msg-001")
	row := repo.rowsByPlatformID[k]
	if row == nil {
		t.Fatal("expected row to be inserted")
	}
	if row.Direction != string(channelenums.DirectionReceived) {
		t.Errorf("direction mismatch: got %s", row.Direction)
	}
	saved, err := repo.FindByPlatformID(context.Background(), channelID.String(), "msg-001")
	if err != nil {
		t.Fatalf("FindByPlatformID: %v", err)
	}
	if saved == nil {
		t.Fatal("expected saved row, got nil")
	}
	if saved.ID != expectedInternalID.String() {
		t.Errorf("projector must use event-carried InternalMessageID as projection primary key: want %s, got %s",
			expectedInternalID.String(), saved.ID)
	}
}

func TestMessageReceivedProjector_IdempotentOnDuplicate(t *testing.T) {
	repo := newMockMessageRepo()
	p := NewMessageReceivedProjector(repo)

	channelID := uuid.New()
	dupTs := time.Now().Unix()
	payload := ctxevents.ChannelMessageReceivedPayload{
		ChannelID:   channelID,
		MessageID:   "msg-dup",
		RemoteID:    "remote@s.whatsapp.net",
		SenderID:    "sender@s.whatsapp.net",
		Timestamp:   dupTs,
		OccurredAt:  time.Unix(dupTs, 0).UTC(),
		ObservedAt:  time.Now().UTC(),
		MessageType: "TEXT",
		Platform:    "WHATSAPP",
		OwnerID:     "tenant",
	}
	evt := ctxevents.NewMessageReceivedEvent(channelID, "tenant", payload)

	// First insert succeeds.
	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("first Handle: %v", err)
	}
	// Second insert is a no-op.
	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("second Handle: %v", err)
	}
	if repo.insertIfNewCalls != 2 {
		t.Fatalf("expected 2 InsertIfNew calls, got %d", repo.insertIfNewCalls)
	}
	// Only 1 row in the repo (dedup worked).
	if len(repo.rowsByPlatformID) != 1 {
		t.Errorf("expected 1 row, got %d", len(repo.rowsByPlatformID))
	}
}

func TestMessageSentProjector_InsertsRow(t *testing.T) {
	repo := newMockMessageRepo()
	p := NewMessageSentProjector(repo)

	channelID := uuid.New()
	expectedInternalID := uuid.New()
	ts := time.Now().Unix()
	evt := ctxevents.NewMessageSentEvent(channelID, "tenant", ctxevents.ChannelMessageSentPayload{
		ChannelID:         channelID,
		MessageID:         "msg-out-001",
		InternalMessageID: expectedInternalID,
		RemoteID:          "remote@s.whatsapp.net",
		SenderID:          "owner@s.whatsapp.net",
		Timestamp:         ts,
		OccurredAt:        time.Unix(ts, 0).UTC(),
		ObservedAt:        time.Now().UTC(),
		MessageType:       "TEXT",
		Platform:          "WHATSAPP",
		OwnerID:           "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	k := repo.platformKey(channelID.String(), "msg-out-001")
	row := repo.rowsByPlatformID[k]
	if row == nil {
		t.Fatal("expected row to be inserted")
	}
	if row.Direction != string(channelenums.DirectionSent) {
		t.Errorf("direction mismatch: got %s", row.Direction)
	}
	saved, err := repo.FindByPlatformID(context.Background(), channelID.String(), "msg-out-001")
	if err != nil {
		t.Fatalf("FindByPlatformID: %v", err)
	}
	if saved == nil {
		t.Fatal("expected saved row, got nil")
	}
	if saved.ID != expectedInternalID.String() {
		t.Errorf("projector must use event-carried InternalMessageID as projection primary key: want %s, got %s",
			expectedInternalID.String(), saved.ID)
	}
}

func TestMessageEditedProjector_UpdatesContent(t *testing.T) {
	repo := newMockMessageRepo()
	channelID := uuid.New()

	// Pre-insert a row.
	existing := &projections.Message{
		ID:                uuid.New().String(),
		ChannelID:         channelID.String(),
		RemoteID:          "remote@s.whatsapp.net",
		PlatformMessageID: "msg-edit",
		Direction:         string(channelenums.DirectionReceived),
		SenderRemoteID:    "sender@s.whatsapp.net",
		Content:           json.RawMessage(`{"text":"original"}`),
		OccurredAt:        time.Now().UTC(),
		ObservedAt:        time.Now().UTC(),
	}
	repo.rowsByPlatformID[repo.platformKey(channelID.String(), "msg-edit")] = existing
	repo.rowsByID[existing.ID] = existing

	p := NewMessageEditedProjector(repo)
	ts := time.Now().Unix()
	evt := ctxevents.NewMessageEditedEvent(channelID, "tenant", ctxevents.ChannelMessageEditedPayload{
		ChannelID:   channelID,
		MessageID:   "msg-edit",
		RemoteID:    "remote@s.whatsapp.net",
		SenderID:    "sender@s.whatsapp.net",
		Timestamp:   ts,
		MessageType: "TEXT",
		Content:     json.RawMessage(`{"text":"edited"}`),
		Platform:    "WHATSAPP",
		OwnerID:     "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(repo.saveCalls) != 1 {
		t.Fatalf("expected 1 Save call, got %d", len(repo.saveCalls))
	}
	saved := repo.saveCalls[0]
	if string(saved.Content) != `{"text":"edited"}` {
		t.Errorf("content mismatch: got %s", string(saved.Content))
	}
	if saved.EditedAt == nil {
		t.Error("expected edited_at to be set")
	}
}

func TestMessageEditedProjector_NotFoundIsNonFatal(t *testing.T) {
	repo := newMockMessageRepo()
	p := NewMessageEditedProjector(repo)
	channelID := uuid.New()
	evt := ctxevents.NewMessageEditedEvent(channelID, "tenant", ctxevents.ChannelMessageEditedPayload{
		ChannelID:   channelID,
		MessageID:   "ghost-msg",
		RemoteID:    "remote@s.whatsapp.net",
		SenderID:    "sender@s.whatsapp.net",
		Timestamp:   time.Now().Unix(),
		MessageType: "TEXT",
		Content:     json.RawMessage(`{}`),
		Platform:    "WHATSAPP",
		OwnerID:     "tenant",
	})
	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("expected nil on not-found, got: %v", err)
	}
}

func TestMessageDeletedProjector_SoftDeletes(t *testing.T) {
	repo := newMockMessageRepo()
	channelID := uuid.New()

	existing := &projections.Message{
		ID:                uuid.New().String(),
		ChannelID:         channelID.String(),
		RemoteID:          "remote@s.whatsapp.net",
		PlatformMessageID: "msg-del",
		Direction:         string(channelenums.DirectionReceived),
		OccurredAt:        time.Now().UTC(),
		ObservedAt:        time.Now().UTC(),
	}
	repo.rowsByPlatformID[repo.platformKey(channelID.String(), "msg-del")] = existing
	repo.rowsByID[existing.ID] = existing

	p := NewMessageDeletedProjector(repo)
	evt := ctxevents.NewMessageDeletedEvent(channelID, "tenant", ctxevents.ChannelMessageDeletedPayload{
		ChannelID: channelID,
		MessageID: "msg-del",
		RemoteID:  "remote@s.whatsapp.net",
		Platform:  "WHATSAPP",
		OwnerID:   "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(repo.saveCalls) != 1 {
		t.Fatalf("expected 1 Save call, got %d", len(repo.saveCalls))
	}
	if repo.saveCalls[0].DeletedAt == nil {
		t.Error("expected deleted_at to be set")
	}
}

func TestMessageDeliveredProjector_UpdatesDeliveredAt(t *testing.T) {
	repo := newMockMessageRepo()
	channelID := uuid.New()

	existing := &projections.Message{
		ID:                uuid.New().String(),
		ChannelID:         channelID.String(),
		RemoteID:          "remote@s.whatsapp.net",
		PlatformMessageID: "msg-dlv",
		Direction:         string(channelenums.DirectionSent),
		OccurredAt:        time.Now().UTC(),
		ObservedAt:        time.Now().UTC(),
	}
	repo.rowsByPlatformID[repo.platformKey(channelID.String(), "msg-dlv")] = existing
	repo.rowsByID[existing.ID] = existing

	p := NewMessageDeliveredProjector(repo)
	ts := time.Now().Unix()
	evt := ctxevents.NewMessageDeliveredEvent(channelID, "tenant", ctxevents.ChannelMessageDeliveredPayload{
		ChannelID:  channelID,
		RemoteID:   "remote@s.whatsapp.net",
		SenderID:   "recipient@s.whatsapp.net",
		MessageIDs: []string{"msg-dlv"},
		Timestamp:  ts,
		Platform:   "WHATSAPP",
		OwnerID:    "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(repo.updateDeliveredArg) != 1 {
		t.Fatalf("expected 1 UpdateDelivered call, got %d", len(repo.updateDeliveredArg))
	}
	if repo.updateDeliveredArg[0].id != existing.ID {
		t.Errorf("UpdateDelivered ID mismatch: got %s", repo.updateDeliveredArg[0].id)
	}
}

func TestMessageDeliveredProjector_EmptyMessageIDsIsNoop(t *testing.T) {
	repo := newMockMessageRepo()
	p := NewMessageDeliveredProjector(repo)
	channelID := uuid.New()
	evt := ctxevents.NewMessageDeliveredEvent(channelID, "tenant", ctxevents.ChannelMessageDeliveredPayload{
		ChannelID:  channelID,
		RemoteID:   "remote@s.whatsapp.net",
		SenderID:   "recipient@s.whatsapp.net",
		MessageIDs: nil, // watermark-only
		Timestamp:  time.Now().Unix(),
		Platform:   "WHATSAPP",
		OwnerID:    "tenant",
	})
	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(repo.updateDeliveredArg) != 0 {
		t.Errorf("expected 0 UpdateDelivered calls for watermark-only receipt, got %d", len(repo.updateDeliveredArg))
	}
}

func TestMessageSeenProjector_UpdatesSeenAt(t *testing.T) {
	repo := newMockMessageRepo()
	channelID := uuid.New()

	existing := &projections.Message{
		ID:                uuid.New().String(),
		ChannelID:         channelID.String(),
		RemoteID:          "remote@s.whatsapp.net",
		PlatformMessageID: "msg-seen",
		Direction:         string(channelenums.DirectionSent),
		OccurredAt:        time.Now().UTC(),
		ObservedAt:        time.Now().UTC(),
	}
	repo.rowsByPlatformID[repo.platformKey(channelID.String(), "msg-seen")] = existing
	repo.rowsByID[existing.ID] = existing

	p := NewMessageSeenProjector(repo)
	ts := time.Now().Unix()
	evt := ctxevents.NewMessageSeenEvent(channelID, "tenant", ctxevents.ChannelMessageSeenPayload{
		ChannelID:  channelID,
		RemoteID:   "remote@s.whatsapp.net",
		SenderID:   "recipient@s.whatsapp.net",
		MessageIDs: []string{"msg-seen"},
		Timestamp:  ts,
		Platform:   "WHATSAPP",
		OwnerID:    "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(repo.updateSeenArg) != 1 {
		t.Fatalf("expected 1 UpdateSeen call, got %d", len(repo.updateSeenArg))
	}
	if repo.updateSeenArg[0].id != existing.ID {
		t.Errorf("UpdateSeen ID mismatch: got %s", repo.updateSeenArg[0].id)
	}
}

func TestMessageSeenProjector_EmptyMessageIDsIsNoop(t *testing.T) {
	repo := newMockMessageRepo()
	p := NewMessageSeenProjector(repo)
	channelID := uuid.New()
	evt := ctxevents.NewMessageSeenEvent(channelID, "tenant", ctxevents.ChannelMessageSeenPayload{
		ChannelID:  channelID,
		RemoteID:   "remote@s.whatsapp.net",
		SenderID:   "recipient@s.whatsapp.net",
		MessageIDs: nil, // watermark-only
		Timestamp:  time.Now().Unix(),
		Platform:   "WHATSAPP",
		OwnerID:    "tenant",
	})
	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(repo.updateSeenArg) != 0 {
		t.Errorf("expected 0 UpdateSeen calls for watermark-only receipt, got %d", len(repo.updateSeenArg))
	}
}

// TestMessageReceivedProjector_SkipsPlatformInternal verifies the defensive guard:
// PlatformInternal events (web /agent) must never land in the messages projection
// table. The TS api routes these through an in-process mediator that never reaches
// the channel Kafka consumer, but this guard is belt-and-suspenders for the projector.
func TestMessageReceivedProjector_SkipsPlatformInternal(t *testing.T) {
	repo := newMockMessageRepo()
	p := NewMessageReceivedProjector(repo)

	channelID := uuid.New()
	ts := time.Now().Unix()
	evt := ctxevents.NewMessageReceivedEvent(channelID, "tenant", ctxevents.ChannelMessageReceivedPayload{
		ChannelID:         channelID,
		MessageID:         "msg-internal-001",
		InternalMessageID: uuid.New(),
		RemoteID:          "agent-remote",
		SenderID:          "agent-sender",
		FromMe:            false,
		Timestamp:         ts,
		OccurredAt:        time.Unix(ts, 0).UTC(),
		ObservedAt:        time.Now().UTC(),
		MessageType:       "TEXT",
		Platform:          string(sharedenums.PlatformInternal),
		OwnerID:           "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if repo.insertIfNewCalls != 0 {
		t.Fatalf("expected 0 InsertIfNew calls for PlatformInternal, got %d", repo.insertIfNewCalls)
	}
	if len(repo.rowsByPlatformID) != 0 {
		t.Errorf("expected 0 projection rows for PlatformInternal, got %d", len(repo.rowsByPlatformID))
	}
}

// TestMessageSentProjector_SkipsPlatformInternal verifies the symmetric guard
// on the outbound side: PlatformInternal events must never land in the
// messages projection table even via the sent-side projector. Mirrors
// TestMessageReceivedProjector_SkipsPlatformInternal — the guard exists on
// both projectors so a future refactor that puts internal sent traffic on
// the bus (or any other replay path) is defensively covered.
func TestMessageSentProjector_SkipsPlatformInternal(t *testing.T) {
	repo := newMockMessageRepo()
	p := NewMessageSentProjector(repo)

	channelID := uuid.New()
	ts := time.Now().Unix()
	evt := ctxevents.NewMessageSentEvent(channelID, "tenant", ctxevents.ChannelMessageSentPayload{
		ChannelID:         channelID,
		MessageID:         "msg-internal-out-001",
		InternalMessageID: uuid.New(),
		RemoteID:          "agent-remote",
		SenderID:          "owner@s.whatsapp.net",
		Timestamp:         ts,
		OccurredAt:        time.Unix(ts, 0).UTC(),
		ObservedAt:        time.Now().UTC(),
		MessageType:       "TEXT",
		Platform:          sharedenums.PlatformInternal,
		OwnerID:           "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if repo.insertIfNewCalls != 0 {
		t.Fatalf("expected 0 InsertIfNew calls for PlatformInternal, got %d", repo.insertIfNewCalls)
	}
	if len(repo.rowsByPlatformID) != 0 {
		t.Errorf("expected 0 projection rows for PlatformInternal, got %d", len(repo.rowsByPlatformID))
	}
}
