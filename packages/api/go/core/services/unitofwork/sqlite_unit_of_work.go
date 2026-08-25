package unitofwork

import (
	"context"
	"database/sql"
	"fmt"
)

// CommitNotifier is nudged after a unit commits so a polling outbox dispatcher
// wakes at once instead of waiting out its poll interval. The mediator's
// SqliteWalPollingStrategy satisfies it structurally, so the UoW stays decoupled
// from the mediator package. Optional — a nil notifier degrades to pure WAL
// polling (the dispatcher still drains, just at poll latency).
type CommitNotifier interface {
	Notify(ctx context.Context, source string) error
}

// SqliteUnitOfWork is the concrete UnitOfWork for the SQLite-backed contexts. It
// runs the whole command closure inside ONE SQLite transaction, so an aggregate's
// row writes, its domain-event audit rows (shared_events) and the matching outbox
// rows (shared_outbox) commit — or roll back — atomically. The store is opened
// with _txlock=immediate, so BeginTx issues BEGIN IMMEDIATE: the write lock is
// taken up front, sidestepping the deferred→upgrade SQLITE_BUSY window.
//
// Repositories participate by resolving their queries against the *sql.Tx in
// context (unitofwork.TxFromContext); a write that ignores the tx would escape the
// unit and break atomicity. Replaces the NoopUnitOfWork on the sqlite side.
type SqliteUnitOfWork struct {
	db     *sql.DB
	notify CommitNotifier
}

// NewSqliteUnitOfWork builds the UoW over the SQLite store's db. notify may be nil
// (pure WAL polling); when set, a successful commit nudges it so the domain-event
// dispatcher drains the just-written outbox rows without poll latency.
func NewSqliteUnitOfWork(db *sql.DB, notify CommitNotifier) *SqliteUnitOfWork {
	return &SqliteUnitOfWork{db: db, notify: notify}
}

// compile-time interface check.
var _ UnitOfWork = (*SqliteUnitOfWork)(nil)

func (uow *SqliteUnitOfWork) Execute(ctx context.Context, fn func(ctx context.Context) error) error {
	// Already inside a unit → flatten onto the enclosing tx: a nested Execute
	// reuses the outer transaction rather than opening a second one against the
	// same (immediate, single-writer) db and self-deadlocking on the write lock.
	if _, ok := TxFromContext(ctx); ok {
		return fn(ctx)
	}

	tx, err := uow.db.BeginTx(ctx, nil) // BEGIN IMMEDIATE (store _txlock=immediate)
	if err != nil {
		return fmt.Errorf("sqlite unit of work: begin: %w", err)
	}

	// Deferred rollback guard: rolls back unless the commit below flipped the flag.
	// Covers both an fn that returns an error AND an fn that PANICS — without it a
	// panic would unwind past Execute leaving *tx open until the pooled connection is
	// reclaimed (a leaked write lock on the single-writer db). Rollback after a
	// successful Commit is a harmless no-op (sql.ErrTxDone), so the guard is safe on
	// the happy path too.
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	txCtx := context.WithValue(ctx, txKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("sqlite unit of work: commit: %w", err)
	}
	committed = true

	// Post-commit the outbox rows are visible; nudge the dispatcher (best-effort,
	// coalescing) so it claims them at once. Source is irrelevant to the in-process
	// strategy (a single nudge channel), so an empty source is fine.
	if uow.notify != nil {
		_ = uow.notify.Notify(ctx, "")
	}
	return nil
}
