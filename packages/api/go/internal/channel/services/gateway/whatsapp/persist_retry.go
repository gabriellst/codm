package whatsapp

import (
	"time"

	"template/core-go/db/sqlite"
)

// How many times an inbound event batch is offered to the database while the write lock is taken, and
// the pause before each retry grows by `persistRetryBackoff`. Bounded on purpose: the whatsmeow event
// handler is synchronous, so every retry delays the events behind this one — five attempts span a few
// seconds on top of the store's own busy_timeout, the length of the stalls measured 2026-10-30.
const (
	persistAttempts     = 5
	persistRetryBackoff = 500 * time.Millisecond
)

// persistWithRetry runs save, and runs it again while it fails with the database LOCKED — the one
// failure a later attempt can succeed at.
//
// The failure this closes, measured 2026-10-30: while the daemon and the gateway fought over the
// SQLite write lock, `SaveAll` hit SQLITE_BUSY past its 5s busy_timeout and the event batch was
// DROPPED — one `channel.message_received` among them. whatsmeow had already acknowledged that
// message to WhatsApp, so nothing redelivered it: the daemon never saw it and the agent never
// answered. Re-offering the batch is safe because every event carries the id it was built with and
// both inserts are `ON CONFLICT(id) DO NOTHING` — a retry after a partial write lands on the same rows.
//
// Any other error returns at once: a constraint or a malformed row fails the same way every time.
func persistWithRetry(save func() error, sleep func(time.Duration)) error {
	var err error
	for attempt := 1; attempt <= persistAttempts; attempt++ {
		err = save()
		if err == nil || !sqlite.IsBusy(err) {
			return err
		}
		if attempt < persistAttempts {
			sleep(time.Duration(attempt) * persistRetryBackoff)
		}
	}
	return err
}
