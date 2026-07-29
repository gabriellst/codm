// External (integration-event) handlers for the thread (BC4 Thread & Routing) context.
// The inbound ingestion consumer — the phase-6 hard gate: dedup FIRST (UNIQUE(channelId,
// platformMessageId) INSERT ... ON CONFLICT DO NOTHING) so at-least-once delivery from the gateway
// becomes exactly-once processing.
export { ConsumeInboundMessage } from './ConsumeInboundMessage'
// The delivery leg: `integration.channel.delivery_requested` → the gateway's send. One consumer for
// every producer that has something to say on the channel.
export { DeliverChannelMessage } from './DeliverChannelMessage'
// The agent context speaks in issues, the channel in conversations — only the thread knows which
// contact an issue belongs to, so the reply→delivery translation lives here.
export { DeliverOrchestratorReply } from './DeliverOrchestratorReply'
