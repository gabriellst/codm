package unitofwork

import (
	"context"
	"database/sql"
	"fmt"
)

// SQLUnitOfWork implements UnitOfWork with database/sql transactions.
type SQLUnitOfWork struct {
	db *sql.DB
}

func NewSQLUnitOfWork(db *sql.DB) *SQLUnitOfWork {
	return &SQLUnitOfWork{db: db}
}

func (uow *SQLUnitOfWork) Execute(ctx context.Context, fn func(ctx context.Context) error) error {
	tx, err := uow.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}

	txCtx := context.WithValue(ctx, txKey{}, tx)

	if err := fn(txCtx); err != nil {
		_ = tx.Rollback()
		return err
	}

	return tx.Commit()
}
