package message

import (
	"context"

	"template/api-go/internal/channel/entities"
)

// MessageRepository is the write side for the Message aggregate. Used by
// command use cases (Edit, SoftDelete) that load the aggregate, invoke a
// method, and save — which appends events and updates the projection row.
//
// Not-found semantics: Find returns (nil, nil) when the message is absent.
type MessageRepository interface {
	Find(ctx context.Context, messageID string) (*entities.Message, error)
	Save(ctx context.Context, message *entities.Message) error
}
