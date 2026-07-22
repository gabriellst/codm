package whatsapp

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	msgenums "template/api-go/internal/channel/enums"
	"template/api-go/internal/channel/services/gateway"
	"net/http"
	"net/url"
	"strings"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
)

func (c *WhatsmeowChannel) buildMessage(ctx context.Context, params gateway.SendMessageParams) (*waE2E.Message, error) {
	switch content := params.Content.(type) {
	case gateway.SendTextContent:
		return c.buildTextMessage(content)
	case gateway.SendImageContent:
		return c.buildImageMessage(ctx, content)
	case gateway.SendVideoContent:
		return c.buildVideoMessage(ctx, content)
	case gateway.SendAudioContent:
		return c.buildAudioMessage(ctx, content)
	case gateway.SendDocumentContent:
		return c.buildDocumentMessage(ctx, content)
	case gateway.SendStickerContent:
		return c.buildStickerMessage(ctx, content)
	case gateway.SendLocationContent:
		return c.buildLocationMessage(content)
	case gateway.SendContactContent:
		return c.buildContactMessage(content)
	case gateway.SendPollContent:
		return c.buildPollMessage(content)
	case gateway.SendListContent:
		return c.buildListMessage(content)
	case gateway.SendButtonContent:
		return c.buildButtonMessage(content)
	case gateway.SendReactionContent:
		return c.buildReactionMessage(content)
	case gateway.SendStatusContent:
		return c.buildStatusMessage(ctx, content)
	case gateway.SendForwardContent:
		return c.buildTextMessage(gateway.SendTextContent{Text: ""})
	case gateway.SendMediaContent:
		return c.buildMediaMessage(ctx, params.MessageType, content)
	default:
		return nil, fmt.Errorf("unsupported content type: %T", params.Content)
	}
}

// --- Text ---

func (c *WhatsmeowChannel) buildTextMessage(content gateway.SendTextContent) (*waE2E.Message, error) {
	if content.QuotedMessageID != "" {
		return &waE2E.Message{
			ExtendedTextMessage: &waE2E.ExtendedTextMessage{
				Text: proto.String(content.Text),
				ContextInfo: &waE2E.ContextInfo{
					StanzaID: proto.String(content.QuotedMessageID),
				},
			},
		}, nil
	}

	return &waE2E.Message{
		Conversation: proto.String(content.Text),
	}, nil
}

// --- Image ---

func (c *WhatsmeowChannel) buildImageMessage(ctx context.Context, content gateway.SendImageContent) (*waE2E.Message, error) {
	data, err := downloadMediaFromURL(ctx, content.MediaURL)
	if err != nil {
		return nil, fmt.Errorf("failed to download image: %w", err)
	}

	resp, err := c.client.Upload(ctx, data, whatsmeow.MediaImage)
	if err != nil {
		return nil, fmt.Errorf("failed to upload image: %w", err)
	}

	imgMsg := &waE2E.ImageMessage{
		URL:           &resp.URL,
		DirectPath:    &resp.DirectPath,
		MediaKey:      resp.MediaKey,
		FileEncSHA256: resp.FileEncSHA256,
		FileSHA256:    resp.FileSHA256,
		FileLength:    &resp.FileLength,
		Mimetype:      proto.String(http.DetectContentType(data)),
	}

	if content.Caption != "" {
		imgMsg.Caption = proto.String(content.Caption)
	}
	if len(content.Mentioned) > 0 {
		imgMsg.ContextInfo = &waE2E.ContextInfo{
			MentionedJID: content.Mentioned,
		}
	}

	return &waE2E.Message{ImageMessage: imgMsg}, nil
}

// --- Video ---

func (c *WhatsmeowChannel) buildVideoMessage(ctx context.Context, content gateway.SendVideoContent) (*waE2E.Message, error) {
	data, err := downloadMediaFromURL(ctx, content.MediaURL)
	if err != nil {
		return nil, fmt.Errorf("failed to download video: %w", err)
	}

	resp, err := c.client.Upload(ctx, data, whatsmeow.MediaVideo)
	if err != nil {
		return nil, fmt.Errorf("failed to upload video: %w", err)
	}

	mimetype := http.DetectContentType(data)
	if mimetype == "application/octet-stream" {
		mimetype = "video/mp4"
	}

	vidMsg := &waE2E.VideoMessage{
		URL:           &resp.URL,
		DirectPath:    &resp.DirectPath,
		MediaKey:      resp.MediaKey,
		FileEncSHA256: resp.FileEncSHA256,
		FileSHA256:    resp.FileSHA256,
		FileLength:    &resp.FileLength,
		Mimetype:      proto.String(mimetype),
	}

	if content.Caption != "" {
		vidMsg.Caption = proto.String(content.Caption)
	}

	return &waE2E.Message{VideoMessage: vidMsg}, nil
}

// --- Audio ---

func (c *WhatsmeowChannel) buildAudioMessage(ctx context.Context, content gateway.SendAudioContent) (*waE2E.Message, error) {
	data, err := downloadMediaFromURL(ctx, content.MediaURL)
	if err != nil {
		return nil, fmt.Errorf("failed to download audio: %w", err)
	}

	resp, err := c.client.Upload(ctx, data, whatsmeow.MediaAudio)
	if err != nil {
		return nil, fmt.Errorf("failed to upload audio: %w", err)
	}

	mimetype := http.DetectContentType(data)
	if mimetype == "application/octet-stream" {
		mimetype = "audio/ogg; codecs=opus"
	}

	return &waE2E.Message{
		AudioMessage: &waE2E.AudioMessage{
			URL:           &resp.URL,
			DirectPath:    &resp.DirectPath,
			MediaKey:      resp.MediaKey,
			FileEncSHA256: resp.FileEncSHA256,
			FileSHA256:    resp.FileSHA256,
			FileLength:    &resp.FileLength,
			Mimetype:      proto.String(mimetype),
			PTT:           proto.Bool(false),
		},
	}, nil
}

// --- Document ---

func (c *WhatsmeowChannel) buildDocumentMessage(ctx context.Context, content gateway.SendDocumentContent) (*waE2E.Message, error) {
	data, err := downloadMediaFromURL(ctx, content.MediaURL)
	if err != nil {
		return nil, fmt.Errorf("failed to download document: %w", err)
	}

	resp, err := c.client.Upload(ctx, data, whatsmeow.MediaDocument)
	if err != nil {
		return nil, fmt.Errorf("failed to upload document: %w", err)
	}

	mimetype := content.Mimetype
	if mimetype == "" {
		mimetype = http.DetectContentType(data)
	}

	docMsg := &waE2E.DocumentMessage{
		URL:           &resp.URL,
		DirectPath:    &resp.DirectPath,
		MediaKey:      resp.MediaKey,
		FileEncSHA256: resp.FileEncSHA256,
		FileSHA256:    resp.FileSHA256,
		FileLength:    &resp.FileLength,
		Mimetype:      proto.String(mimetype),
	}

	if content.FileName != "" {
		docMsg.FileName = proto.String(content.FileName)
	}

	return &waE2E.Message{DocumentMessage: docMsg}, nil
}

// --- Sticker ---

func (c *WhatsmeowChannel) buildStickerMessage(ctx context.Context, content gateway.SendStickerContent) (*waE2E.Message, error) {
	data, err := downloadMediaFromURL(ctx, content.MediaURL)
	if err != nil {
		return nil, fmt.Errorf("failed to download sticker: %w", err)
	}

	resp, err := c.client.Upload(ctx, data, whatsmeow.MediaImage)
	if err != nil {
		return nil, fmt.Errorf("failed to upload sticker: %w", err)
	}

	return &waE2E.Message{
		StickerMessage: &waE2E.StickerMessage{
			URL:           &resp.URL,
			DirectPath:    &resp.DirectPath,
			MediaKey:      resp.MediaKey,
			FileEncSHA256: resp.FileEncSHA256,
			FileSHA256:    resp.FileSHA256,
			FileLength:    &resp.FileLength,
			Mimetype:      proto.String("image/webp"),
		},
	}, nil
}

// --- Location ---

func (c *WhatsmeowChannel) buildLocationMessage(content gateway.SendLocationContent) (*waE2E.Message, error) {
	lat := content.Latitude
	lng := content.Longitude

	locMsg := &waE2E.LocationMessage{
		DegreesLatitude:  &lat,
		DegreesLongitude: &lng,
	}
	if content.Name != "" {
		locMsg.Name = proto.String(content.Name)
	}
	if content.Address != "" {
		locMsg.Address = proto.String(content.Address)
	}

	return &waE2E.Message{LocationMessage: locMsg}, nil
}

// --- Contact ---

func (c *WhatsmeowChannel) buildContactMessage(content gateway.SendContactContent) (*waE2E.Message, error) {
	if len(content.Contacts) == 0 {
		return nil, fmt.Errorf("no contacts provided")
	}

	if len(content.Contacts) == 1 {
		contact := content.Contacts[0]
		return &waE2E.Message{
			ContactMessage: &waE2E.ContactMessage{
				DisplayName: proto.String(contact.FullName),
				Vcard:       proto.String(buildVCardFromInfo(contact)),
			},
		}, nil
	}

	contactMsgs := make([]*waE2E.ContactMessage, len(content.Contacts))
	for i, contact := range content.Contacts {
		contactMsgs[i] = &waE2E.ContactMessage{
			DisplayName: proto.String(contact.FullName),
			Vcard:       proto.String(buildVCardFromInfo(contact)),
		}
	}

	return &waE2E.Message{
		ContactsArrayMessage: &waE2E.ContactsArrayMessage{
			DisplayName: proto.String(fmt.Sprintf("%d contacts", len(content.Contacts))),
			Contacts:    contactMsgs,
		},
	}, nil
}

// --- Poll ---

func (c *WhatsmeowChannel) buildPollMessage(content gateway.SendPollContent) (*waE2E.Message, error) {
	optionNames := make([]string, len(content.Options))
	for i, opt := range content.Options {
		optionNames[i] = opt.OptionName
	}

	return c.client.BuildPollCreation(content.Name, optionNames, content.SelectableCount), nil
}

// --- List ---

func (c *WhatsmeowChannel) buildListMessage(content gateway.SendListContent) (*waE2E.Message, error) {
	sections := make([]*waE2E.ListMessage_Section, len(content.Sections))
	for i, s := range content.Sections {
		rows := make([]*waE2E.ListMessage_Row, len(s.Rows))
		for j, r := range s.Rows {
			rows[j] = &waE2E.ListMessage_Row{
				RowID: proto.String(r.RowID),
				Title: proto.String(r.Title),
			}
			if r.Description != "" {
				rows[j].Description = proto.String(r.Description)
			}
		}

		sections[i] = &waE2E.ListMessage_Section{
			Title: proto.String(s.Title),
			Rows:  rows,
		}
	}

	listType := waE2E.ListMessage_SINGLE_SELECT
	listMsg := &waE2E.ListMessage{
		Title:       proto.String(content.Title),
		Description: proto.String(content.Description),
		ButtonText:  proto.String(content.ButtonText),
		ListType:    &listType,
		Sections:    sections,
	}
	if content.FooterText != "" {
		listMsg.FooterText = proto.String(content.FooterText)
	}

	return &waE2E.Message{ListMessage: listMsg}, nil
}

// --- Button ---

func (c *WhatsmeowChannel) buildButtonMessage(content gateway.SendButtonContent) (*waE2E.Message, error) {
	buttons := make([]*waE2E.ButtonsMessage_Button, len(content.Buttons))
	for i, b := range content.Buttons {
		buttons[i] = &waE2E.ButtonsMessage_Button{
			ButtonID: proto.String(b.ButtonID),
			ButtonText: &waE2E.ButtonsMessage_Button_ButtonText{
				DisplayText: proto.String(b.DisplayText),
			},
			Type: waE2E.ButtonsMessage_Button_RESPONSE.Enum(),
		}
	}

	headerType := waE2E.ButtonsMessage_TEXT
	btnMsg := &waE2E.ButtonsMessage{
		ContentText: proto.String(content.Description),
		HeaderType:  &headerType,
		Buttons:     buttons,
	}
	if content.Title != "" {
		btnMsg.Header = &waE2E.ButtonsMessage_Text{Text: content.Title}
	}
	if content.Footer != "" {
		btnMsg.FooterText = proto.String(content.Footer)
	}

	return &waE2E.Message{ButtonsMessage: btnMsg}, nil
}

// --- Reaction ---

func (c *WhatsmeowChannel) buildReactionMessage(content gateway.SendReactionContent) (*waE2E.Message, error) {
	chatJID, err := parseOrBuildJID(content.Key.RemoteID)
	if err != nil {
		return nil, fmt.Errorf("invalid chat JID for reaction: %w", err)
	}

	var senderJID types.JID
	if content.Key.FromMe && c.client.Store.ID != nil {
		senderJID = *c.client.Store.ID
	} else {
		senderJID = chatJID
	}

	return c.client.BuildReaction(chatJID, senderJID, content.Key.ID, content.Reaction), nil
}

// --- Status ---

func (c *WhatsmeowChannel) buildStatusMessage(ctx context.Context, content gateway.SendStatusContent) (*waE2E.Message, error) {
	switch msgenums.MessageType(content.Type) {
	case msgenums.MessageTypeText:
		bgArgb := uint32(0xFF1B8755)
		if content.BackgroundColor != "" {
			bgArgb = parseColorToARGB(content.BackgroundColor)
		}

		font := waE2E.ExtendedTextMessage_SYSTEM
		if content.Font != "" {
			font = parseFontType(content.Font)
		}

		return &waE2E.Message{
			ExtendedTextMessage: &waE2E.ExtendedTextMessage{
				Text:           proto.String(content.Content),
				BackgroundArgb: &bgArgb,
				Font:           &font,
			},
		}, nil

	case msgenums.MessageTypeImage:
		return c.buildImageMessage(ctx, gateway.SendImageContent{MediaURL: content.Content, Caption: content.Caption})

	case msgenums.MessageTypeVideo:
		return c.buildVideoMessage(ctx, gateway.SendVideoContent{MediaURL: content.Content, Caption: content.Caption})

	case msgenums.MessageTypeAudio:
		return c.buildAudioMessage(ctx, gateway.SendAudioContent{MediaURL: content.Content})

	default:
		return nil, fmt.Errorf("unsupported status type: %s", content.Type)
	}
}

// --- Media (generic) ---

func (c *WhatsmeowChannel) buildMediaMessage(ctx context.Context, msgType msgenums.MessageType, content gateway.SendMediaContent) (*waE2E.Message, error) {
	switch msgType {
	case msgenums.MessageTypeImage:
		return c.buildImageMessage(ctx, gateway.SendImageContent{MediaURL: content.MediaURL, Caption: content.Caption})
	case msgenums.MessageTypeVideo:
		return c.buildVideoMessage(ctx, gateway.SendVideoContent{MediaURL: content.MediaURL, Caption: content.Caption})
	case msgenums.MessageTypeDocument:
		return c.buildDocumentMessage(ctx, gateway.SendDocumentContent{MediaURL: content.MediaURL, FileName: content.FileName})
	default:
		return nil, fmt.Errorf("unsupported media type: %s", msgType)
	}
}

// --- Helpers ---

// downloadMediaFromURL fetches raw bytes for a media reference. It accepts
// two flavors:
//
//   - http(s) URLs — the original behavior, downloaded via the default client.
//   - data: URIs — parsed inline. Enables clients to upload a local file
//     without first pushing it to external storage: the frontend reads the
//     File via FileReader and posts the resulting `data:<mime>;base64,<...>`
//     string as mediaUrl. Both base64 and URL-encoded payloads are supported
//     per the RFC 2397 grammar.
func downloadMediaFromURL(ctx context.Context, mediaURL string) ([]byte, error) {
	if strings.HasPrefix(mediaURL, "data:") {
		return decodeDataURL(mediaURL)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to download media: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("media download returned status %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read media body: %w", err)
	}

	return data, nil
}

// decodeDataURL parses an RFC 2397 data URI and returns the decoded payload.
// It does not preserve the mimetype — callers already use http.DetectContentType
// on the returned bytes to set the outgoing message mimetype.
func decodeDataURL(dataURL string) ([]byte, error) {
	commaIdx := strings.Index(dataURL, ",")
	if commaIdx == -1 {
		return nil, fmt.Errorf("invalid data URL: missing comma separator")
	}
	header := dataURL[len("data:"):commaIdx]
	payload := dataURL[commaIdx+1:]

	if strings.Contains(header, ";base64") {
		decoded, err := base64.StdEncoding.DecodeString(payload)
		if err != nil {
			return nil, fmt.Errorf("invalid base64 data URL payload: %w", err)
		}
		return decoded, nil
	}

	// Plain text (url-encoded) payload — rare for media but allowed by the spec.
	decoded, err := url.QueryUnescape(payload)
	if err != nil {
		return nil, fmt.Errorf("invalid url-encoded data URL payload: %w", err)
	}
	return []byte(decoded), nil
}

func buildVCardFromInfo(contact gateway.SendContactInfo) string {
	vcard := "BEGIN:VCARD\nVERSION:3.0\n"
	vcard += fmt.Sprintf("FN:%s\n", contact.FullName)
	vcard += fmt.Sprintf("TEL;type=CELL;type=VOICE;waid=%s:+%s\n", contact.PhoneNumber, contact.PhoneNumber)

	if contact.Organization != "" {
		vcard += fmt.Sprintf("ORG:%s\n", contact.Organization)
	}
	if contact.Email != "" {
		vcard += fmt.Sprintf("EMAIL:%s\n", contact.Email)
	}

	vcard += "END:VCARD"
	return vcard
}

func parseColorToARGB(hex string) uint32 {
	if len(hex) > 0 && hex[0] == '#' {
		hex = hex[1:]
	}
	var argb uint32
	switch len(hex) {
	case 6: // RGB -> ARGB with full opacity
		fmt.Sscanf(hex, "%06x", &argb)
		argb |= 0xFF000000
	case 8: // ARGB
		fmt.Sscanf(hex, "%08x", &argb)
	default:
		return 0xFF1B8755 // default green
	}
	return argb
}

func parseFontType(font string) waE2E.ExtendedTextMessage_FontType {
	switch font {
	case "SYSTEM_TEXT":
		return waE2E.ExtendedTextMessage_SYSTEM_TEXT
	case "FB_SCRIPT":
		return waE2E.ExtendedTextMessage_FB_SCRIPT
	case "SYSTEM_BOLD":
		return waE2E.ExtendedTextMessage_SYSTEM_BOLD
	case "MORNINGBREEZE_REGULAR":
		return waE2E.ExtendedTextMessage_MORNINGBREEZE_REGULAR
	case "CALISTOGA_REGULAR":
		return waE2E.ExtendedTextMessage_CALISTOGA_REGULAR
	case "EXO2_EXTRABOLD":
		return waE2E.ExtendedTextMessage_EXO2_EXTRABOLD
	case "COURIERPRIME_BOLD":
		return waE2E.ExtendedTextMessage_COURIERPRIME_BOLD
	default:
		return waE2E.ExtendedTextMessage_SYSTEM
	}
}
