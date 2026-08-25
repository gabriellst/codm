package types

// Saver receives a ready batch from an Accumulator.
type Saver[T any] interface{ Save(items []T) }

// Accumulator buffers items and calls Save when batchSize is reached or Flush is called.
type Accumulator[T any] struct {
	batchSize int
	buffer    []T
	saver     Saver[T]
}

func NewAccumulator[T any](batchSize int, saver Saver[T]) *Accumulator[T] {
	return &Accumulator[T]{batchSize: batchSize, buffer: make([]T, 0, batchSize), saver: saver}
}

func (a *Accumulator[T]) Add(items []T) {
	a.buffer = append(a.buffer, items...)
	for len(a.buffer) >= a.batchSize {
		batch := a.buffer[:a.batchSize]
		a.saver.Save(batch)
		remaining := a.buffer[a.batchSize:]
		a.buffer = make([]T, len(remaining), max(len(remaining), a.batchSize))
		copy(a.buffer, remaining)
	}
}

func (a *Accumulator[T]) Flush() {
	if len(a.buffer) == 0 {
		return
	}
	a.saver.Save(a.buffer)
	a.buffer = make([]T, 0, a.batchSize)
}
