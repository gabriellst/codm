namespace TemplateContracts;

@doc("What an identified person asked for on the group's cloud panel (fase 2, item 6b). PAUSE / RESUME hold or release one issue; STEER sends that issue's session a short instruction; ANSWER_STOP answers the issue's open stop (only a member who may release). Requested in the cloud, executed by the daemon as that member on its next pull.")
enum PanelActionKind {
  PAUSE: "PAUSE",
  RESUME: "RESUME",
  STEER: "STEER",
  ANSWER_STOP: "ANSWER_STOP",
}
