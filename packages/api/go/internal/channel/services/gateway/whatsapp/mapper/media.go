package mapper

import "go.mau.fi/whatsmeow/proto/waE2E"

// MediaLocator resolves the media attachment of an inbound message to an
// absolute path in the shared data dir. Implementations download, decrypt and
// persist the bytes at receive time (the WhatsApp CDN expires media after a few
// weeks; the encrypted URL alone is useless without the in-proto media key).
// Returns "" when the message carries no downloadable media or the download
// failed — the event then ships without mediaPath and consumers degrade to
// metadata-only.
//
// Interface justified: WhatsmeowChannel (prod — client.Download + MediaStore)
// vs nil (mock gateway — no media capability, declared by passing no locator).
// It also keeps the mapper package free of a whatsmeow client dependency.
type MediaLocator interface {
	LocateMedia(msg *waE2E.Message) string
}
