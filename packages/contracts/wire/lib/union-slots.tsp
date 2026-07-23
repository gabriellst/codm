import "./union-slots.js";

// Union-slot decorators (union-slots spec, RATIFIED 2026-07-22).
//
// A union slot declares, ON THE CONTRACT, that an event field is a provider-varying
// discriminated union — WITHOUT modeling the variant shapes (spec §6 forbids shapes in
// TypeSpec). The contract records STRUCTURE (which field, discriminated by what), NAMES
// (the variant type names) and OWNERS (which workspace owns each shape). The shapes live
// in the owner service; codegen stamps `// @union` / `// @variant` annotations onto the
// generated Go binding and exports a TS union manifest so every emitting surface can
// materialize the complete oneOf.
//
// Usage (declaration order does not matter — a @variant is associated to the @unionSlot
// whose discriminator COUNT matches its leading value count; equal-arity slots on the
// same model are rejected at codegen):
//
//   @unionSlot("content", #["platform", "messageType"])
//   @variant("WHATSAPP", "TEXT", "WhatsAppTextContent", #{ owner: "apiGo" })
//   @unionSlot("platformData", #["platform"])
//   @variant("WHATSAPP", "WhatsAppMessageReceivedPlatformData", #{ owner: "apiGo" })
//   model ChannelMessageReceivedEvent extends IntegrationEvent { ... }
//
// `owner` MUST be a WORKSPACES id from template.config.ts — validated by the wire codegen
// against the manifest (unknown owner = contract compilation error).

extern dec unionSlot(
  target: TypeSpec.Reflection.Model,
  field: valueof string,
  discriminators: valueof string[]
);
extern dec variant(target: TypeSpec.Reflection.Model, ...args: valueof unknown[]);
