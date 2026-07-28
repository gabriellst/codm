namespace TemplateContracts;

@doc("Kind of transcript entry in a thread conversation. CONTACT (inbound, a person in the conversation), SYSTEM (this product spoke on the channel), DIRECT (the owner spoke on the channel through the console while paused — same word as ThreadMode.DIRECT, one spelling for one idea), WHISPER (in-app steer, never sent to the channel), ACTION (audit line). NOTE the known residue: CONTACT/DIRECT name a DIRECTION while SYSTEM names an AUTHOR. The principled shape is {MESSAGE, WHISPER, ACTION} plus an author field on the entry, deferred because it costs a transcript column.")
enum TranscriptKind {
  CONTACT: "CONTACT",
  SYSTEM: "SYSTEM",
  DIRECT: "DIRECT",
  WHISPER: "WHISPER",
  ACTION: "ACTION",
}
