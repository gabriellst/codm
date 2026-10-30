package sqlite

import (
	"errors"

	moderncsqlite "modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

// IsBusy reports whether err is SQLite refusing a write because another connection holds the lock —
// `SQLITE_BUSY` and its extended codes (`SQLITE_BUSY_SNAPSHOT`, …), i.e. a failure that a later
// attempt can succeed at, as opposed to a constraint or a malformed statement that will fail again.
//
// Read off the driver's TYPED error code (the low byte is the primary result code), never its message:
// the text is the driver's to change, the code is SQLite's contract.
func IsBusy(err error) bool {
	var sqliteErr *moderncsqlite.Error
	if !errors.As(err, &sqliteErr) {
		return false
	}
	return sqliteErr.Code()&0xff == sqlite3.SQLITE_BUSY
}
