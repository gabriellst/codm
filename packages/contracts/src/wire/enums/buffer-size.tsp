namespace TemplateContracts;

@doc("Rolling per-thread context buffer size, in messages. A closed set of tiers {25,50,100,200}. Modeled as a STRING enum (the wire codegen carries string enums; numeric-literal unions are not first-class) — the domain narrows it to the numeric tiers and the DB stores it as text via the shared text-column convention.")
enum BufferSize {
  Size25: "25",
  Size50: "50",
  Size100: "100",
  Size200: "200",
}
