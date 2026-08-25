package unitofwork

import "context"

// NoopUnitOfWork executes the function directly without a transaction.
type NoopUnitOfWork struct{}

func NewNoopUnitOfWork() *NoopUnitOfWork {
	return &NoopUnitOfWork{}
}

func (uow *NoopUnitOfWork) Execute(ctx context.Context, fn func(ctx context.Context) error) error {
	return fn(ctx)
}
