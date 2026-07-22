package entities

import (
	"time"

	channelenums "template/api-go/internal/channel/enums"
	ctxerrors "template/api-go/internal/channel/errors"
	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/shared/entities"
	"template/api-go/internal/shared/errors"
	sharedenums "template/api-go/internal/shared/enums"

	"github.com/google/uuid"
)

// Remote is the aggregate root for a conversation counterpart (user or group)
// within a channel.
//
// Invariant-bearing fields only — projection-only fields (name, avatarURL,
// isBlocked, unreadMessageCount, lastMessageAt) live in the read model, not
// here. The aggregate enforces lifecycle invariants (deleted, pinned,
// archived, muted) and emits domain events for every state change.
type Remote struct {
	entities.BaseEntity
	channelID      uuid.UUID
	remoteID       string
	remoteType     channelenums.RemoteType
	ownerID        string
	platform       sharedenums.Platform
	deletedAt      *time.Time
	pinnedAt       *time.Time
	archived       bool
	muteExpiration *time.Time
	markedAsUnread bool
}

// Accessors — exported read-only getters for repository hydration and use cases.

func (r *Remote) ChannelID() uuid.UUID               { return r.channelID }
func (r *Remote) RemoteID() string                    { return r.remoteID }
func (r *Remote) RemoteType() channelenums.RemoteType { return r.remoteType }
func (r *Remote) OwnerID() string                     { return r.ownerID }
func (r *Remote) Platform() sharedenums.Platform      { return r.platform }
func (r *Remote) DeletedAt() *time.Time               { return r.deletedAt }
func (r *Remote) PinnedAt() *time.Time                { return r.pinnedAt }
func (r *Remote) Archived() bool                      { return r.archived }
func (r *Remote) MuteExpiration() *time.Time          { return r.muteExpiration }
func (r *Remote) MarkedAsUnread() bool                { return r.markedAsUnread }

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

// NewRemoteParams are the parameters for creating a new Remote aggregate.
type NewRemoteParams struct {
	ChannelID  uuid.UUID
	RemoteID   string
	RemoteType channelenums.RemoteType
	OwnerID    string
	Platform   sharedenums.Platform
}

// NewRemote creates a new Remote aggregate and raises a RemoteCreatedEvent.
func NewRemote(params NewRemoteParams) (*Remote, error) {
	if params.RemoteID == "" {
		return nil, errors.NewBaseError(ctxerrors.CodeRemoteInvalidParams, "remoteId is required")
	}
	if params.ChannelID == (uuid.UUID{}) {
		return nil, errors.NewBaseError(ctxerrors.CodeRemoteInvalidParams, "channelId is required")
	}

	r := &Remote{
		BaseEntity: entities.NewBaseEntity(),
		channelID:  params.ChannelID,
		remoteID:   params.RemoteID,
		remoteType: params.RemoteType,
		ownerID:    params.OwnerID,
		platform:   params.Platform,
	}

	r.AddDomainEvent(ctxevents.NewRemoteCreatedEvent(
		r.ID.UUID(),
		params.OwnerID,
		ctxevents.ChannelRemoteCreatedPayload{
			ChannelID:  params.ChannelID,
			RemoteID:   params.RemoteID,
			RemoteType: params.RemoteType,
			OwnerID:    params.OwnerID,
			Platform:   params.Platform,
		},
	))

	return r, nil
}

// ---------------------------------------------------------------------------
// Reconstruction (no events, no validation)
// ---------------------------------------------------------------------------

// ReconstructRemoteParams are the parameters for hydrating a Remote from persistence.
type ReconstructRemoteParams struct {
	ID             uuid.UUID
	ChannelID      uuid.UUID
	RemoteID       string
	RemoteType     channelenums.RemoteType
	OwnerID        string
	Platform       sharedenums.Platform
	DeletedAt      *time.Time
	PinnedAt       *time.Time
	Archived       bool
	MuteExpiration *time.Time
	MarkedAsUnread bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
	Version        int
}

// ReconstructRemote recreates a Remote from persistence — no events, no validation.
func ReconstructRemote(params ReconstructRemoteParams) *Remote {
	return &Remote{
		BaseEntity:     entities.ReconstructBaseEntity(entities.ReconstructBaseEntityParams{ID: params.ID, CreatedAt: params.CreatedAt, UpdatedAt: params.UpdatedAt, Version: params.Version}),
		channelID:      params.ChannelID,
		remoteID:       params.RemoteID,
		remoteType:     params.RemoteType,
		ownerID:        params.OwnerID,
		platform:       params.Platform,
		deletedAt:      params.DeletedAt,
		pinnedAt:       params.PinnedAt,
		archived:       params.Archived,
		muteExpiration: params.MuteExpiration,
		markedAsUnread: params.MarkedAsUnread,
	}
}

// ---------------------------------------------------------------------------
// Behavior methods
// ---------------------------------------------------------------------------

// Pin pins the remote at the given time.
// Invariants: not deleted, not already pinned.
func (r *Remote) Pin(at time.Time) error {
	if r.deletedAt != nil {
		return errors.NewBaseError(ctxerrors.CodeRemoteDeleted, "cannot pin a deleted remote")
	}
	if r.pinnedAt != nil {
		return errors.NewBaseError(ctxerrors.CodeRemoteAlreadyPinned, "remote is already pinned")
	}

	r.pinnedAt = &at
	r.IncrementVersion()
	r.AddDomainEvent(ctxevents.NewRemotePinnedEvent(
		r.ID.UUID(),
		r.ownerID,
		ctxevents.ChannelRemotePinnedPayload{
			ChannelID: r.channelID,
			RemoteID:  r.remoteID,
			At:        at,
			OwnerID:   r.ownerID,
		},
	))
	return nil
}

// Unpin removes the pin from the remote.
// Invariant: currently pinned.
func (r *Remote) Unpin() error {
	if r.pinnedAt == nil {
		return errors.NewBaseError(ctxerrors.CodeRemoteNotPinned, "remote is not pinned")
	}

	at := time.Now().UTC()
	r.pinnedAt = nil
	r.IncrementVersion()
	r.AddDomainEvent(ctxevents.NewRemoteUnpinnedEvent(
		r.ID.UUID(),
		r.ownerID,
		ctxevents.ChannelRemoteUnpinnedPayload{
			ChannelID: r.channelID,
			RemoteID:  r.remoteID,
			At:        at,
			OwnerID:   r.ownerID,
		},
	))
	return nil
}

// Archive archives the remote.
// Invariant: not deleted, not already archived.
func (r *Remote) Archive() error {
	if r.deletedAt != nil {
		return errors.NewBaseError(ctxerrors.CodeRemoteDeleted, "cannot archive a deleted remote")
	}
	if r.archived {
		return errors.NewBaseError(ctxerrors.CodeRemoteAlreadyArchived, "remote is already archived")
	}

	at := time.Now().UTC()
	r.archived = true
	r.IncrementVersion()
	r.AddDomainEvent(ctxevents.NewRemoteArchivedEvent(
		r.ID.UUID(),
		r.ownerID,
		ctxevents.ChannelRemoteArchivedPayload{
			ChannelID: r.channelID,
			RemoteID:  r.remoteID,
			At:        at,
			OwnerID:   r.ownerID,
		},
	))
	return nil
}

// Unarchive removes the archive flag from the remote.
// Invariant: currently archived.
func (r *Remote) Unarchive() error {
	if !r.archived {
		return errors.NewBaseError(ctxerrors.CodeRemoteNotArchived, "remote is not archived")
	}

	at := time.Now().UTC()
	r.archived = false
	r.IncrementVersion()
	r.AddDomainEvent(ctxevents.NewRemoteUnarchivedEvent(
		r.ID.UUID(),
		r.ownerID,
		ctxevents.ChannelRemoteUnarchivedPayload{
			ChannelID: r.channelID,
			RemoteID:  r.remoteID,
			At:        at,
			OwnerID:   r.ownerID,
		},
	))
	return nil
}

// Mute mutes the remote until the given expiration time.
// Invariant: not deleted.
func (r *Remote) Mute(until time.Time) error {
	if r.deletedAt != nil {
		return errors.NewBaseError(ctxerrors.CodeRemoteDeleted, "cannot mute a deleted remote")
	}

	r.muteExpiration = &until
	r.IncrementVersion()
	r.AddDomainEvent(ctxevents.NewRemoteMutedEvent(
		r.ID.UUID(),
		r.ownerID,
		ctxevents.ChannelRemoteMutedPayload{
			ChannelID:  r.channelID,
			RemoteID:   r.remoteID,
			At:         time.Now().UTC(),
			MutedUntil: &until,
			OwnerID:    r.ownerID,
		},
	))
	return nil
}

// Unmute removes the mute from the remote.
// Invariant: not deleted.
func (r *Remote) Unmute() error {
	if r.deletedAt != nil {
		return errors.NewBaseError(ctxerrors.CodeRemoteDeleted, "cannot unmute a deleted remote")
	}
	r.muteExpiration = nil
	r.IncrementVersion()
	r.AddDomainEvent(ctxevents.NewRemoteUnmutedEvent(
		r.ID.UUID(),
		r.ownerID,
		ctxevents.ChannelRemoteUnmutedPayload{
			ChannelID: r.channelID,
			RemoteID:  r.remoteID,
			At:        time.Now().UTC(),
			OwnerID:   r.ownerID,
		},
	))
	return nil
}

// MarkAsUnread marks the remote as having unread messages.
// Invariant: not deleted.
func (r *Remote) MarkAsUnread() error {
	if r.deletedAt != nil {
		return errors.NewBaseError(ctxerrors.CodeRemoteDeleted, "cannot mark a deleted remote as unread")
	}

	r.markedAsUnread = true
	r.IncrementVersion()
	r.AddDomainEvent(ctxevents.NewRemoteMarkedAsUnreadEvent(
		r.ID.UUID(),
		r.ownerID,
		ctxevents.ChannelRemoteMarkedAsUnreadPayload{
			ChannelID: r.channelID,
			RemoteID:  r.remoteID,
			At:        time.Now().UTC(),
			OwnerID:   r.ownerID,
		},
	))
	return nil
}

// MarkChatSeen clears the unread marker and emits a chat-seen event.
// Invariant: not deleted.
func (r *Remote) MarkChatSeen() error {
	if r.deletedAt != nil {
		return errors.NewBaseError(ctxerrors.CodeRemoteDeleted, "cannot mark a deleted remote as seen")
	}
	r.markedAsUnread = false
	r.IncrementVersion()
	r.AddDomainEvent(ctxevents.NewRemoteChatSeenEvent(
		r.ID.UUID(),
		r.ownerID,
		ctxevents.ChannelRemoteChatSeenPayload{
			ChannelID: r.channelID,
			RemoteID:  r.remoteID,
			At:        time.Now().UTC(),
			OwnerID:   r.ownerID,
		},
	))
	return nil
}

// MarkDeleted soft-deletes the remote at the given time.
// Invariant: not already deleted.
func (r *Remote) MarkDeleted(at time.Time) error {
	if r.deletedAt != nil {
		return errors.NewBaseError(ctxerrors.CodeRemoteAlreadyDeleted, "remote is already deleted")
	}

	r.deletedAt = &at
	r.IncrementVersion()
	r.AddDomainEvent(ctxevents.NewRemoteDeletedEvent(
		r.ID.UUID(),
		r.ownerID,
		ctxevents.ChannelRemoteDeletedPayload{
			ChannelID: r.channelID,
			RemoteID:  r.remoteID,
			At:        at,
			OwnerID:   r.ownerID,
		},
	))
	return nil
}
