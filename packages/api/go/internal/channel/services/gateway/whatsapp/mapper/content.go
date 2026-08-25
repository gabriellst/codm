package mapper

import (
	"encoding/json"

	"go.mau.fi/whatsmeow/proto/waE2E"

	msgenums "template/api-go/internal/channel/enums"
)

// extractMessageContent inspects a waE2E.Message and returns the canonical
// message type string and a JSON-marshalled content map. Returns ("protocol",
// nil) for ProtocolMessage and ("unknown", nil) for unrecognised types.
// mediaPath ("" = none) is the already-downloaded attachment on disk; it only
// applies to the top-level message — quoted messages and history sync never
// carry one.
func extractMessageContent(msg *waE2E.Message, mediaPath string) (string, json.RawMessage) {
	if msg == nil {
		return "unknown", nil
	}

	content := make(map[string]any)

	if msg.Conversation != nil {
		content["text"] = *msg.Conversation
		return string(msgenums.MessageTypeText), marshalContent(content)
	}
	if msg.ExtendedTextMessage != nil {
		extData := make(map[string]any)
		if msg.ExtendedTextMessage.Text != nil {
			extData["text"] = *msg.ExtendedTextMessage.Text
			// Also set at top level for backward compatibility with extractMessageText
			content["text"] = *msg.ExtendedTextMessage.Text
		}
		if msg.ExtendedTextMessage.MatchedText != nil {
			extData["matchedText"] = *msg.ExtendedTextMessage.MatchedText
		}
		if msg.ExtendedTextMessage.Title != nil {
			extData["title"] = *msg.ExtendedTextMessage.Title
		}
		if msg.ExtendedTextMessage.ContextInfo != nil {
			ctxInfo := extractContextInfo(msg.ExtendedTextMessage.ContextInfo)
			if len(ctxInfo) > 0 {
				content["contextInfo"] = ctxInfo
			}
		}
		content["extendedTextMessage"] = extData
		return string(msgenums.MessageTypeText), marshalContent(content)
	}
	if msg.ImageMessage != nil {
		imgData := make(map[string]any)
		extractMediaFields(imgData, msg.ImageMessage.Caption, msg.ImageMessage.Mimetype, msg.ImageMessage.URL, mediaPath)
		if msg.ImageMessage.JPEGThumbnail != nil {
			imgData["jpegThumbnail"] = msg.ImageMessage.JPEGThumbnail
		}
		if msg.ImageMessage.FileLength != nil {
			imgData["fileLength"] = *msg.ImageMessage.FileLength
		}
		if msg.ImageMessage.Height != nil {
			imgData["height"] = *msg.ImageMessage.Height
		}
		if msg.ImageMessage.Width != nil {
			imgData["width"] = *msg.ImageMessage.Width
		}
		content["imageMessage"] = imgData
		return string(msgenums.MessageTypeImage), marshalContent(content)
	}
	if msg.VideoMessage != nil {
		vidData := make(map[string]any)
		extractMediaFields(vidData, msg.VideoMessage.Caption, msg.VideoMessage.Mimetype, msg.VideoMessage.URL, mediaPath)
		if msg.VideoMessage.JPEGThumbnail != nil {
			vidData["jpegThumbnail"] = msg.VideoMessage.JPEGThumbnail
		}
		if msg.VideoMessage.Seconds != nil {
			vidData["seconds"] = *msg.VideoMessage.Seconds
		}
		if msg.VideoMessage.FileLength != nil {
			vidData["fileLength"] = *msg.VideoMessage.FileLength
		}
		content["videoMessage"] = vidData
		return string(msgenums.MessageTypeVideo), marshalContent(content)
	}
	if msg.AudioMessage != nil {
		audioData := make(map[string]any)
		extractMediaFields(audioData, nil, msg.AudioMessage.Mimetype, msg.AudioMessage.URL, mediaPath)
		if msg.AudioMessage.PTT != nil {
			audioData["ptt"] = *msg.AudioMessage.PTT
		}
		if msg.AudioMessage.Seconds != nil {
			audioData["seconds"] = *msg.AudioMessage.Seconds
		}
		if msg.AudioMessage.FileLength != nil {
			audioData["fileLength"] = *msg.AudioMessage.FileLength
		}
		content["audioMessage"] = audioData
		return string(msgenums.MessageTypeAudio), marshalContent(content)
	}
	if msg.DocumentMessage != nil {
		docData := make(map[string]any)
		extractMediaFields(docData, msg.DocumentMessage.Caption, msg.DocumentMessage.Mimetype, msg.DocumentMessage.URL, mediaPath)
		if msg.DocumentMessage.FileName != nil {
			docData["fileName"] = *msg.DocumentMessage.FileName
		}
		if msg.DocumentMessage.JPEGThumbnail != nil {
			docData["jpegThumbnail"] = msg.DocumentMessage.JPEGThumbnail
		}
		if msg.DocumentMessage.FileLength != nil {
			docData["fileLength"] = *msg.DocumentMessage.FileLength
		}
		content["documentMessage"] = docData
		return string(msgenums.MessageTypeDocument), marshalContent(content)
	}
	if msg.StickerMessage != nil {
		stickerData := make(map[string]any)
		extractMediaFields(stickerData, nil, msg.StickerMessage.Mimetype, msg.StickerMessage.URL, mediaPath)
		if msg.StickerMessage.IsAnimated != nil {
			stickerData["isAnimated"] = *msg.StickerMessage.IsAnimated
		}
		if msg.StickerMessage.PngThumbnail != nil {
			stickerData["pngThumbnail"] = msg.StickerMessage.PngThumbnail
		}
		if msg.StickerMessage.FileLength != nil {
			stickerData["fileLength"] = *msg.StickerMessage.FileLength
		}
		content["stickerMessage"] = stickerData
		return string(msgenums.MessageTypeSticker), marshalContent(content)
	}
	if msg.ContactMessage != nil {
		contactData := make(map[string]any)
		if msg.ContactMessage.DisplayName != nil {
			contactData["displayName"] = *msg.ContactMessage.DisplayName
		}
		if msg.ContactMessage.Vcard != nil {
			contactData["vcard"] = *msg.ContactMessage.Vcard
		}
		content["contactMessage"] = contactData
		return string(msgenums.MessageTypeContact), marshalContent(content)
	}
	if msg.LocationMessage != nil {
		locData := make(map[string]any)
		if msg.LocationMessage.DegreesLatitude != nil {
			locData["degreesLatitude"] = *msg.LocationMessage.DegreesLatitude
		}
		if msg.LocationMessage.DegreesLongitude != nil {
			locData["degreesLongitude"] = *msg.LocationMessage.DegreesLongitude
		}
		if msg.LocationMessage.Name != nil {
			locData["name"] = *msg.LocationMessage.Name
		}
		if msg.LocationMessage.Address != nil {
			locData["address"] = *msg.LocationMessage.Address
		}
		if msg.LocationMessage.JPEGThumbnail != nil {
			locData["jpegThumbnail"] = msg.LocationMessage.JPEGThumbnail
		}
		content["locationMessage"] = locData
		return string(msgenums.MessageTypeLocation), marshalContent(content)
	}
	if msg.PollCreationMessage != nil {
		pollData := make(map[string]any)
		if msg.PollCreationMessage.Name != nil {
			pollData["question"] = *msg.PollCreationMessage.Name
		}
		options := make([]string, 0)
		for _, opt := range msg.PollCreationMessage.Options {
			if opt.OptionName != nil {
				options = append(options, *opt.OptionName)
			}
		}
		pollData["options"] = options
		content["pollMessage"] = pollData
		return string(msgenums.MessageTypePoll), marshalContent(content)
	}
	if msg.ReactionMessage != nil {
		reactionData := make(map[string]any)
		reactionData["text"] = ""
		if msg.ReactionMessage.Text != nil {
			reactionData["text"] = *msg.ReactionMessage.Text
		}
		if msg.ReactionMessage.Key != nil {
			keyData := make(map[string]any)
			if msg.ReactionMessage.Key.ID != nil {
				keyData["id"] = *msg.ReactionMessage.Key.ID
			}
			if msg.ReactionMessage.Key.RemoteJID != nil {
				keyData["remoteId"] = *msg.ReactionMessage.Key.RemoteJID
			}
			if msg.ReactionMessage.Key.FromMe != nil {
				keyData["fromMe"] = *msg.ReactionMessage.Key.FromMe
			}
			reactionData["key"] = keyData
		}
		content["reactionMessage"] = reactionData
		// Keep top-level text for backward compatibility
		content["text"] = reactionData["text"]
		return string(msgenums.MessageTypeReaction), marshalContent(content)
	}
	if msg.ProtocolMessage != nil {
		return "protocol", nil
	}

	return "unknown", nil
}

// extractContextInfo builds the contextInfo map from a waE2E.ContextInfo proto.
func extractContextInfo(ci *waE2E.ContextInfo) map[string]any {
	if ci == nil {
		return nil
	}
	ctxInfo := make(map[string]any)
	if ci.StanzaID != nil {
		ctxInfo["stanzaId"] = *ci.StanzaID
	}
	if ci.Participant != nil {
		ctxInfo["participant"] = stripJIDServer(*ci.Participant)
	}
	if ci.QuotedMessage != nil {
		quotedType, quotedContent := extractMessageContent(ci.QuotedMessage, "")
		ctxInfo["quotedMessageType"] = quotedType
		if quotedContent != nil {
			ctxInfo["quotedMessageContent"] = quotedContent
		}
	}
	return ctxInfo
}

// extractMediaFields populates a media content map with caption, mimetype, url
// and the local mediaPath of the already-downloaded attachment ("" = none).
func extractMediaFields(data map[string]any, caption *string, mimetype *string, url *string, mediaPath string) {
	if caption != nil {
		data["caption"] = *caption
	}
	if mimetype != nil {
		data["mimetype"] = *mimetype
	}
	if url != nil {
		data["url"] = *url
	}
	if mediaPath != "" {
		data["mediaPath"] = mediaPath
	}
}
