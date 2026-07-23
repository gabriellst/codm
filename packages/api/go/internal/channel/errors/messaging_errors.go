package errors

import (
	"net/http"

	"template/core-go/errors"
)

const (
	CodeInvalidNumber         errors.ErrorCode = "INVALID_NUMBER"
	CodeMessageTooLong        errors.ErrorCode = "MESSAGE_TOO_LONG"
	CodeInvalidMediaURL       errors.ErrorCode = "INVALID_MEDIA_URL"
	CodeMediaTooLarge         errors.ErrorCode = "MEDIA_TOO_LARGE"
	CodeUnsupportedMediaType  errors.ErrorCode = "UNSUPPORTED_MEDIA_TYPE"
	CodeMessageNotFound       errors.ErrorCode = "MESSAGE_NOT_FOUND"
	CodeTooFewPollOptions     errors.ErrorCode = "TOO_FEW_POLL_OPTIONS"
	CodeTooManyPollOptions    errors.ErrorCode = "TOO_MANY_POLL_OPTIONS"
	CodeTooManyButtons        errors.ErrorCode = "TOO_MANY_BUTTONS"
	CodeCannotEditOthers      errors.ErrorCode = "CANNOT_EDIT_OTHERS_MESSAGE"
	CodeEmptyContactList      errors.ErrorCode = "EMPTY_CONTACT_LIST"
	CodeEmptySections         errors.ErrorCode = "EMPTY_SECTIONS"
	CodeEmptyNumberList       errors.ErrorCode = "EMPTY_NUMBER_LIST"
	CodeInvalidAudioURL       errors.ErrorCode = "INVALID_AUDIO_URL"
	CodeAudioConversionFailed errors.ErrorCode = "AUDIO_CONVERSION_FAILED"
	CodeInvalidStickerSource  errors.ErrorCode = "INVALID_STICKER_SOURCE"
	CodeInvalidCoordinates    errors.ErrorCode = "INVALID_COORDINATES"
	CodeInvalidStatusType     errors.ErrorCode = "INVALID_STATUS_TYPE"
	CodeInvalidRemoteID       errors.ErrorCode = "INVALID_REMOTE_ID"
	CodeMessageSendFailed     errors.ErrorCode = "MESSAGE_SEND_FAILED"
)

func init() {
	errors.RegisterErrorCodes(map[errors.ErrorCode]int{
		CodeInvalidNumber:         http.StatusBadRequest,
		CodeMessageTooLong:        http.StatusUnprocessableEntity,
		CodeInvalidMediaURL:       http.StatusBadRequest,
		CodeMediaTooLarge:         http.StatusBadRequest,
		CodeUnsupportedMediaType:  http.StatusBadRequest,
		CodeMessageNotFound:       http.StatusNotFound,
		CodeTooFewPollOptions:     http.StatusUnprocessableEntity,
		CodeTooManyPollOptions:    http.StatusUnprocessableEntity,
		CodeTooManyButtons:        http.StatusUnprocessableEntity,
		CodeCannotEditOthers:      http.StatusForbidden,
		CodeEmptyContactList:      http.StatusBadRequest,
		CodeEmptySections:         http.StatusBadRequest,
		CodeEmptyNumberList:       http.StatusBadRequest,
		CodeInvalidAudioURL:       http.StatusBadRequest,
		CodeAudioConversionFailed: http.StatusInternalServerError,
		CodeInvalidStickerSource:  http.StatusBadRequest,
		CodeInvalidCoordinates:    http.StatusUnprocessableEntity,
		CodeInvalidStatusType:     http.StatusBadRequest,
		CodeInvalidRemoteID:       http.StatusUnprocessableEntity,
		CodeMessageSendFailed:     http.StatusBadGateway,
	})
}
