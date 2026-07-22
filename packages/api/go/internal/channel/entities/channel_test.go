package entities_test

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"template/api-go/internal/channel/entities"
	ctxenums "template/api-go/internal/channel/enums"
	ctxevents "template/api-go/internal/channel/events"
	sharedenums "template/api-go/internal/shared/enums"
)

func TestChannel_ReplayLifecycle(t *testing.T) {
	ch := &entities.Channel{}

	channelID := uuid.New()
	createdPayload, err := json.Marshal(ctxevents.ChannelCreatedPayload{
		ChannelID: channelID,
		Name:      "Test",
		Platform:  sharedenums.PlatformWhatsApp,
		OwnerID:   "owner-1",
	})
	require.NoError(t, err)
	require.NoError(t, ch.Apply(ctxevents.ChannelCreatedEventName, createdPayload))
	assert.Equal(t, "Test", ch.Name)
	assert.Equal(t, sharedenums.PlatformWhatsApp, ch.Platform)
	assert.Equal(t, "owner-1", ch.OwnerID)
	assert.Equal(t, ctxenums.ChannelStatusCreated, ch.Status)
	assert.Equal(t, 1, ch.Version)

	// channel.channel_connecting → moves status to CONNECTING.
	require.NoError(t, ch.Apply(ctxevents.ChannelConnectingEventName, json.RawMessage("{}")))
	assert.Equal(t, ctxenums.ChannelStatusConnecting, ch.Status)
	assert.Equal(t, 2, ch.Version)

	// channel.channel_connected → applies OwnerRemoteID and CONNECTED status.
	connectedPayload, err := json.Marshal(ctxevents.ChannelConnectedPayload{
		ChannelID:     channelID,
		OwnerRemoteID: "5511@s.whatsapp.net",
		OwnerID:       "owner-1",
	})
	require.NoError(t, err)
	require.NoError(t, ch.Apply(ctxevents.ChannelConnectedEventName, connectedPayload))
	assert.Equal(t, "5511@s.whatsapp.net", ch.OwnerRemoteID)
	assert.Equal(t, ctxenums.ChannelStatusConnected, ch.Status)
	assert.Equal(t, 3, ch.Version)

	// channel.channel_disconnected → moves status to DISCONNECTED.
	require.NoError(t, ch.Apply(ctxevents.ChannelDisconnectedEventName, json.RawMessage("{}")))
	assert.Equal(t, ctxenums.ChannelStatusDisconnected, ch.Status)
	assert.Equal(t, 4, ch.Version)

	// channel.channel_deleted → moves status to DELETED.
	require.NoError(t, ch.Apply(ctxevents.ChannelDeletedEventName, json.RawMessage("{}")))
	assert.Equal(t, ctxenums.ChannelStatusDeleted, ch.Status)
	assert.Equal(t, 5, ch.Version)
}

func TestChannel_SetConnecting(t *testing.T) {
	ch, err := entities.NewChannel(entities.NewChannelParams{
		Name:     "test-channel",
		Platform: sharedenums.PlatformWhatsApp,
		OwnerID:  "owner-1",
	})
	require.NoError(t, err)
	_ = ch.PullDomainEvents() // clear created event

	ch.SetConnecting()

	assert.Equal(t, ctxenums.ChannelStatusConnecting, ch.Status)
	evts := ch.PullDomainEvents()
	require.Len(t, evts, 1)
	assert.Equal(t, ctxevents.ChannelConnectingEventName, evts[0].GetEventName())
}

func TestChannel_ApplyUnknownEventReturnsError(t *testing.T) {
	ch := &entities.Channel{}
	err := ch.Apply("channel.unknown", json.RawMessage("{}"))
	assert.Error(t, err)
	assert.Equal(t, 0, ch.Version)
}

func TestChannel_ApplyGatewayEventsAdvanceStatusOnly(t *testing.T) {
	ch := &entities.Channel{}

	gatewayPayload := json.RawMessage(`{"channelId":"` + uuid.NewString() + `","platform":"WHATSAPP","ownerId":"owner-1"}`)
	require.NoError(t, ch.Apply(ctxevents.GatewayConnectedEventName, gatewayPayload))
	assert.Equal(t, ctxenums.ChannelStatusConnected, ch.Status)
	assert.Equal(t, "", ch.OwnerRemoteID)
	assert.Equal(t, 1, ch.Version)

	require.NoError(t, ch.Apply(ctxevents.GatewayDisconnectedEventName, json.RawMessage("{}")))
	assert.Equal(t, ctxenums.ChannelStatusDisconnected, ch.Status)
	assert.Equal(t, 2, ch.Version)
}
