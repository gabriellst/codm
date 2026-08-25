package controllers_test

import (
	"testing"

	"template/api-go/internal/channel/controllers"
	"template/core-go/pkg/validation"
)

// TestSendImageRequestValidation_MediaSourceExclusivity covers AC-6 of the
// "envio de artefatos pelo canal" design: mediaUrl and mediaPath are mutually
// exclusive and exactly one is required. The same required_without/
// excluded_with tag pair is mirrored on SendVideoRequest, SendAudioRequest,
// SendFileRequest, and SendMediaRequest — this is the representative case.
func TestSendImageRequestValidation_MediaSourceExclusivity(t *testing.T) {
	base := controllers.SendImageRequest{
		ChannelID: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
		RemoteID:  "5511999999999@s.whatsapp.net",
	}

	t.Run("mediaUrl only is valid", func(t *testing.T) {
		req := base
		req.MediaURL = "https://example.com/image.png"
		if err := validation.Validate(&req); err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
	})

	t.Run("mediaPath only is valid", func(t *testing.T) {
		req := base
		req.MediaPath = "/data/media/abc123.png"
		if err := validation.Validate(&req); err != nil {
			t.Fatalf("expected no error, got %v", err)
		}
	})

	t.Run("both set is invalid", func(t *testing.T) {
		req := base
		req.MediaURL = "https://example.com/image.png"
		req.MediaPath = "/data/media/abc123.png"
		if err := validation.Validate(&req); err == nil {
			t.Fatal("expected validation error when both mediaUrl and mediaPath are set")
		}
	})

	t.Run("neither set is invalid", func(t *testing.T) {
		req := base
		if err := validation.Validate(&req); err == nil {
			t.Fatal("expected validation error when neither mediaUrl nor mediaPath is set")
		}
	})
}
