package errors

import (
	"net/http"

	"template/core-go/errors"
)

const (
	CodeChannelNotFound          errors.ErrorCode = "INTEGRATION_NOT_FOUND"
	CodeChannelNotConnected      errors.ErrorCode = "INTEGRATION_NOT_CONNECTED"
	CodeChannelNameAlreadyExists errors.ErrorCode = "INTEGRATION_NAME_ALREADY_EXISTS"
	CodeChannelAlreadyConnected  errors.ErrorCode = "INTEGRATION_ALREADY_CONNECTED"
	CodeInvalidPlatform          errors.ErrorCode = "INVALID_PLATFORM"
	CodeInvalidPresenceType      errors.ErrorCode = "INVALID_PRESENCE_TYPE"
	CodeProxyHostRequired        errors.ErrorCode = "PROXY_HOST_REQUIRED_WHEN_ENABLED"
	CodeProxyPortRequired        errors.ErrorCode = "PROXY_PORT_REQUIRED_WHEN_ENABLED"
	CodeInvalidOwnerId           errors.ErrorCode = "INVALID_OWNER_ID"
	CodeInvalidImage             errors.ErrorCode = "INVALID_IMAGE"
	// CodeChannelDeviceInvalidated: the whatsmeow session backing this channel was
	// permanently invalidated (WhatsApp logged the device out server-side, which
	// whatsmeow answers by deleting its local device store — store.ErrDeviceDeleted,
	// "invalid use of deleted device"). Raised as a defense-in-depth safety net by
	// WhatsmeowChannel.Connect/GetQRChannel — the primary fix evicts the channel from
	// the pool on events.LoggedOut so the NEXT connect builds a fresh device and never
	// hits this at all (see whatsmeow_channel.go handleEvent + gateway.PoolEvictor).
	// 410 Gone: the session resource used to exist and is now permanently gone —
	// the client's remedy is to re-pair via QR, not retry the same request.
	CodeChannelDeviceInvalidated errors.ErrorCode = "CHANNEL_DEVICE_INVALIDATED"

	// Remote aggregate error codes.
	CodeRemoteInvalidParams   errors.ErrorCode = "REMOTE_INVALID_PARAMS"
	CodeRemoteDeleted         errors.ErrorCode = "REMOTE_DELETED"
	CodeRemoteAlreadyPinned   errors.ErrorCode = "REMOTE_ALREADY_PINNED"
	CodeRemoteNotPinned       errors.ErrorCode = "REMOTE_NOT_PINNED"
	CodeRemoteAlreadyArchived errors.ErrorCode = "REMOTE_ALREADY_ARCHIVED"
	CodeRemoteNotArchived     errors.ErrorCode = "REMOTE_NOT_ARCHIVED"
	CodeRemoteAlreadyDeleted  errors.ErrorCode = "REMOTE_ALREADY_DELETED"

	// Message aggregate error codes.
	// CodeMessageNotFound is declared in messaging_errors.go.
	CodeMessageDeleted        errors.ErrorCode = "MESSAGE_DELETED"
	CodeMessageAlreadyDeleted errors.ErrorCode = "MESSAGE_ALREADY_DELETED"
)

func init() {
	errors.RegisterErrorCodes(map[errors.ErrorCode]int{
		CodeChannelNotFound:          http.StatusNotFound,
		CodeChannelNotConnected:      http.StatusBadRequest,
		CodeChannelNameAlreadyExists: http.StatusConflict,
		CodeChannelAlreadyConnected:  http.StatusConflict,
		CodeInvalidPlatform:          http.StatusBadRequest,
		CodeInvalidPresenceType:      http.StatusBadRequest,
		CodeProxyHostRequired:        http.StatusBadRequest,
		CodeInvalidOwnerId:           http.StatusBadRequest,
		CodeProxyPortRequired:        http.StatusBadRequest,
		CodeInvalidImage:             http.StatusBadRequest,
		CodeChannelDeviceInvalidated: http.StatusGone,

		CodeRemoteInvalidParams:   http.StatusBadRequest,
		CodeRemoteDeleted:         http.StatusUnprocessableEntity,
		CodeRemoteAlreadyPinned:   http.StatusConflict,
		CodeRemoteNotPinned:       http.StatusBadRequest,
		CodeRemoteAlreadyArchived: http.StatusConflict,
		CodeRemoteNotArchived:     http.StatusBadRequest,
		CodeRemoteAlreadyDeleted:  http.StatusConflict,

		CodeMessageDeleted:        http.StatusUnprocessableEntity,
		CodeMessageAlreadyDeleted: http.StatusConflict,
	})
}
