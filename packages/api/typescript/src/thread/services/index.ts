export { OpenIssuesReader, DrizzleOpenIssuesReader, MockOpenIssuesReader } from './OpenIssuesReader'
export { ChannelConnectivity, DrizzleChannelConnectivity, MockChannelConnectivity } from './ChannelConnectivity'
export { ThreadStatusDeriver, type ThreadOperatingFacts, DrizzleThreadStatusDeriver, MockThreadStatusDeriver } from './ThreadStatusDeriver'
// The streamed-reply seam (streaming spec). Exported from the context's SERVICES surface because the
// agent's orchestrator turn is what feeds it — the one place holding the reply while it still grows —
// and `services` is the surface CROSS_CONTEXT_POLICY allows that declared edge to cross on.
export { ReplyStreamer, streamKey, EDIT_WINDOW_MS, type ReplyStreamHandle } from './ReplyStreamer'
// The IGNITION of the typing loop — same seam, same turn, same permitted surface as `ReplyStreamer`
// above. Everything it needs (the command class, the ceiling, the derived job id) is spread over this
// context's `usecases` and `utils`, and NEITHER may cross a boundary; exporting the one sentence that
// assembles them is what lets the orchestrator turn light the indicator without the agent context ever
// naming a thread use case.
export { beginTypingPresence } from './TypingPresence'
