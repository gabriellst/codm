package whatsapp

import (
	"context"
	"database/sql"
	"log/slog"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"

	"template/core-go/db/sqlite"
)

// Inbound media used to be downloaded INSIDE the whatsmeow event handler. That handler is synchronous, so a
// slow CDN fetch (45s timeout) froze event dispatch for its whole duration: keepalive responses, receipts and
// every message behind it waited (measured 2026-11-26 18:24–18:25: two `Node handling took 45s` stalls right
// where a send failed and keepalives timed out). Now the message is persisted at once without a mediaPath,
// and a small worker pool downloads the attachment afterwards and writes the mediaPath into the stored row.
const (
	// inboundMediaWorkers bounds concurrent downloads.
	inboundMediaWorkers = 3
	// inboundMediaQueue bounds the backlog; a full queue drops the download (the message is already stored).
	inboundMediaQueue = 256
	// patchAttempts / patchBackoff: the row is written by the projector right after the domain event is
	// saved, so a fast download can finish before it exists. Retried for ~patchBackoff*(1+..+attempts-1).
	patchAttempts = 8
	patchBackoff  = 500 * time.Millisecond
)

// mediaJob is one attachment to fetch. ctx is the channel's stopCtx at enqueue time, so Disconnect cancels it.
type mediaJob struct {
	ctx       context.Context
	messageID string // platform message id (gateway_messages.platform_message_id)
	key       string // content key holding the media fields, e.g. "imageMessage"
	dl        whatsmeow.DownloadableMessage
	mimetype  string
}

// inboundMedia describes the downloadable part of a message: the DownloadableMessage plus the content key
// (matches mapper.extractMessageContent) its mediaPath belongs under.
func inboundMedia(msg *waE2E.Message) (dl whatsmeow.DownloadableMessage, key, mimetype string, size uint64) {
	if msg == nil {
		return nil, "", "", 0
	}
	switch {
	case msg.ImageMessage != nil:
		return msg.ImageMessage, "imageMessage", msg.ImageMessage.GetMimetype(), msg.ImageMessage.GetFileLength()
	case msg.VideoMessage != nil:
		return msg.VideoMessage, "videoMessage", msg.VideoMessage.GetMimetype(), msg.VideoMessage.GetFileLength()
	case msg.AudioMessage != nil:
		return msg.AudioMessage, "audioMessage", msg.AudioMessage.GetMimetype(), msg.AudioMessage.GetFileLength()
	case msg.DocumentMessage != nil:
		return msg.DocumentMessage, "documentMessage", msg.DocumentMessage.GetMimetype(), msg.DocumentMessage.GetFileLength()
	case msg.StickerMessage != nil:
		return msg.StickerMessage, "stickerMessage", msg.StickerMessage.GetMimetype(), msg.StickerMessage.GetFileLength()
	default:
		return nil, "", "", 0
	}
}

// shouldFetchInboundMedia is false for chats whose media nobody reads (newsletters/channels, status
// broadcasts) and for echoes of messages this very device sent (the bridge keeps its own copy of those).
func shouldFetchInboundMedia(v *events.Message, own *types.JID) bool {
	switch v.Info.Chat.Server {
	case types.NewsletterServer, types.BroadcastServer:
		return false
	}
	if v.Info.IsFromMe && own != nil && v.Info.Sender.User == own.User && v.Info.Sender.Device == own.Device {
		return false
	}
	return true
}

// enqueueInboundMedia hands the attachment of v (if it has one worth fetching) to the worker pool. It never
// blocks: a full queue drops the job with a warning.
func (c *WhatsmeowChannel) enqueueInboundMedia(ctx context.Context, v *events.Message) {
	if c.mediaStore == nil || c.db == nil || !shouldFetchInboundMedia(v, c.device.ID) {
		return
	}
	dl, key, mimetype, size := inboundMedia(v.Message)
	if dl == nil {
		return
	}
	if size > maxInboundMediaBytes {
		slog.Warn("inbound media skipped: too large", "instanceId", c.instanceID, "bytes", size)
		return
	}
	c.mediaOnce.Do(func() {
		c.mediaJobs = make(chan mediaJob, inboundMediaQueue)
		for i := 0; i < inboundMediaWorkers; i++ {
			go c.mediaWorker()
		}
	})
	select {
	case c.mediaJobs <- mediaJob{ctx: ctx, messageID: v.Info.ID, key: key, dl: dl, mimetype: mimetype}:
	default:
		slog.Warn("inbound media dropped: download queue full", "instanceId", c.instanceID, "messageId", v.Info.ID)
	}
}

func (c *WhatsmeowChannel) mediaWorker() {
	for job := range c.mediaJobs {
		c.runMediaJob(job)
	}
}

func (c *WhatsmeowChannel) runMediaJob(job mediaJob) {
	ctx, cancel := context.WithTimeout(job.ctx, inboundMediaTimeout)
	defer cancel()
	data, err := c.client.Download(ctx, job.dl)
	if err != nil {
		slog.Warn("inbound media download failed", "instanceId", c.instanceID, "mimetype", job.mimetype, "error", err)
		return
	}
	path, err := c.mediaStore.Save(data, job.mimetype)
	if err != nil {
		slog.Warn("inbound media save failed", "instanceId", c.instanceID, "mimetype", job.mimetype, "error", err)
		return
	}
	// The write is not bound to the download's timeout, only to Disconnect.
	if err := patchMediaPath(job.ctx, c.db, c.instanceID.String(), job.messageID, job.key, path, time.Sleep); err != nil {
		slog.Warn("inbound media: could not record mediaPath", "instanceId", c.instanceID, "messageId", job.messageID, "error", err)
	}
}

// patchMediaPath writes mediaPath into gateway_messages.content under key, once (an existing mediaPath is
// kept). While the row does not exist yet, or the database is LOCKED, it retries with a growing pause.
func patchMediaPath(ctx context.Context, db *sql.DB, channelID, messageID, key, path string, sleep func(time.Duration)) error {
	var lastErr error
	for attempt := 1; attempt <= patchAttempts; attempt++ {
		res, err := db.ExecContext(ctx,
			`UPDATE gateway_messages
			    SET content = json_set(content, '$.' || ?1 || '.mediaPath', ?2)
			  WHERE channel_id = ?3 AND platform_message_id = ?4
			    AND json_extract(content, '$.' || ?1 || '.mediaPath') IS NULL
			    AND json_type(content, '$.' || ?1) = 'object'`,
			key, path, channelID, messageID)
		switch {
		case err != nil && !sqlite.IsBusy(err):
			return err
		case err != nil:
			lastErr = err
		default:
			if n, _ := res.RowsAffected(); n > 0 {
				return nil
			}
			// Zero rows: row missing (projector not done), or mediaPath already present.
			var has int
			qerr := db.QueryRowContext(ctx,
				`SELECT json_extract(content, '$.' || ?1 || '.mediaPath') IS NOT NULL
				   FROM gateway_messages WHERE channel_id = ?2 AND platform_message_id = ?3`,
				key, channelID, messageID).Scan(&has)
			if qerr == nil && has == 1 {
				return nil
			}
			lastErr = qerr
		}
		if attempt < patchAttempts {
			sleep(time.Duration(attempt) * patchBackoff)
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
	}
	if lastErr == nil {
		lastErr = sql.ErrNoRows
	}
	return lastErr
}
