package repositories

import (
	"fmt"

	"template/api-go/internal/shared/errors"
)

// CheckOptimisticLock verifies that an upsert affected at least one row.
// If rowsAffected == 0, another transaction has already modified the entity.
func CheckOptimisticLock(rowsAffected int64, entityName string) error {
	if rowsAffected == 0 {
		return errors.NewBaseError(
			errors.CodeOptimisticLockConflict,
			fmt.Sprintf("optimistic lock conflict on %s: entity was modified by another transaction", entityName),
		)
	}
	return nil
}
