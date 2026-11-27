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
// The WhatsApp channel passes nil: downloading inside the synchronous whatsmeow
// event handler stalled keepalives, so it fetches media on a worker pool after
// the message is stored (whatsapp/media_worker.go) and patches mediaPath in.
// A locator stays supported for callers that can afford to block.
// It also keeps the mapper package free of a whatsmeow client dependency.
type MediaLocator interface {
	LocateMedia(msg *waE2E.Message) string
}
