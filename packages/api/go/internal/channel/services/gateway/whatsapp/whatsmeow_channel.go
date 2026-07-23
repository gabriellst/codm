package whatsapp

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	channelenums "template/api-go/internal/channel/enums"
	msgenums "template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	"template/api-go/internal/channel/projections"
	messagerepo "template/api-go/internal/channel/repositories/message"
	remoterepo "template/api-go/internal/channel/repositories/remote"
	"template/api-go/internal/channel/services/gateway"
	waevents "template/api-go/internal/channel/services/gateway/whatsapp/events"
	mapperpkg "template/api-go/internal/channel/services/gateway/whatsapp/mapper"
	repositories "template/core-go/repositories"
	"time"

	"golang.org/x/time/rate"

	"github.com/google/uuid"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/appstate"
	"go.mau.fi/whatsmeow/proto/waCompanionReg"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"google.golang.org/protobuf/proto"

	waLog "go.mau.fi/whatsmeow/util/log"
)

// WhatsmeowChannel wraps a whatsmeow.Client to implement the gateway.Channel interface.
// compile-time interface check.
var _ gateway.Channel = (*WhatsmeowChannel)(nil)

type WhatsmeowChannel struct {
	instanceID      uuid.UUID
	ownerID         string
	ownerRemoteID   string
	client          *whatsmeow.Client
	device          *store.Device
	container       *sqlstore.Container
	db              *sql.DB
	domainEventRepo repositories.DomainEventRepository
	remoteProjRepo  remoterepo.RemoteProjectionRepository
	messageProjRepo messagerepo.MessageProjectionRepository
	status          gateway.ConnectionStatus
	mu              sync.RWMutex
	// stopCtx / stopCancel are used to cancel background goroutines (e.g. history
	// sync) when the channel disconnects. Goroutines launched during handleEvent
	// must use stopCtx so they stop writing to the DB after Disconnect() is called.
	stopCtx       context.Context
	stopCancel    context.CancelFunc
	avatarLimiter *rate.Limiter
}

func init() {
	store.DeviceProps.PlatformType = waCompanionReg.DeviceProps_CHROME.Enum()
	store.DeviceProps.Os = proto.String("ZapGo")
}

// NewWhatsmeowChannel creates a new WhatsmeowChannel wrapping the given whatsmeow device.
func NewWhatsmeowChannel(
	instanceID uuid.UUID,
	ownerID string,
	ownerRemoteID string,
	container *sqlstore.Container,
	db *sql.DB,
	device *store.Device,
	repo repositories.DomainEventRepository,
	remoteRepo remoterepo.RemoteProjectionRepository,
	messageRepo messagerepo.MessageProjectionRepository,
) *WhatsmeowChannel {
	client := whatsmeow.NewClient(device, waLog.Stdout("whatsmeow", "INFO", true))
	client.EnableAutoReconnect = true
	client.AutoTrustIdentity = true

	stopCtx, stopCancel := context.WithCancel(context.Background())

	ch := &WhatsmeowChannel{
		instanceID:      instanceID,
		ownerID:         ownerID,
		ownerRemoteID:   ownerRemoteID,
		client:          client,
		device:          device,
		container:       container,
		db:              db,
		domainEventRepo: repo,
		remoteProjRepo:  remoteRepo,
		messageProjRepo: messageRepo,
		status:          gateway.ConnectionStatusDisconnected,
		stopCtx:         stopCtx,
		stopCancel:      stopCancel,
	}

	// Rate-limit avatar fetches to 1 request per 25 ms (40 req/s) with no burst
	// so requests are evenly spaced during bootstrap.
	ch.avatarLimiter = rate.NewLimiter(rate.Every(25*time.Millisecond), 1)

	client.AddEventHandler(ch.handleEvent)

	return ch
}

// purgeStaleDevices deletes all whatsmeow device records whose phone number
// matches c.ownerRemoteID (ignoring device suffix). Called before a fresh QR
// pairing to avoid FK violations from incomplete prior pairing attempts.
func (c *WhatsmeowChannel) purgeStaleDevices(ctx context.Context) {
	if c.ownerRemoteID == "" || c.container == nil {
		return
	}
	normalized := StripDeviceSuffix(c.ownerRemoteID)
	devices, err := c.container.GetAllDevices(ctx)
	if err != nil {
		slog.Warn("purge stale devices: list failed", "channelId", c.instanceID, "error", err)
		return
	}
	for _, d := range devices {
		if d.ID == nil {
			continue
		}
		if StripDeviceSuffix(d.ID.String()) == normalized {
			slog.Info("purge stale devices: deleting", "channelId", c.instanceID, "jid", d.ID.String())
			if err := d.Delete(ctx); err != nil {
				slog.Warn("purge stale devices: delete failed", "channelId", c.instanceID, "jid", d.ID.String(), "error", err)
			}
		}
	}
}

func (c *WhatsmeowChannel) Connect(ctx context.Context) error {
	c.mu.Lock()
	c.status = gateway.ConnectionStatusConnecting
	// Renew the stop context so background goroutines started during this
	// connection cycle (history sync, avatar hydration) get a fresh context.
	// Disconnect() calls stopCancel() which permanently cancels the previous
	// context; without this renewal every goroutine launched after reconnect
	// exits immediately.
	c.stopCtx, c.stopCancel = context.WithCancel(context.Background())
	c.mu.Unlock()

	if c.client.Store.ID == nil {
		c.purgeStaleDevices(ctx)
		return c.client.Connect()
	}

	err := c.client.Connect()
	if err != nil {
		if strings.Contains(err.Error(), "websocket is already connected") {
			return nil
		}
		c.mu.Lock()
		c.status = gateway.ConnectionStatusDisconnected
		c.mu.Unlock()
		return fmt.Errorf("failed to connect: %w", err)
	}

	return nil
}

func (c *WhatsmeowChannel) Disconnect() error {
	// Cancel any in-flight background goroutines (e.g. history sync) before
	// disconnecting so they stop writing to the DB after the channel is torn down.
	c.stopCancel()
	c.client.Disconnect()
	c.mu.Lock()
	c.status = gateway.ConnectionStatusDisconnected
	c.mu.Unlock()
	return nil
}

func (c *WhatsmeowChannel) Status() gateway.ConnectionStatus {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.status
}

func (c *WhatsmeowChannel) GetQRChannel(ctx context.Context) (<-chan gateway.QRCodeData, error) {
	if c.client.Store.ID != nil {
		return nil, fmt.Errorf("already logged in")
	}

	c.purgeStaleDevices(ctx)
	c.client.Disconnect()

	qrCtx, qrCancel := context.WithTimeout(context.Background(), 3*time.Minute)

	qrChan, err := c.client.GetQRChannel(qrCtx)
	if err != nil {
		qrCancel()
		return nil, fmt.Errorf("failed to get QR channel: %w", err)
	}

	out := make(chan gateway.QRCodeData, 10)

	err = c.client.Connect()
	if err != nil {
		qrCancel()
		return nil, fmt.Errorf("failed to connect for QR: %w", err)
	}

	// Start the drain goroutine only after a successful Connect so it always
	// has a bounded lifetime tied to the active connection. Starting it before
	// Connect would leave an unbound goroutine running if Connect fails.
	go func() {
		defer qrCancel()
		defer close(out)
		for evt := range qrChan {
			switch evt.Event {
			case whatsmeow.QRChannelEventCode:
				out <- gateway.QRCodeData{Code: evt.Code}
				qrEvent := ctxevents.NewGatewayPlatformEvent(c.instanceID, c.ownerID, ctxevents.ChannelSpecialPlatformEventPayload{
					ChannelID: c.instanceID,
					EventName: waevents.EventNameQRCodeUpdated,
					EventType: ctxevents.PlatformEventQRCodeUpdated,
					Platform:  channelenums.PlatformWhatsApp,
					Payload:   marshalPlatformData(waevents.WhatsAppQRCodeUpdated{Code: evt.Code}),
					OwnerID:   c.ownerID,
				})
				if err := c.domainEventRepo.Save(context.Background(), qrEvent); err != nil {
					slog.Warn("failed to publish QR code event", "instanceId", c.instanceID, "error", err)
				}
			case "success":
				slog.Info("QR code login success", "instanceId", c.instanceID)
				return
			case "timeout":
				slog.Warn("QR code timeout", "instanceId", c.instanceID)
				return
			default:
				slog.Warn("QR channel event", "instanceId", c.instanceID, "event", evt.Event, "error", evt.Error)
				return
			}
		}
	}()

	return out, nil
}

func (c *WhatsmeowChannel) SendMessage(ctx context.Context, params gateway.SendMessageParams) (gateway.SendMessageResult, error) {
	jid, err := parseOrBuildJID(params.To)
	if err != nil {
		return gateway.SendMessageResult{}, fmt.Errorf("%w: %v", ErrInvalidRemoteID, err)
	}

	msg, err := c.buildMessage(ctx, params)
	if err != nil {
		return gateway.SendMessageResult{}, err
	}

	resp, err := c.client.SendMessage(ctx, jid, msg)
	if err != nil {
		return gateway.SendMessageResult{}, fmt.Errorf("failed to send message: %w", err)
	}

	remoteID := StripDeviceSuffix(jid.ToNonAD().String())
	result := gateway.SendMessageResult{
		MessageID:      resp.ID,
		Timestamp:      resp.Timestamp.Unix(),
		PersistContent: c.buildPersistContent(params),
	}

	// Emit message_sent immediately — whatsmeow does not reliably echo sent
	// messages back as *events.Message in all configurations, so we can't rely
	// on the echo pipeline to project sent messages. The MessageSentProjector
	// deduplicates by platform_message_id, so a later echo is a no-op.
	c.emitMessageSent(ctx, remoteID, params.MessageType, result)

	return result, nil
}

func (c *WhatsmeowChannel) emitMessageSent(ctx context.Context, remoteID string, msgType msgenums.MessageType, result gateway.SendMessageResult) {
	isGroup := c.IsGroupJID(remoteID)
	occurredAt := time.Unix(result.Timestamp, 0).UTC()
	event := ctxevents.NewMessageSentEvent(c.instanceID, c.ownerID, ctxevents.ChannelMessageSentPayload{
		ChannelID:         c.instanceID,
		MessageID:         result.MessageID,
		InternalMessageID: uuid.New(),
		RemoteID:          remoteID,
		SenderID:          c.GetOwnerRemoteID(),
		IsGroup:           isGroup,
		Timestamp:         result.Timestamp,
		OccurredAt:        occurredAt,
		ObservedAt:        time.Now().UTC(),
		MessageType:       msgType,
		Content:           result.PersistContent,
		Platform:          channelenums.PlatformWhatsApp,
		PlatformData: marshalPlatformData(ctxevents.WhatsAppChannelMessageSentPlatformData{
			IsGroup: isGroup,
		}),
		OwnerID: c.ownerID,
	})
	if err := c.domainEventRepo.Save(ctx, event); err != nil {
		slog.Warn("send_message: failed to emit message_sent event",
			"channelId", c.instanceID,
			"messageId", result.MessageID,
			"error", err,
		)
	}
}

// buildPersistContent converts the typed send content into a marshalled
// json.RawMessage suitable for entity persistence.
func (c *WhatsmeowChannel) buildPersistContent(params gateway.SendMessageParams) json.RawMessage {
	switch content := params.Content.(type) {
	case gateway.SendTextContent:
		return MarshalContent(WhatsAppTextContent{Text: content.Text})

	case gateway.SendForwardContent:
		return MarshalContent(WhatsAppTextContent{
			Forward:   true,
			RemoteID:  content.RemoteID,
			MessageID: content.MessageID,
		})

	case gateway.SendImageContent:
		return MarshalContent(WhatsAppImageContent{
			ImageMessage: ImageMessageData{URL: content.MediaURL, Caption: content.Caption},
		})

	case gateway.SendVideoContent:
		return MarshalContent(WhatsAppVideoContent{
			VideoMessage: VideoMessageData{URL: content.MediaURL, Caption: content.Caption},
		})

	case gateway.SendAudioContent:
		return MarshalContent(WhatsAppAudioContent{
			AudioMessage: AudioMessageData{URL: content.MediaURL},
		})

	case gateway.SendDocumentContent:
		return MarshalContent(WhatsAppDocumentContent{
			DocumentMessage: DocumentMessageData{URL: content.MediaURL, FileName: content.FileName, Mimetype: content.Mimetype},
		})

	case gateway.SendStickerContent:
		return MarshalContent(WhatsAppStickerContent{
			StickerMessage: StickerMessageData{URL: content.MediaURL},
		})

	case gateway.SendLocationContent:
		return MarshalContent(WhatsAppLocationContent{
			LocationMessage: LocationMessageData{
				DegreesLatitude:  content.Latitude,
				DegreesLongitude: content.Longitude,
				Name:             content.Name,
				Address:          content.Address,
			},
		})

	case gateway.SendContactContent:
		contacts := make([]ContactData, len(content.Contacts))
		for i, c := range content.Contacts {
			contacts[i] = ContactData{
				FullName:     c.FullName,
				PhoneNumber:  c.PhoneNumber,
				Organization: c.Organization,
				Email:        c.Email,
			}
		}
		return MarshalContent(WhatsAppContactContent{Contacts: contacts})

	case gateway.SendPollContent:
		options := make([]string, len(content.Options))
		for i, o := range content.Options {
			options[i] = o.OptionName
		}
		return MarshalContent(WhatsAppPollContent{
			PollMessage: PollMessageData{Question: content.Name, Options: options},
		})

	case gateway.SendReactionContent:
		return MarshalContent(WhatsAppReactionContent{
			ReactionMessage: ReactionMessageData{Text: content.Reaction},
			Text:            content.Reaction,
		})

	case gateway.SendStatusContent:
		return MarshalContent(WhatsAppTextContent{Text: content.Content})

	case gateway.SendMediaContent:
		switch params.MessageType {
		case msgenums.MessageTypeImage:
			return MarshalContent(WhatsAppImageContent{
				ImageMessage: ImageMessageData{URL: content.MediaURL, Caption: content.Caption},
			})
		case msgenums.MessageTypeVideo:
			return MarshalContent(WhatsAppVideoContent{
				VideoMessage: VideoMessageData{URL: content.MediaURL, Caption: content.Caption},
			})
		case msgenums.MessageTypeDocument:
			return MarshalContent(WhatsAppDocumentContent{
				DocumentMessage: DocumentMessageData{URL: content.MediaURL, FileName: content.FileName},
			})
		default:
			return MarshalContent(content)
		}

	default:
		return MarshalContent(content)
	}
}

func (c *WhatsmeowChannel) DeleteMessage(ctx context.Context, chatID string, messageID string) error {
	jid, err := parseOrBuildJID(chatID)
	if err != nil {
		return fmt.Errorf("invalid JID: %w", err)
	}

	_, err = c.client.SendMessage(ctx, jid, c.client.BuildRevoke(jid, types.EmptyJID, messageID))
	return err
}

func (c *WhatsmeowChannel) EditMessage(ctx context.Context, chatID string, messageID string, newText string) error {
	jid, err := parseOrBuildJID(chatID)
	if err != nil {
		return fmt.Errorf("invalid JID: %w", err)
	}

	_, err = c.client.SendMessage(ctx, jid, c.client.BuildEdit(jid, messageID, &waE2E.Message{
		Conversation: proto.String(newText),
	}))
	return err
}

func (c *WhatsmeowChannel) SetPresence(ctx context.Context, presence channelenums.PresenceType) error {
	switch presence {
	case channelenums.PresenceTypeAvailable:
		return c.client.SendPresence(ctx, types.PresenceAvailable)
	case channelenums.PresenceTypeUnavailable:
		return c.client.SendPresence(ctx, types.PresenceUnavailable)
	default:
		return fmt.Errorf("unknown presence: %s", presence)
	}
}

func (c *WhatsmeowChannel) SendChatPresence(ctx context.Context, chatID string, presence msgenums.ChatPresenceType) error {
	jid, err := parseOrBuildJID(chatID)
	if err != nil {
		return fmt.Errorf("invalid JID: %w", err)
	}

	switch presence {
	case msgenums.ChatPresenceTypeComposing:
		return c.client.SendChatPresence(ctx, jid, types.ChatPresenceComposing, types.ChatPresenceMediaText)
	case msgenums.ChatPresenceTypeRecording:
		return c.client.SendChatPresence(ctx, jid, types.ChatPresenceComposing, types.ChatPresenceMediaAudio)
	case msgenums.ChatPresenceTypePaused:
		return c.client.SendChatPresence(ctx, jid, types.ChatPresencePaused, types.ChatPresenceMediaText)
	default:
		return fmt.Errorf("unknown chat presence: %s", presence)
	}
}

func (c *WhatsmeowChannel) CheckIsOnPlatform(ctx context.Context, identifiers []string) ([]gateway.ContactValidation, error) {
	results, err := c.client.IsOnWhatsApp(ctx, identifiers)
	if err != nil {
		return nil, err
	}

	validations := make([]gateway.ContactValidation, len(results))
	for i, r := range results {
		validations[i] = gateway.ContactValidation{
			Identifier:   r.Query,
			IsOnPlatform: r.IsIn,
			PlatformID:   r.JID.String(),
		}
	}
	return validations, nil
}

func (c *WhatsmeowChannel) GetProfilePicture(ctx context.Context, contactID string) (string, error) {
	parsedJID, err := parseOrBuildJID(contactID)
	if err != nil {
		return "", fmt.Errorf("invalid JID: %w", err)
	}

	pic, err := c.client.GetProfilePictureInfo(ctx, parsedJID, &whatsmeow.GetProfilePictureParams{})
	if err != nil {
		return "", nil // Profile picture not available is not an error
	}
	if pic == nil {
		return "", nil
	}
	return pic.URL, nil
}

func (c *WhatsmeowChannel) GetGroupInfo(ctx context.Context, groupJID string) (*gateway.GroupInfo, error) {
	parsedJID, err := parseOrBuildJID(groupJID)
	if err != nil {
		return nil, fmt.Errorf("invalid group JID: %w", err)
	}

	info, err := c.client.GetGroupInfo(ctx, parsedJID)
	if err != nil {
		return nil, fmt.Errorf("fetching group info: %w", err)
	}

	participants := make([]gateway.ParticipantInfo, len(info.Participants))
	for i, p := range info.Participants {
		// WhatsApp uses two JIDs per user — the public phone JID
		// (`<num>@s.whatsapp.net`) and a Linked ID (`<lid>@lid`) used in
		// privacy contexts and group rosters. The same person can show up
		// under either one in info.Participants, so resolve to the canonical
		// phone JID before keying off it. Without this, the same user gets
		// registered twice (once under each form) and their pushName lands
		// on whichever side the contact store happened to know about.
		canonicalJID := resolvePN(c.client.Store, p.JID)

		// Pull the pushName (and fallbacks) from the local contact store.
		// The store is populated by HistorySync and incoming messages, so
		// most participants will resolve — but a brand-new participant with
		// no history may come back empty. Try the canonical JID first,
		// fall back to the original (the contact store may have indexed
		// either form).
		name := contactDisplayName(ctx, c.client, canonicalJID)
		if name == "" && canonicalJID != p.JID {
			name = contactDisplayName(ctx, c.client, p.JID)
		}

		participants[i] = gateway.ParticipantInfo{
			ID:           canonicalJID.String(),
			Name:         name,
			IsAdmin:      p.IsAdmin,
			IsSuperAdmin: p.IsSuperAdmin,
		}
	}

	return &gateway.GroupInfo{
		ID:           info.JID.String(),
		OwnerJID:     info.OwnerJID.String(),
		Name:         info.GroupName.Name,
		Description:  info.Topic,
		Participants: participants,
	}, nil
}

func (c *WhatsmeowChannel) GetIndividualContactInfo(ctx context.Context, jid string) (*gateway.IndividualContactInfo, error) {
	parsedJID, err := parseOrBuildJID(jid)
	if err != nil {
		return nil, fmt.Errorf("invalid JID: %w", err)
	}
	info, err := c.client.Store.Contacts.GetContact(ctx, parsedJID)
	if err != nil {
		return nil, fmt.Errorf("fetching contact info: %w", err)
	}
	if !info.Found {
		return nil, nil
	}
	return &gateway.IndividualContactInfo{
		JID:          jid,
		FirstName:    info.FirstName,
		FullName:     info.FullName,
		PushName:     info.PushName,
		BusinessName: info.BusinessName,
	}, nil
}

func (c *WhatsmeowChannel) Logout(ctx context.Context) error {
	err := c.client.Logout(ctx)
	if err != nil {
		return err
	}
	c.mu.Lock()
	c.status = gateway.ConnectionStatusDisconnected
	c.mu.Unlock()
	return nil
}

// GetOwnerRemoteID returns the canonical remote_id for the channel's owner
// (the logged-in user). Returns the PN form (@s.whatsapp.net). If the device
// session JID is already PN it is returned as-is; if it is LID (newer sessions),
// resolvePN converts it to PN using the device store mapping.
func (c *WhatsmeowChannel) GetOwnerRemoteID() string {
	if c.client.Store.ID == nil {
		return ""
	}
	pn := resolvePN(c.client.Store, c.client.Store.ID.ToNonAD())
	return StripDeviceSuffix(pn.String())
}

// GetDeviceID returns the raw AD-JID (with device suffix) needed for whatsmeow's GetDevice lookup.
// Use GetOwnerRemoteID for display/routing; use GetDeviceID when reconnecting via sqlstore.
func (c *WhatsmeowChannel) GetDeviceID() string {
	if c.client.Store.ID == nil {
		return ""
	}
	return c.client.Store.ID.String()
}

func (c *WhatsmeowChannel) GetChannelID() uuid.UUID {
	return c.instanceID
}

func (c *WhatsmeowChannel) IsGroupJID(jid string) bool {
	return strings.HasSuffix(jid, "@g.us")
}

// PinChat pushes a pin/unpin app-state patch for the given remote. WhatsApp
// echoes the change back as an events.Pin on every companion device, which
// the event mapper translates into channel.remote_pinned / channel.remote_unpinned.
func (c *WhatsmeowChannel) PinChat(ctx context.Context, remoteID string, pin bool) error {
	target, err := parseOrBuildJID(remoteID)
	if err != nil {
		return fmt.Errorf("invalid JID: %w", err)
	}
	return c.sendAppStatePatch(ctx, "PinChat", remoteID, appstate.BuildPin(target, pin))
}

// MuteChat pushes a mute/unmute app-state patch for the given remote.
// muteEndUnixMilli is honoured only when mute is true; pass 0 to mute forever.
func (c *WhatsmeowChannel) MuteChat(ctx context.Context, remoteID string, mute bool, muteEndUnixMilli int64) error {
	target, err := parseOrBuildJID(remoteID)
	if err != nil {
		return fmt.Errorf("invalid JID: %w", err)
	}
	var muteEndTimestamp *int64
	if mute && muteEndUnixMilli > 0 {
		muteEndTimestamp = proto.Int64(muteEndUnixMilli)
	}
	return c.sendAppStatePatch(ctx, "MuteChat", remoteID, appstate.BuildMuteAbs(target, mute, muteEndTimestamp))
}

// ArchiveChat pushes an archive/unarchive app-state patch for the given remote.
// WhatsApp archives also implicitly unpin the chat — that echo arrives as a
// separate events.Pin and is emitted as channel.remote_unpinned downstream.
func (c *WhatsmeowChannel) ArchiveChat(ctx context.Context, remoteID string, archive bool) error {
	target, err := parseOrBuildJID(remoteID)
	if err != nil {
		return fmt.Errorf("invalid JID: %w", err)
	}
	return c.sendAppStatePatch(ctx, "ArchiveChat", remoteID, appstate.BuildArchive(target, archive, time.Time{}, nil))
}

// MarkChatRead pushes a read/unread app-state patch for the given remote.
// read=true emits channel.remote_chat_seen; read=false emits channel.remote_marked_as_unread
// via the echo pipeline.
func (c *WhatsmeowChannel) MarkChatRead(ctx context.Context, remoteID string, read bool) error {
	target, err := parseOrBuildJID(remoteID)
	if err != nil {
		return fmt.Errorf("invalid JID: %w", err)
	}
	return c.sendAppStatePatch(ctx, "MarkChatRead", remoteID, appstate.BuildMarkChatAsRead(target, read, time.Time{}, nil))
}

// sendAppStatePatch sends an app-state patch. On a 409 conflict / LTHash
// mismatch, it resyncs the namespace skipping MAC validation (see
// fetchAppStateSkipValidation) and retries once.
func (c *WhatsmeowChannel) sendAppStatePatch(ctx context.Context, op, remoteID string, patch appstate.PatchInfo) error {
	err := c.client.SendAppState(ctx, patch)
	if err == nil {
		return nil
	}
	if !strings.Contains(err.Error(), "conflict") && !strings.Contains(err.Error(), "LTHash") {
		return err
	}

	slog.Warn("app state conflict: resyncing without MAC validation and retrying",
		"channelId", c.instanceID, "op", op, "remoteId", remoteID, "error", err)

	if fetchErr := c.fetchAppStateSkipValidation(ctx, patch.Type); fetchErr != nil {
		slog.Warn("app state resync failed",
			"channelId", c.instanceID, "op", op, "error", fetchErr)
		return nil
	}

	if retryErr := c.client.SendAppState(ctx, patch); retryErr != nil {
		slog.Warn("app state patch retry failed after resync",
			"channelId", c.instanceID, "op", op, "remoteId", remoteID, "error", retryErr)
		return retryErr
	}

	return nil
}

// fetchAppStateSkipValidation fetches a full app-state snapshot for the given
// namespace and decodes it with MAC validation disabled. This works around a
// persistent whatsmeow LTHash mismatch bug (tulir/whatsmeow#858) where
// whatsmeow's LTHash computation diverges from WhatsApp's expected value,
// causing every FetchAppState call to fail — even on a fresh database.
func (c *WhatsmeowChannel) fetchAppStateSkipValidation(ctx context.Context, name appstate.WAPatchName) error {
	// Explicitly delete mutation MACs before deleting the version. The cascade
	// from whatsmeow_app_state_version is not reliable when whatsmeow's own
	// concurrent sync has partially written MACs. Without this, DecodePatches
	// fails with a duplicate PK on whatsmeow_app_state_mutation_macs because
	// the same index_mac can appear in both the snapshot and subsequent patches.
	if c.db != nil && c.device.ID != nil {
		if _, err := c.db.ExecContext(ctx,
			`DELETE FROM whatsmeow_app_state_mutation_macs WHERE jid = $1 AND name = $2`,
			c.device.ID.String(), string(name),
		); err != nil {
			slog.Warn("app state MAC cleanup failed",
				"channelId", c.instanceID, "namespace", name, "error", err)
		}
	}

	if err := c.device.AppState.DeleteAppStateVersion(ctx, string(name)); err != nil {
		return fmt.Errorf("delete app state version: %w", err)
	}

	patches, err := c.client.DangerousInternals().FetchAppStatePatches(ctx, name, 0, true)
	if err != nil {
		return fmt.Errorf("fetch patches: %w", err)
	}

	proc := appstate.NewProcessor(c.device, waLog.Stdout("appstate-noverify", "WARN", true))
	_, newState, err := proc.DecodePatches(ctx, patches, appstate.HashState{}, false)
	if err != nil {
		return fmt.Errorf("decode patches: %w", err)
	}

	if err := c.device.AppState.PutAppStateVersion(ctx, string(name), newState.Version, newState.Hash); err != nil {
		return fmt.Errorf("save app state version: %w", err)
	}

	slog.Info("app state resynced without MAC validation",
		"channelId", c.instanceID, "namespace", name, "version", newState.Version)
	return nil
}

func (c *WhatsmeowChannel) ResolvePhoneJID(ctx context.Context, jid string) string {
	parsedJID, err := parseOrBuildJID(jid)
	if err != nil {
		return jid
	}
	if parsedJID.Server != types.HiddenUserServer {
		return jid
	}
	phoneJID, err := c.client.Store.GetAltJID(ctx, parsedJID)
	if err != nil || phoneJID.IsEmpty() {
		return jid
	}
	return phoneJID.String()
}

// handleEvent receives raw whatsmeow events, updates internal status,
// maps them to domain events via MapEvent, and publishes them to the mediator.
func (c *WhatsmeowChannel) handleEvent(evt any) {
	slog.Debug("whatsmeow raw event", "instanceId", c.instanceID, "type", fmt.Sprintf("%T", evt))

	// Update internal connection status
	switch v := evt.(type) {
	case *events.Connected:
		c.mu.Lock()
		c.status = gateway.ConnectionStatusConnected
		c.mu.Unlock()
		slog.Info("whatsmeow connected", "instanceId", c.instanceID)
	case *events.Disconnected, *events.StreamReplaced:
		c.mu.Lock()
		c.status = gateway.ConnectionStatusDisconnected
		c.mu.Unlock()
	case *events.LoggedOut:
		c.mu.Lock()
		c.status = gateway.ConnectionStatusDisconnected
		c.mu.Unlock()
		slog.Info("whatsmeow logged out", "instanceId", c.instanceID)
	case *events.AppStateSyncComplete:
		if v.Name == appstate.WAPatchRegular {
			c.markSyncComplete()
		}
	case *events.PairSuccess:
		slog.Info("whatsmeow pair success", "instanceId", c.instanceID, "jid", v.ID.String())
	}

	// History sync: run the bulk-message ACL in addition to the normal mapper.
	// The mapper emits only the gateway_history_sync progress event; this ACL
	// performs the bulk UpsertAllIfNew directly to avoid 2k+ event rows per sync.
	//
	// Launched in a goroutine to avoid blocking the whatsmeow event dispatcher
	// for potentially thousands of messages during the initial history sync.
	if hs, ok := evt.(*events.HistorySync); ok {
		// Use c.stopCtx so that if Disconnect() is called mid-sync, the goroutine
		// stops writing to the DB rather than continuing against a torn-down channel.
		go c.applyHistorySyncBatch(c.stopCtx, hs)
	}

	// Map to domain events and persist as a batch
	domainEvents := mapperpkg.MapEvent(c.instanceID, c.ownerID, c.device, evt)
	if len(domainEvents) > 0 {
		slog.Info("channel domain events mapped",
			"instanceId", c.instanceID,
			"count", len(domainEvents),
			"firstEvent", domainEvents[0].GetEventName(),
			"ownerId", c.ownerID,
		)
		if err := c.domainEventRepo.SaveAll(context.Background(), domainEvents); err != nil {
			slog.Warn("failed to persist domain events",
				"instanceId", c.instanceID,
				"count", len(domainEvents),
				"error", err,
			)
		}
	}
}

// applyHistorySyncBatch bulk-projects historical messages directly into the
// message projection table, bypassing the event system. This eliminates the
// "2k event rows per reconnect" problem that the old event-per-message approach caused.
//
// Known contacts come from StreamContactSnapshot (called by projectContactSnapshot
// after AppStateSyncComplete). Unknown contacts (not in address book) get stubs
// when a live message arrives via the existing RemoteCreatedProjector.
//
// Flow:
//  1. Extract message records from all conversations in the HistorySync batch.
//  2. Bulk UpsertAllIfNew (idempotent via platform_message_id unique index).
//  3. Fold last_message_id / last_message_at into Remote projection.
//  4. If any new rows were inserted, emit a single messages_synced summary event.
func (c *WhatsmeowChannel) applyHistorySyncBatch(ctx context.Context, hs *events.HistorySync) {
	if c.messageProjRepo == nil || c.remoteProjRepo == nil || hs == nil || hs.Data == nil {
		return
	}

	now := time.Now().UTC()
	records := mapperpkg.BuildHistorySyncMessageRecords(c.instanceID, c.device, hs.Data, now)
	if len(records) == 0 {
		return
	}

	insertedCount, err := c.messageProjRepo.UpsertAllIfNew(ctx, records)
	if err != nil {
		slog.Warn("history_sync: UpsertAllIfNew failed",
			"channelId", c.instanceID, "total", len(records), "error", err)
		return
	}

	if err := c.remoteProjRepo.ApplyHistoricalMessages(ctx, records); err != nil {
		slog.Warn("history_sync: ApplyHistoricalMessages failed",
			"channelId", c.instanceID, "error", err)
	}

	slog.Info("history_sync: messages projected",
		"channelId", c.instanceID,
		"total", len(records),
		"inserted", insertedCount,
	)

	if insertedCount > 0 {
		summaryEvt := ctxevents.NewMessagesSyncedEvent(c.instanceID, c.ownerID, ctxevents.ChannelMessagesSyncedPayload{
			ChannelID: c.instanceID,
			OwnerID:   c.ownerID,
			Total:     len(records),
			Inserted:  insertedCount,
		})
		if err := c.domainEventRepo.Save(ctx, summaryEvt); err != nil {
			slog.Warn("history_sync: failed to save messages_synced event",
				"channelId", c.instanceID,
				"error", err,
			)
		}
	}
}

// markSyncComplete is triggered by AppStateSyncComplete (WAPatchRegular).
// At this point all PN↔LID mappings are resolved in the device store, so
// GetAllContacts() returns clean PN JIDs. Launches projectContactSnapshot
// in a background goroutine so the event handler is not blocked.
func (c *WhatsmeowChannel) markSyncComplete() {
	slog.Info("channel: contacts ready, projecting snapshot", "instanceId", c.instanceID)
	go func() {
		c.projectContactSnapshot(c.stopCtx)
	}()
}

// StreamContactSnapshot reads all contacts and joined groups from the whatsmeow
// internal store and streams them as gateway.ContactSnapshot items. The returned
// channel is closed when all items have been streamed or ctx is cancelled.
// Must be called after sync is complete (AppStateSyncComplete/WAPatchRegular).
// No avatar fetching is performed here — use HydrateAvatars for Phase 2.
func (c *WhatsmeowChannel) StreamContactSnapshot(ctx context.Context) <-chan gateway.ContactSnapshot {
	out := make(chan gateway.ContactSnapshot)

	go func() {
		defer close(out)

		// --- contacts ---
		if c.device != nil && c.device.Contacts != nil {
			contacts, err := c.device.Contacts.GetAllContacts(ctx)
			if err != nil {
				slog.Warn("snapshot: failed to fetch contacts", "channelId", c.instanceID, "error", err)
			} else {
				for jid, info := range contacts {
					canonical := jid.ToNonAD()
					if canonical.IsEmpty() || canonical.Server != types.DefaultUserServer {
						continue
					}
					name := bestContactName(info)
					if name == "" {
						continue
					}

					select {
					case <-ctx.Done():
						return
					case out <- gateway.ContactSnapshot{
						RemoteID:   canonical.String(),
						RemoteType: string(channelenums.RemoteTypeUser),
						Name:       name,
					}:
					}
				}
			}
		}

		// --- groups ---
		if c.client != nil {
			groups, err := c.client.GetJoinedGroups(ctx)
			if err != nil {
				slog.Warn("snapshot: failed to fetch groups", "channelId", c.instanceID, "error", err)
			} else {
				for _, g := range groups {
					if g == nil || g.GroupName.Name == "" {
						continue
					}

					members := make([]gateway.MemberSnapshot, 0, len(g.Participants))
					for _, p := range g.Participants {
						pn := resolvePN(c.device, p.JID.ToNonAD()).ToNonAD()
						if pn.IsEmpty() {
							continue
						}
						members = append(members, gateway.MemberSnapshot{
							RemoteID: pn.String(),
							IsAdmin:  p.IsAdmin || p.IsSuperAdmin,
						})
					}

					select {
					case <-ctx.Done():
						return
					case out <- gateway.ContactSnapshot{
						RemoteID:   g.JID.String(),
						RemoteType: string(channelenums.RemoteTypeGroup),
						Name:       g.GroupName.Name,
						Members:    members,
					}:
					}
				}
			}
		}
	}()

	return out
}

// HydrateAvatars fetches profile pictures for the given remote IDs and streams
// AvatarUpdate items as they resolve. Rate-limited internally (avatarLimiter).
// The channel is closed when all IDs have been processed or ctx is cancelled.
func (c *WhatsmeowChannel) HydrateAvatars(ctx context.Context, remoteIDs []string) <-chan gateway.AvatarUpdate {
	out := make(chan gateway.AvatarUpdate)
	go func() {
		defer close(out)
		for _, remoteID := range remoteIDs {
			if err := c.avatarLimiter.Wait(ctx); err != nil {
				return
			}
			avatarURL, _ := c.GetProfilePicture(ctx, remoteID)
			select {
			case out <- gateway.AvatarUpdate{RemoteID: remoteID, AvatarURL: avatarURL}:
			case <-ctx.Done():
				return
			}
		}
	}()
	return out
}

// bestContactName picks the most useful display name from a whatsmeow ContactInfo.
// Priority order: PushName > FullName > BusinessName > FirstName.
func bestContactName(info types.ContactInfo) string {
	switch {
	case info.PushName != "":
		return info.PushName
	case info.FullName != "":
		return info.FullName
	case info.BusinessName != "":
		return info.BusinessName
	default:
		return info.FirstName
	}
}

// projectContactSnapshot reads all contacts and groups from whatsmeow's internal
// store (fully populated after AppStateSyncComplete) and upserts them into the
// remote projection table via a two-phase approach:
//
//   - Phase 1 (immediate, ~2 s): Collect all contacts/groups with NO avatar
//     fetching. Single-batch upsert + single bulk membership insert. Run LID
//     normalisation + backfill. Emits remotes_synced event. The sidebar is
//     usable as soon as Phase 1 completes.
//
//   - Phase 2 (background, non-blocking): Rate-limited avatar fetch for every
//     contact/group; update only avatar_url per row via UpdateAvatar.
func (c *WhatsmeowChannel) projectContactSnapshot(ctx context.Context) {
	if c.remoteProjRepo == nil {
		slog.Warn("snapshot: remoteProjRepo not injected — skipping", "channelId", c.instanceID)
		return
	}

	now := time.Now().UTC()
	var allRemotes []*projections.Remote
	allMemberships := make(map[string][]remoterepo.MembershipRow)
	var allRemoteIDs []string

	for snapshot := range c.StreamContactSnapshot(ctx) {
		allRemoteIDs = append(allRemoteIDs, snapshot.RemoteID)
		allRemotes = append(allRemotes, &projections.Remote{
			ChannelID: c.instanceID.String(),
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
		if err := c.remoteProjRepo.UpsertContactSnapshot(ctx, allRemotes); err != nil {
			slog.Warn("snapshot: upsert failed", "channelId", c.instanceID, "error", err)
		}
	}

	if len(allMemberships) > 0 {
		if err := c.remoteProjRepo.BulkUpdateMemberships(ctx, c.instanceID.String(), allMemberships); err != nil {
			slog.Warn("snapshot: bulk memberships failed", "channelId", c.instanceID, "error", err)
		}
	}

	c.normalizeLIDMessages(ctx)

	if err := c.remoteProjRepo.BackfillLastMessagePreview(ctx, c.instanceID.String()); err != nil {
		slog.Warn("snapshot: backfill last message preview failed",
			"channelId", c.instanceID, "error", err)
	}

	slog.Info("snapshot: contact projection complete",
		"channelId", c.instanceID,
		"total", len(allRemotes),
	)

	summaryEvt := ctxevents.NewRemotesSyncedEvent(c.instanceID, c.ownerID, ctxevents.ChannelRemotesSyncedPayload{
		ChannelID: c.instanceID,
		OwnerID:   c.ownerID,
		Total:     len(allRemotes),
		Inserted:  len(allRemotes),
	})
	if err := c.domainEventRepo.Save(ctx, summaryEvt); err != nil {
		slog.Warn("snapshot: failed to save remotes_synced event", "channelId", c.instanceID, "error", err)
	}

	// ── Phase 2: avatar hydration in background (non-blocking) ────────────
	go c.hydrateContactAvatars(allRemoteIDs)
}

// hydrateContactAvatars fetches and persists profile pictures for all contacts
// and groups in the snapshot. Runs in a background goroutine after Phase 1 so
// the sidebar is usable immediately while avatars trickle in.
func (c *WhatsmeowChannel) hydrateContactAvatars(remoteIDs []string) {
	if c.remoteProjRepo == nil || len(remoteIDs) == 0 {
		return
	}
	updated := 0
	for update := range c.HydrateAvatars(c.stopCtx, remoteIDs) {
		if update.AvatarURL == "" {
			continue
		}
		if err := c.remoteProjRepo.UpdateAvatar(c.stopCtx, c.instanceID.String(), update.RemoteID, update.AvatarURL); err != nil {
			slog.Warn("snapshot: update avatar failed",
				"channelId", c.instanceID, "remoteId", update.RemoteID, "error", err)
			continue
		}
		updated++
	}
	slog.Info("snapshot: avatar hydration complete",
		"channelId", c.instanceID,
		"total", len(remoteIDs),
		"updated", updated,
	)
}

// normalizeLIDMessages rewrites messages stored with LID remote_ids to their PN
// equivalents, then re-applies them to remote rows so last_message_at and
// last_message_id are populated correctly. Must be called after UpsertContactSnapshot
// (remote PN rows exist) and after AppStateSyncComplete (device store is complete,
// so resolvePN succeeds for all known contacts).
func (c *WhatsmeowChannel) normalizeLIDMessages(ctx context.Context) {
	if c.messageProjRepo == nil {
		return
	}

	lidIDs, err := c.messageProjRepo.FindDistinctLIDRemoteIDs(ctx, c.instanceID.String())
	if err != nil {
		slog.Warn("snapshot: failed to find LID message remote_ids",
			"channelId", c.instanceID, "error", err)
		return
	}
	if len(lidIDs) == 0 {
		return
	}

	lidToPN := make(map[string]string, len(lidIDs))
	for _, lid := range lidIDs {
		parsed, err := types.ParseJID(lid)
		if err != nil || parsed.Server != types.HiddenUserServer {
			continue
		}
		pn := resolvePN(c.device, parsed.ToNonAD()).ToNonAD()
		if pn.Server == types.DefaultUserServer {
			lidToPN[lid] = pn.String()
		}
	}

	if len(lidToPN) == 0 {
		slog.Info("snapshot: LID messages found but no PN mappings resolved — skipping normalization",
			"channelId", c.instanceID, "lids", len(lidIDs))
		return
	}

	rewritten, err := c.messageProjRepo.RewriteRemoteIDs(ctx, c.instanceID.String(), lidToPN)
	if err != nil {
		slog.Warn("snapshot: failed to rewrite LID message remote_ids",
			"channelId", c.instanceID, "error", err)
		return
	}

	if len(rewritten) > 0 {
		if err := c.remoteProjRepo.ApplyHistoricalMessages(ctx, rewritten); err != nil {
			slog.Warn("snapshot: failed to apply rewritten messages to remote projections",
				"channelId", c.instanceID, "error", err)
		}
	}

	slog.Info("snapshot: normalized LID messages to PN",
		"channelId", c.instanceID,
		"lids", len(lidToPN),
		"messages", len(rewritten),
	)
}

// --- private helpers ---

func parseOrBuildJID(input string) (types.JID, error) {
	if strings.Contains(input, "@") {
		return types.ParseJID(input)
	}
	return types.NewJID(input, types.DefaultUserServer), nil
}

// contactDisplayName looks up a JID in the local contact store and returns the
// best available display name (pushName → fullName → businessName → firstName)
// or "" if nothing is known.
func contactDisplayName(ctx context.Context, client *whatsmeow.Client, jid types.JID) string {
	contact, err := client.Store.Contacts.GetContact(ctx, jid)
	if err != nil || !contact.Found {
		return ""
	}
	switch {
	case contact.PushName != "":
		return contact.PushName
	case contact.FullName != "":
		return contact.FullName
	case contact.BusinessName != "":
		return contact.BusinessName
	default:
		return contact.FirstName
	}
}
