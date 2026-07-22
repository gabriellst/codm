package types

// Saver is the interface that accumulator calls when a batch is ready.
type Saver[T any] interface {
	Save(items []T) error
}

// Accumulator buffers items and calls Save when the batch size is reached or Flush is called.
type Accumulator[T any] struct {
	batchSize int
	buffer    []T
	saver     Saver[T]
}

func NewAccumulator[T any](batchSize int, saver Saver[T]) *Accumulator[T] {
	return &Accumulator[T]{
		batchSize: batchSize,
		buffer:    make([]T, 0, batchSize),
		saver:     saver,
	}
}

// Add appends items to the buffer and triggers Save for each full batch.
func (a *Accumulator[T]) Add(items []T) error {
	a.buffer = append(a.buffer, items...)

	for len(a.buffer) >= a.batchSize {
		batch := a.buffer[:a.batchSize]
		if err := a.saver.Save(batch); err != nil {
			return err
		}

		remaining := a.buffer[a.batchSize:]
		a.buffer = make([]T, len(remaining), max(len(remaining), a.batchSize))
		copy(a.buffer, remaining)
	}

	return nil
}

// Flush saves any remaining items in the buffer.
func (a *Accumulator[T]) Flush() error {
	if len(a.buffer) == 0 {
		return nil
	}
	if err := a.saver.Save(a.buffer); err != nil {
		return err
	}
	a.buffer = make([]T, 0, a.batchSize)
	return nil
}
