package projectors

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	channelenums "template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/projections"
	remoterepo "template/api-go/internal/channel/repositories/remote"
)

// ──────────────────────────────────────────────────────────────────────────────
// Mock Remote Projection Repository
// ──────────────────────────────────────────────────────────────────────────────

type mockRemoteProjectionRepo struct {
	rows map[string]*projections.Remote // key: channelID+"|"+remoteID

	savedRows          []*projections.Remote
	incrementCalls     []struct{ channelID, remoteID string }
	resetCalls         []struct{ channelID, remoteID string }
	updateLastMsgCalls []struct {
		channelID, remoteID string
		at                  time.Time
	}
	updateMembershipCalls []struct {
		channelID, groupID string
		members            []remoterepo.MembershipRow
	}
	addMemberCalls []struct {
		channelID, groupID string
		member             remoterepo.MembershipRow
	}
	removeMemberCalls []struct {
		channelID, groupID, memberID string
	}
	recomputePreviewCalls []struct {
		channelID, remoteID, expectedMessageID string
	}
}

func newMockRemoteRepo() *mockRemoteProjectionRepo {
	return &mockRemoteProjectionRepo{rows: make(map[string]*projections.Remote)}
}

func (m *mockRemoteProjectionRepo) key(channelID, remoteID string) string {
	return channelID + "|" + remoteID
}

func (m *mockRemoteProjectionRepo) Find(_ context.Context, channelID, remoteID string) (*projections.Remote, error) {
	return m.rows[m.key(channelID, remoteID)], nil
}

func (m *mockRemoteProjectionRepo) List(_ context.Context, _ string, _ remoterepo.ListOptions) ([]*projections.Remote, error) {
	return nil, nil
}

func (m *mockRemoteProjectionRepo) FindAllByChannel(_ context.Context, _ string) (map[string]*projections.Remote, error) {
	return nil, nil
}

func (m *mockRemoteProjectionRepo) Save(_ context.Context, r *projections.Remote) error {
	m.rows[m.key(r.ChannelID, r.RemoteID)] = r
	m.savedRows = append(m.savedRows, r)
	return nil
}

func (m *mockRemoteProjectionRepo) InsertIfNew(_ context.Context, r *projections.Remote) (bool, error) {
	k := m.key(r.ChannelID, r.RemoteID)
	if _, exists := m.rows[k]; exists {
		return false, nil
	}
	m.rows[k] = r
	m.savedRows = append(m.savedRows, r)
	return true, nil
}

func (m *mockRemoteProjectionRepo) UpsertAll(_ context.Context, remotes []*projections.Remote) error {
	for _, r := range remotes {
		m.rows[m.key(r.ChannelID, r.RemoteID)] = r
	}
	return nil
}

func (m *mockRemoteProjectionRepo) UpsertContactSnapshot(_ context.Context, remotes []*projections.Remote) error {
	for _, r := range remotes {
		m.rows[m.key(r.ChannelID, r.RemoteID)] = r
	}
	return nil
}

func (m *mockRemoteProjectionRepo) ResetUnreadCount(_ context.Context, channelID, remoteID string) error {
	m.resetCalls = append(m.resetCalls, struct{ channelID, remoteID string }{channelID, remoteID})
	return nil
}

func (m *mockRemoteProjectionRepo) ApplyLatestMessage(_ context.Context, msg *projections.Message) error {
	k := m.key(msg.ChannelID, msg.RemoteID)
	row := m.rows[k]
	if row == nil {
		return nil
	}
	// Mirror the forward-only logic from the real repo so tests can assert on row state.
	if row.LastMessageAt == nil || msg.OccurredAt.After(*row.LastMessageAt) {
		row.LastMessageAt = &msg.OccurredAt
		row.LastMessageID = &msg.ID
	}
	if msg.Direction == string(channelenums.DirectionReceived) {
		row.UnreadMessageCount++
	}
	return nil
}

func (m *mockRemoteProjectionRepo) ApplyHistoricalMessages(_ context.Context, _ []*projections.Message) error {
	return nil
}

func (m *mockRemoteProjectionRepo) RecomputePreviewIfLatest(_ context.Context, channelID, remoteID, expectedMessageID string) error {
	m.recomputePreviewCalls = append(m.recomputePreviewCalls, struct {
		channelID, remoteID, expectedMessageID string
	}{channelID, remoteID, expectedMessageID})
	return nil
}

func (m *mockRemoteProjectionRepo) UpdateMembership(_ context.Context, channelID, groupID string, members []remoterepo.MembershipRow) error {
	m.updateMembershipCalls = append(m.updateMembershipCalls, struct {
		channelID, groupID string
		members            []remoterepo.MembershipRow
	}{channelID, groupID, members})
	return nil
}

func (m *mockRemoteProjectionRepo) AddMember(_ context.Context, channelID, groupID string, member remoterepo.MembershipRow) error {
	m.addMemberCalls = append(m.addMemberCalls, struct {
		channelID, groupID string
		member             remoterepo.MembershipRow
	}{channelID, groupID, member})
	return nil
}

func (m *mockRemoteProjectionRepo) RemoveMember(_ context.Context, channelID, groupID, memberID string) error {
	m.removeMemberCalls = append(m.removeMemberCalls, struct {
		channelID, groupID, memberID string
	}{channelID, groupID, memberID})
	return nil
}

func (m *mockRemoteProjectionRepo) BackfillLastMessagePreview(_ context.Context, _ string) error {
	return nil
}

func (m *mockRemoteProjectionRepo) BulkUpdateMemberships(_ context.Context, _ string, _ map[string][]remoterepo.MembershipRow) error {
	return nil
}

func (m *mockRemoteProjectionRepo) UpdateAvatar(_ context.Context, _, _, _ string) error {
	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Helper: seed a row in the mock repo
// ──────────────────────────────────────────────────────────────────────────────

func seedRemote(repo *mockRemoteProjectionRepo, channelID, remoteID string) *projections.Remote {
	r := &projections.Remote{
		ChannelID: channelID,
		RemoteID:  remoteID,
		Type:      string(channelenums.RemoteTypeUser),
		CreatedAt: time.Now().UTC(),
		UpdatedAt: time.Now().UTC(),
	}
	repo.rows[repo.key(channelID, remoteID)] = r
	return r
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

func TestRemoteCreatedProjector_SavesRow(t *testing.T) {
	repo := newMockRemoteRepo()
	p := NewRemoteCreatedProjector(repo)

	channelID := uuid.New()
	evt := ctxevents.NewRemoteCreatedEvent(channelID, "tenant", ctxevents.ChannelRemoteCreatedPayload{
		ChannelID:  channelID,
		RemoteID:   "remote-1@s.whatsapp.net",
		RemoteType: channelenums.RemoteTypeUser,
		OwnerID:    "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(repo.savedRows) != 1 {
		t.Fatalf("expected 1 save, got %d", len(repo.savedRows))
	}
	saved := repo.savedRows[0]
	if saved.ChannelID != channelID.String() {
		t.Errorf("channelID mismatch: want %s got %s", channelID, saved.ChannelID)
	}
	if saved.RemoteID != "remote-1@s.whatsapp.net" {
		t.Errorf("remoteID mismatch: got %s", saved.RemoteID)
	}
	if saved.Type != string(channelenums.RemoteTypeUser) {
		t.Errorf("type mismatch: got %s", saved.Type)
	}
}

func TestRemoteDeletedProjector_SetsDeletedAt(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "remote-1@s.whatsapp.net"
	seedRemote(repo, channelID.String(), remoteID)

	p := NewRemoteDeletedProjector(repo)
	at := time.Now().UTC()
	evt := ctxevents.NewRemoteDeletedEvent(channelID, "tenant", ctxevents.ChannelRemoteDeletedPayload{
		ChannelID: channelID,
		RemoteID:  remoteID,
		At:        at,
		OwnerID:   "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	row := repo.rows[repo.key(channelID.String(), remoteID)]
	if row.DeletedAt == nil {
		t.Fatal("expected deleted_at to be set")
	}
	if !row.DeletedAt.Equal(at) {
		t.Errorf("deleted_at mismatch: want %v got %v", at, row.DeletedAt)
	}
}

func TestRemoteDeletedProjector_NotFoundIsNonFatal(t *testing.T) {
	repo := newMockRemoteRepo()
	p := NewRemoteDeletedProjector(repo)
	channelID := uuid.New()
	evt := ctxevents.NewRemoteDeletedEvent(channelID, "tenant", ctxevents.ChannelRemoteDeletedPayload{
		ChannelID: channelID,
		RemoteID:  "ghost@s.whatsapp.net",
		At:        time.Now().UTC(),
		OwnerID:   "tenant",
	})
	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("expected nil on not-found, got: %v", err)
	}
}

func TestRemoteUpdatedProjector_UpdatesNameAndType(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "group-1@g.us"
	seedRemote(repo, channelID.String(), remoteID)

	p := NewRemoteUpdatedProjector(repo)
	evt := ctxevents.NewRemoteUpdatedEvent(channelID, "tenant", ctxevents.ChannelRemoteUpdatedPayload{
		ChannelID:  channelID,
		RemoteID:   remoteID,
		Type:       channelenums.RemoteTypeGroup,
		Name:       "My Group",
		ObservedAt: time.Now().UTC(),
		OwnerID:    "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	row := repo.rows[repo.key(channelID.String(), remoteID)]
	if row.Name != "My Group" {
		t.Errorf("name mismatch: got %s", row.Name)
	}
	if row.Type != string(channelenums.RemoteTypeGroup) {
		t.Errorf("type mismatch: got %s", row.Type)
	}
}

func TestRemotePinnedProjector_SetsPinnedAt(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "remote-1@s.whatsapp.net"
	seedRemote(repo, channelID.String(), remoteID)

	p := NewRemotePinnedProjector(repo)
	at := time.Now().UTC()
	evt := ctxevents.NewRemotePinnedEvent(channelID, "tenant", ctxevents.ChannelRemotePinnedPayload{
		ChannelID: channelID,
		RemoteID:  remoteID,
		At:        at,
		OwnerID:   "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	row := repo.rows[repo.key(channelID.String(), remoteID)]
	if row.PinnedAt == nil {
		t.Fatal("expected pinned_at to be set")
	}
	if !row.PinnedAt.Equal(at) {
		t.Errorf("pinned_at mismatch: want %v got %v", at, row.PinnedAt)
	}
}

func TestRemoteUnpinnedProjector_ClearsPinnedAt(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "remote-1@s.whatsapp.net"
	r := seedRemote(repo, channelID.String(), remoteID)
	at := time.Now().UTC()
	r.PinnedAt = &at

	p := NewRemoteUnpinnedProjector(repo)
	evt := ctxevents.NewRemoteUnpinnedEvent(channelID, "tenant", ctxevents.ChannelRemoteUnpinnedPayload{
		ChannelID: channelID,
		RemoteID:  remoteID,
		At:        time.Now().UTC(),
		OwnerID:   "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	row := repo.rows[repo.key(channelID.String(), remoteID)]
	if row.PinnedAt != nil {
		t.Errorf("expected pinned_at nil, got %v", row.PinnedAt)
	}
}

func TestRemoteArchivedProjector_SetsArchived(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "remote-1@s.whatsapp.net"
	seedRemote(repo, channelID.String(), remoteID)

	p := NewRemoteArchivedProjector(repo)
	evt := ctxevents.NewRemoteArchivedEvent(channelID, "tenant", ctxevents.ChannelRemoteArchivedPayload{
		ChannelID: channelID,
		RemoteID:  remoteID,
		At:        time.Now().UTC(),
		OwnerID:   "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	row := repo.rows[repo.key(channelID.String(), remoteID)]
	if !row.Archived {
		t.Error("expected archived=true")
	}
}

func TestRemoteUnarchivedProjector_ClearsArchived(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "remote-1@s.whatsapp.net"
	r := seedRemote(repo, channelID.String(), remoteID)
	r.Archived = true

	p := NewRemoteUnarchivedProjector(repo)
	evt := ctxevents.NewRemoteUnarchivedEvent(channelID, "tenant", ctxevents.ChannelRemoteUnarchivedPayload{
		ChannelID: channelID,
		RemoteID:  remoteID,
		At:        time.Now().UTC(),
		OwnerID:   "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	row := repo.rows[repo.key(channelID.String(), remoteID)]
	if row.Archived {
		t.Error("expected archived=false")
	}
}

func TestRemoteMutedProjector_SetsMuteExpiration(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "remote-1@s.whatsapp.net"
	seedRemote(repo, channelID.String(), remoteID)

	p := NewRemoteMutedProjector(repo)
	until := time.Now().Add(24 * time.Hour).UTC()
	evt := ctxevents.NewRemoteMutedEvent(channelID, "tenant", ctxevents.ChannelRemoteMutedPayload{
		ChannelID:  channelID,
		RemoteID:   remoteID,
		At:         time.Now().UTC(),
		MutedUntil: &until,
		OwnerID:    "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	row := repo.rows[repo.key(channelID.String(), remoteID)]
	if row.MuteExpiration == nil {
		t.Fatal("expected mute_expiration to be set")
	}
	if !row.MuteExpiration.Equal(until) {
		t.Errorf("mute_expiration mismatch: want %v got %v", until, row.MuteExpiration)
	}
}

func TestRemoteMutedProjector_NilUntilUsesFarFuture(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "remote-1@s.whatsapp.net"
	seedRemote(repo, channelID.String(), remoteID)

	p := NewRemoteMutedProjector(repo)
	evt := ctxevents.NewRemoteMutedEvent(channelID, "tenant", ctxevents.ChannelRemoteMutedPayload{
		ChannelID:  channelID,
		RemoteID:   remoteID,
		At:         time.Now().UTC(),
		MutedUntil: nil, // muted forever
		OwnerID:    "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	row := repo.rows[repo.key(channelID.String(), remoteID)]
	if row.MuteExpiration == nil {
		t.Fatal("expected mute_expiration to be set (far-future)")
	}
	if row.MuteExpiration.Year() != 9999 {
		t.Errorf("expected far-future year 9999, got %d", row.MuteExpiration.Year())
	}
}

func TestRemoteUnmutedProjector_ClearsMuteExpiration(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "remote-1@s.whatsapp.net"
	r := seedRemote(repo, channelID.String(), remoteID)
	until := time.Now().Add(24 * time.Hour).UTC()
	r.MuteExpiration = &until

	p := NewRemoteUnmutedProjector(repo)
	evt := ctxevents.NewRemoteUnmutedEvent(channelID, "tenant", ctxevents.ChannelRemoteUnmutedPayload{
		ChannelID: channelID,
		RemoteID:  remoteID,
		At:        time.Now().UTC(),
		OwnerID:   "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	row := repo.rows[repo.key(channelID.String(), remoteID)]
	if row.MuteExpiration != nil {
		t.Errorf("expected mute_expiration nil, got %v", row.MuteExpiration)
	}
}

func TestRemoteMarkedAsUnreadProjector_SetsFlag(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "remote-1@s.whatsapp.net"
	seedRemote(repo, channelID.String(), remoteID)

	p := NewRemoteMarkedAsUnreadProjector(repo)
	evt := ctxevents.NewRemoteMarkedAsUnreadEvent(channelID, "tenant", ctxevents.ChannelRemoteMarkedAsUnreadPayload{
		ChannelID: channelID,
		RemoteID:  remoteID,
		At:        time.Now().UTC(),
		OwnerID:   "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	row := repo.rows[repo.key(channelID.String(), remoteID)]
	if !row.MarkedAsUnread {
		t.Error("expected marked_as_unread=true")
	}
}

func TestRemoteChatSeenProjector_ClearsUnreadState(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "remote-1@s.whatsapp.net"
	r := seedRemote(repo, channelID.String(), remoteID)
	r.UnreadMessageCount = 5
	r.MarkedAsUnread = true

	p := NewRemoteChatSeenProjector(repo)
	evt := ctxevents.NewRemoteChatSeenEvent(channelID, "tenant", ctxevents.ChannelRemoteChatSeenPayload{
		ChannelID: channelID,
		RemoteID:  remoteID,
		At:        time.Now().UTC(),
		OwnerID:   "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	row := repo.rows[repo.key(channelID.String(), remoteID)]
	if row.UnreadMessageCount != 0 {
		t.Errorf("expected unread_message_count=0, got %d", row.UnreadMessageCount)
	}
	if row.MarkedAsUnread {
		t.Error("expected marked_as_unread=false")
	}
}

func TestRemoteOnMessageReceivedProjector_CallsApplyLatestMessage(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "remote-1@s.whatsapp.net"
	seedRemote(repo, channelID.String(), remoteID)

	expectedInternalID := uuid.New()

	p := NewRemoteOnMessageReceivedProjector(repo)
	ts := time.Now().Unix()
	evt := ctxevents.NewMessageReceivedEvent(channelID, "tenant", ctxevents.ChannelMessageReceivedPayload{
		ChannelID:         channelID,
		MessageID:         "msg-abc",
		InternalMessageID: expectedInternalID,
		RemoteID:          remoteID,
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

	r, err := repo.Find(context.Background(), channelID.String(), remoteID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if r.LastMessageID == nil {
		t.Fatal("LastMessageID must be set by ApplyLatestMessage")
	}
	if *r.LastMessageID != expectedInternalID.String() {
		t.Errorf("last_message_id: want %s, got %s", expectedInternalID.String(), *r.LastMessageID)
	}
	if r.LastMessageAt == nil {
		t.Fatal("LastMessageAt must be set by ApplyLatestMessage")
	}
	if r.UnreadMessageCount != 1 {
		t.Errorf("UnreadMessageCount: want 1, got %d", r.UnreadMessageCount)
	}
}

func TestRemoteOnMessageSentProjector_CallsApplyLatestMessage(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "remote-1@s.whatsapp.net"
	seedRemote(repo, channelID.String(), remoteID)

	expectedInternalID := uuid.New()

	p := NewRemoteOnMessageSentProjector(repo)
	ts := time.Now().Unix()
	evt := ctxevents.NewMessageSentEvent(channelID, "tenant", ctxevents.ChannelMessageSentPayload{
		ChannelID:         channelID,
		MessageID:         "msg-xyz",
		InternalMessageID: expectedInternalID,
		RemoteID:          remoteID,
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

	r, err := repo.Find(context.Background(), channelID.String(), remoteID)
	if err != nil {
		t.Fatalf("Find: %v", err)
	}
	if r.LastMessageID == nil {
		t.Fatal("LastMessageID must be set by ApplyLatestMessage")
	}
	if *r.LastMessageID != expectedInternalID.String() {
		t.Errorf("last_message_id: want %s, got %s", expectedInternalID.String(), *r.LastMessageID)
	}
	if r.LastMessageAt == nil {
		t.Fatal("LastMessageAt must be set by ApplyLatestMessage")
	}
	if r.UnreadMessageCount != 0 {
		t.Errorf("UnreadMessageCount: want 0 for sent message, got %d", r.UnreadMessageCount)
	}
}

func TestRemoteCreatedProjector_IsNoOpWhenRowAlreadyExists(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "remote-already@s.whatsapp.net"
	// Simulate that remote_updated ran first and created a stub with a name.
	existing := seedRemote(repo, channelID.String(), remoteID)
	existing.Name = "Already Named"

	p := NewRemoteCreatedProjector(repo)
	evt := ctxevents.NewRemoteCreatedEvent(channelID, "tenant", ctxevents.ChannelRemoteCreatedPayload{
		ChannelID:  channelID,
		RemoteID:   remoteID,
		RemoteType: channelenums.RemoteTypeUser,
		OwnerID:    "tenant",
	})

	savedBefore := len(repo.savedRows)
	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	// InsertIfNew should have been a no-op — no new save, name must be preserved.
	if len(repo.savedRows) != savedBefore {
		t.Fatalf("expected no additional save when row already exists (first-write-wins), got %d saves", len(repo.savedRows)-savedBefore)
	}
	row := repo.rows[repo.key(channelID.String(), remoteID)]
	if row.Name != "Already Named" {
		t.Errorf("name was overwritten by late remote_created: got %q, want %q", row.Name, "Already Named")
	}
}

func TestRemoteUpdatedProjector_CreatesStubWhenNotFound(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "ghost-group@g.us"

	p := NewRemoteUpdatedProjector(repo)
	evt := ctxevents.NewRemoteUpdatedEvent(channelID, "tenant", ctxevents.ChannelRemoteUpdatedPayload{
		ChannelID:  channelID,
		RemoteID:   remoteID,
		Type:       channelenums.RemoteTypeGroup,
		Name:       "Late Group",
		ObservedAt: time.Now().UTC(),
		OwnerID:    "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	if len(repo.savedRows) != 1 {
		t.Fatalf("expected 1 saved row (stub creation), got %d", len(repo.savedRows))
	}
	row := repo.savedRows[0]
	if row.ChannelID != channelID.String() {
		t.Errorf("channelID mismatch: want %s got %s", channelID, row.ChannelID)
	}
	if row.RemoteID != remoteID {
		t.Errorf("remoteID mismatch: got %s", row.RemoteID)
	}
	if row.Name != "Late Group" {
		t.Errorf("name mismatch: got %s", row.Name)
	}
}

// ──────────────────────────────────────────────────────────────────────────────
// seedMessage helper (for RemoteOnMessageDeletedProjector tests)
// Uses mockMessageProjectionRepo defined in message_projector_test.go (same pkg).
// ──────────────────────────────────────────────────────────────────────────────

// seedMessage seeds a message into the mock by its platform ID.
func seedMessage(repo *mockMessageProjectionRepo, channelID, remoteID, internalID, platformID string) *projections.Message {
	msg := &projections.Message{
		ID:                internalID,
		ChannelID:         channelID,
		RemoteID:          remoteID,
		PlatformMessageID: platformID,
		Direction:         string(channelenums.DirectionReceived),
		OccurredAt:        time.Now().UTC(),
		ObservedAt:        time.Now().UTC(),
	}
	repo.rowsByPlatformID[repo.platformKey(channelID, platformID)] = msg
	repo.rowsByID[internalID] = msg
	return msg
}

// TestRemoteSyncedProjector_* tests removed in T9 — RemoteSyncedProjector deleted.

func TestRemoteOnMessageReceivedProjector_SkipsWhenRemoteNotProjected(t *testing.T) {
	repo := newMockRemoteRepo()
	channelID := uuid.New()
	remoteID := "not-yet-projected@s.whatsapp.net"
	// No seedRemote — remote doesn't exist yet.

	p := NewRemoteOnMessageReceivedProjector(repo)
	ts := time.Now().Unix()
	evt := ctxevents.NewMessageReceivedEvent(channelID, "tenant", ctxevents.ChannelMessageReceivedPayload{
		ChannelID:   channelID,
		MessageID:   "msg-early",
		RemoteID:    remoteID,
		SenderID:    "sender@s.whatsapp.net",
		FromMe:      false,
		Timestamp:   ts,
		OccurredAt:  time.Unix(ts, 0).UTC(),
		ObservedAt:  time.Now().UTC(),
		MessageType: "TEXT",
		Platform:    "WHATSAPP",
		OwnerID:     "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}
	// TODO(task-7): verify ApplyLatestMessage behavior when remote not found
}

// ──────────────────────────────────────────────────────────────────────────────
// RemoteOnMessageDeletedProjector tests
// ──────────────────────────────────────────────────────────────────────────────

func TestRemoteOnMessageDeletedProjector_DeletingCurrentLatest_CallsRecompute(t *testing.T) {
	// Setup — seed a channel, a remote, two messages in the message projection,
	// and point the remote at the newer message.
	// Fire a channel.message_deleted event with the platform id of the newer message.
	// Assert: RecomputePreviewIfLatest is called with the internal id of the newer msg.
	// (The guard logic inside the real repo — walk-back to older msg — is tested in
	//  pg_remote_projection_repository_test.go. Here we verify the projector routes
	//  correctly to the repo method.)

	remoteRepo := newMockRemoteRepo()
	msgRepo := newMockMessageRepo()

	channelID := uuid.New()
	remoteID := "remote@s.whatsapp.net"
	olderInternalID := uuid.New().String()
	newerInternalID := uuid.New().String()

	seedRemote(remoteRepo, channelID.String(), remoteID)
	seedMessage(msgRepo, channelID.String(), remoteID, olderInternalID, "plat-old")
	seedMessage(msgRepo, channelID.String(), remoteID, newerInternalID, "plat-new")

	// Point the remote at the newer message (simulate ApplyLatestMessage).
	r := remoteRepo.rows[remoteRepo.key(channelID.String(), remoteID)]
	r.LastMessageID = &newerInternalID

	p := NewRemoteOnMessageDeletedProjector(msgRepo, remoteRepo)
	evt := ctxevents.NewMessageDeletedEvent(channelID, "tenant", ctxevents.ChannelMessageDeletedPayload{
		ChannelID: channelID,
		MessageID: "plat-new",
		RemoteID:  remoteID,
		Platform:  "WHATSAPP",
		OwnerID:   "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}

	if len(remoteRepo.recomputePreviewCalls) != 1 {
		t.Fatalf("expected 1 RecomputePreviewIfLatest call, got %d", len(remoteRepo.recomputePreviewCalls))
	}
	call := remoteRepo.recomputePreviewCalls[0]
	if call.channelID != channelID.String() {
		t.Errorf("channelID: want %s, got %s", channelID.String(), call.channelID)
	}
	if call.remoteID != remoteID {
		t.Errorf("remoteID: want %s, got %s", remoteID, call.remoteID)
	}
	if call.expectedMessageID != newerInternalID {
		t.Errorf("expectedMessageID: want %s, got %s", newerInternalID, call.expectedMessageID)
	}
}

func TestRemoteOnMessageDeletedProjector_DeletingNonLatest_StillCallsRecompute(t *testing.T) {
	// Seed remote pointing at msgA (the current latest). Fire delete event for
	// msgB (not the current preview). The projector DOES look up msgB by platform id
	// and calls RecomputePreviewIfLatest — the guard inside the real repo no-ops
	// because r.last_message_id != msgB.internal_id. Verify the projector delegates
	// correctly regardless; do NOT test the guard here.

	remoteRepo := newMockRemoteRepo()
	msgRepo := newMockMessageRepo()

	channelID := uuid.New()
	remoteID := "remote@s.whatsapp.net"
	msgAInternalID := uuid.New().String()
	msgBInternalID := uuid.New().String()

	seedRemote(remoteRepo, channelID.String(), remoteID)
	seedMessage(msgRepo, channelID.String(), remoteID, msgAInternalID, "plat-a")
	seedMessage(msgRepo, channelID.String(), remoteID, msgBInternalID, "plat-b")

	// Remote points at msgA, not msgB.
	r := remoteRepo.rows[remoteRepo.key(channelID.String(), remoteID)]
	r.LastMessageID = &msgAInternalID

	p := NewRemoteOnMessageDeletedProjector(msgRepo, remoteRepo)
	evt := ctxevents.NewMessageDeletedEvent(channelID, "tenant", ctxevents.ChannelMessageDeletedPayload{
		ChannelID: channelID,
		MessageID: "plat-b", // not the current preview
		RemoteID:  remoteID,
		Platform:  "WHATSAPP",
		OwnerID:   "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("Handle: %v", err)
	}

	// Projector calls RecomputePreviewIfLatest with msgB's internal id.
	// The real repo guard (r.last_message_id != msgB.id) causes a no-op there,
	// but the projector itself must still delegate.
	if len(remoteRepo.recomputePreviewCalls) != 1 {
		t.Fatalf("expected 1 RecomputePreviewIfLatest call, got %d", len(remoteRepo.recomputePreviewCalls))
	}
	call := remoteRepo.recomputePreviewCalls[0]
	if call.expectedMessageID != msgBInternalID {
		t.Errorf("expectedMessageID: want %s (msgB), got %s", msgBInternalID, call.expectedMessageID)
	}
}

func TestRemoteOnMessageDeletedProjector_MessageNotProjected_NoOp(t *testing.T) {
	// Fire delete event for a platform message id that doesn't exist in messages.
	// Projector's FindByPlatformID returns nil → Handle returns nil (silent skip).
	// No panics, no errors, no RecomputePreviewIfLatest call.

	remoteRepo := newMockRemoteRepo()
	msgRepo := newMockMessageRepo()

	channelID := uuid.New()
	remoteID := "remote@s.whatsapp.net"
	seedRemote(remoteRepo, channelID.String(), remoteID)
	// Do NOT seed any message — msgRepo returns nil for all FindByPlatformID.

	p := NewRemoteOnMessageDeletedProjector(msgRepo, remoteRepo)
	evt := ctxevents.NewMessageDeletedEvent(channelID, "tenant", ctxevents.ChannelMessageDeletedPayload{
		ChannelID: channelID,
		MessageID: "ghost-platform-id",
		RemoteID:  remoteID,
		Platform:  "WHATSAPP",
		OwnerID:   "tenant",
	})

	if err := p.Handle(context.Background(), evt); err != nil {
		t.Fatalf("expected nil on missing message, got: %v", err)
	}
	if len(remoteRepo.recomputePreviewCalls) != 0 {
		t.Errorf("expected 0 RecomputePreviewIfLatest calls, got %d", len(remoteRepo.recomputePreviewCalls))
	}
}
