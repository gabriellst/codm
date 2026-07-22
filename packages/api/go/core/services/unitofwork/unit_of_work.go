package unitofwork

import (
	"context"
	"database/sql"
)

// UnitOfWork wraps a database transaction.
type UnitOfWork interface {
	Execute(ctx context.Context, fn func(ctx context.Context) error) error
}

type txKey struct{}

// TxFromContext extracts the *sql.Tx from the context.
// Repositories use this to participate in the unit of work.
//
func TxFromContext(ctx context.Context) (*sql.Tx, bool) {
	tx, ok := ctx.Value(txKey{}).(*sql.Tx)
	return tx, ok
}
