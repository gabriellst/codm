package whatsapp

import (
	"context"
	"encoding/json"
	"fmt"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"google.golang.org/protobuf/proto"

	"template/api-go/internal/channel/services/gateway"
)

func richContextInfo(c gateway.SendRichMediaContent) *waE2E.ContextInfo {
	if c.QuotedMessageID == "" {
		return nil
	}
	ci := &waE2E.ContextInfo{StanzaID: proto.String(c.QuotedMessageID)}
	if c.QuotedParticipant != "" {
		ci.Participant = proto.String(c.QuotedParticipant)
	}
	return ci
}

// buildRichMediaMessage uploads c.Data and builds the matching waE2E message.
func (c *WhatsmeowChannel) buildRichMediaMessage(ctx context.Context, content gateway.SendRichMediaContent) (*waE2E.Message, error) {
	if len(content.Data) == 0 {
		return nil, fmt.Errorf("empty media payload")
	}
	var mt whatsmeow.MediaType
	switch content.Kind {
	case "image", "sticker":
		mt = whatsmeow.MediaImage
	case "video":
		mt = whatsmeow.MediaVideo
	case "audio", "voice":
		mt = whatsmeow.MediaAudio
	case "document":
		mt = whatsmeow.MediaDocument
	default:
		return nil, fmt.Errorf("unsupported media kind %q", content.Kind)
	}
	resp, err := c.client.Upload(ctx, content.Data, mt)
	if err != nil {
		return nil, fmt.Errorf("failed to upload %s: %w", content.Kind, err)
	}
	ci := richContextInfo(content)

	switch content.Kind {
	case "image":
		m := &waE2E.ImageMessage{
			URL: &resp.URL, DirectPath: &resp.DirectPath, MediaKey: resp.MediaKey,
			FileEncSHA256: resp.FileEncSHA256, FileSHA256: resp.FileSHA256, FileLength: &resp.FileLength,
			Mimetype: proto.String(content.Mimetype), ContextInfo: ci,
		}
		if content.Caption != "" {
			m.Caption = proto.String(content.Caption)
		}
		if len(content.Thumbnail) > 0 {
			m.JPEGThumbnail = content.Thumbnail
		}
		if content.Width > 0 && content.Height > 0 {
			m.Width, m.Height = proto.Uint32(content.Width), proto.Uint32(content.Height)
		}
		return &waE2E.Message{ImageMessage: m}, nil
	case "video":
		m := &waE2E.VideoMessage{
			URL: &resp.URL, DirectPath: &resp.DirectPath, MediaKey: resp.MediaKey,
			FileEncSHA256: resp.FileEncSHA256, FileSHA256: resp.FileSHA256, FileLength: &resp.FileLength,
			Mimetype: proto.String(content.Mimetype), ContextInfo: ci,
		}
		if content.Caption != "" {
			m.Caption = proto.String(content.Caption)
		}
		if len(content.Thumbnail) > 0 {
			m.JPEGThumbnail = content.Thumbnail
		}
		if content.Seconds > 0 {
			m.Seconds = proto.Uint32(content.Seconds)
		}
		if content.Width > 0 && content.Height > 0 {
			m.Width, m.Height = proto.Uint32(content.Width), proto.Uint32(content.Height)
		}
		return &waE2E.Message{VideoMessage: m}, nil
	case "audio", "voice":
		m := &waE2E.AudioMessage{
			URL: &resp.URL, DirectPath: &resp.DirectPath, MediaKey: resp.MediaKey,
			FileEncSHA256: resp.FileEncSHA256, FileSHA256: resp.FileSHA256, FileLength: &resp.FileLength,
			Mimetype: proto.String(content.Mimetype), PTT: proto.Bool(content.PTT), ContextInfo: ci,
		}
		if content.Seconds > 0 {
			m.Seconds = proto.Uint32(content.Seconds)
		}
		if len(content.Waveform) > 0 {
			m.Waveform = content.Waveform
		}
		return &waE2E.Message{AudioMessage: m}, nil
	case "document":
		m := &waE2E.DocumentMessage{
			URL: &resp.URL, DirectPath: &resp.DirectPath, MediaKey: resp.MediaKey,
			FileEncSHA256: resp.FileEncSHA256, FileSHA256: resp.FileSHA256, FileLength: &resp.FileLength,
			Mimetype: proto.String(content.Mimetype), ContextInfo: ci,
		}
		if content.FileName != "" {
			m.FileName = proto.String(content.FileName)
			m.Title = proto.String(content.FileName)
		}
		if content.Caption != "" {
			m.Caption = proto.String(content.Caption)
		}
		if len(content.Thumbnail) > 0 {
			m.JPEGThumbnail = content.Thumbnail
		}
		return &waE2E.Message{DocumentMessage: m}, nil
	default: // sticker
		m := &waE2E.StickerMessage{
			URL: &resp.URL, DirectPath: &resp.DirectPath, MediaKey: resp.MediaKey,
			FileEncSHA256: resp.FileEncSHA256, FileSHA256: resp.FileSHA256, FileLength: &resp.FileLength,
			Mimetype: proto.String("image/webp"), IsAnimated: proto.Bool(content.Animated), ContextInfo: ci,
		}
		if content.Width > 0 && content.Height > 0 {
			m.Width, m.Height = proto.Uint32(content.Width), proto.Uint32(content.Height)
		}
		return &waE2E.Message{StickerMessage: m}, nil
	}
}

// persistRichMedia builds the entity-persistence JSON (never the raw bytes).
func persistRichMedia(content gateway.SendRichMediaContent) json.RawMessage {
	switch content.Kind {
	case "image":
		return MarshalContent(WhatsAppImageContent{ImageMessage: ImageMessageData{Caption: content.Caption, Mimetype: content.Mimetype, FileLength: uint64(len(content.Data)), Width: content.Width, Height: content.Height}})
	case "video":
		return MarshalContent(WhatsAppVideoContent{VideoMessage: VideoMessageData{Caption: content.Caption, Mimetype: content.Mimetype, Seconds: content.Seconds, FileLength: uint64(len(content.Data))}})
	case "audio", "voice":
		return MarshalContent(WhatsAppAudioContent{AudioMessage: AudioMessageData{Mimetype: content.Mimetype, PTT: content.PTT, Seconds: content.Seconds, FileLength: uint64(len(content.Data))}})
	case "document":
		return MarshalContent(WhatsAppDocumentContent{DocumentMessage: DocumentMessageData{Caption: content.Caption, Mimetype: content.Mimetype, FileName: content.FileName, FileLength: uint64(len(content.Data))}})
	default:
		return MarshalContent(WhatsAppStickerContent{StickerMessage: StickerMessageData{Mimetype: "image/webp", IsAnimated: content.Animated, FileLength: uint64(len(content.Data))}})
	}
}
