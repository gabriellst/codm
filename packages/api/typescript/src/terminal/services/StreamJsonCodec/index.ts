// The transport codec (GOAL-agent-abstraction §4.3, Fase 2).
//
// Everything in this folder is PURE — no spawn, no `fs`, no clock, no timers. AC-2.5 greps for
// exactly that, and the purity is not stylistic: it is what lets the fold rules of §4.3 be asserted
// over canned frame sequences instead of over a live CLI. The process lives one folder over, in
// `AgentRunner/StreamJsonAgentRunner/`.
export { LineBuffer } from './LineBuffer'
export { FrameDecoder, type DecodedLine, type TerminalResultRecord } from './FrameDecoder'
export { StreamJsonCodec, type StreamJsonCodecOptions } from './StreamJsonCodec'
export { StreamJsonToTurnFactAccumulator, type TurnFactAccumulatorOptions } from './StreamJsonToTurnFactAccumulator'
