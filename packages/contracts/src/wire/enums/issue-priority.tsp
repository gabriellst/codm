namespace TemplateContracts;

@doc("The priority a task was declared with when it was born (fase 4, item 4) — one of the keys the queue claims by. HIGH: ahead of normal work. NORMAL: the default. LOW: behind normal work.")
enum IssuePriority {
  HIGH: "HIGH",
  NORMAL: "NORMAL",
  LOW: "LOW",
}
