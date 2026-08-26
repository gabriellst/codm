package objects

import "fmt"

// PrimitiveValueObject is a generic wrapper for simple value objects.
type PrimitiveValueObject[T comparable] struct {
	value T
}

func NewPrimitiveValueObject[T comparable](val T, validate func(T) error) (PrimitiveValueObject[T], error) {
	if validate != nil {
		if err := validate(val); err != nil {
			return PrimitiveValueObject[T]{}, err
		}
	}
	return PrimitiveValueObject[T]{value: val}, nil
}

func (vo PrimitiveValueObject[T]) Value() T { return vo.value }

func (vo PrimitiveValueObject[T]) String() string { return fmt.Sprintf("%v", vo.value) }

func (vo PrimitiveValueObject[T]) Equals(other PrimitiveValueObject[T]) bool {
	return vo.value == other.value
}

func (vo PrimitiveValueObject[T]) IsZero() bool {
	var zero T
	return vo.value == zero
}
