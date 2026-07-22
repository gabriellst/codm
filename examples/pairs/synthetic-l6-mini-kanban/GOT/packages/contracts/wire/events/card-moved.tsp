import "./_base.tsp";

namespace TemplateContracts;

@doc("Published by TS card context after MoveCard use case completes. BoardSection SSE listener consumes to invalidate the GetBoard query — drives realtime card position updates without a reload.")
model CardMovedEvent extends IntegrationEvent {
  name: "integration.shared.card.moved";

  @doc("Board the card belongs to. REQUIRED for SSE tenancy-filter: the broadcaster gates delivery on payload.storeId — but GetBoard query key is board-scoped, so boardId drives invalidation on the frontend.")
  boardId: string;

  @doc("The card that was moved.")
  cardId: string;

  @doc("List the card was moved FROM.")
  fromListId: string;

  @doc("List the card was moved TO.")
  toListId: string;

  @doc("Owning store — the SSE broadcaster filters clients by this field. Every kanban board is store-scoped.")
  storeId: string;
}
