package types

import "testing"

type recordingSaver[T any] struct{ batches [][]T }

func (r *recordingSaver[T]) Save(items []T) { r.batches = append(r.batches, append([]T(nil), items...)) }

func TestAccumulator_FlushesAtBatchSize(t *testing.T) {
	s := &recordingSaver[int]{}
	a := NewAccumulator[int](2, s)
	a.Add([]int{1, 2, 3})
	if len(s.batches) != 1 || len(s.batches[0]) != 2 {
		t.Fatalf("expected one full batch of 2, got %v", s.batches)
	}
	a.Flush()
	if len(s.batches) != 2 || len(s.batches[1]) != 1 {
		t.Fatalf("expected remainder batch of 1, got %v", s.batches)
	}
}
