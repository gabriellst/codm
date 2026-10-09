namespace TemplateContracts;

@doc("Under which permission regime an agent turn runs. AUTO = the provider CLI's own graduated mode (its classifier may block an action); BYPASS = no permission filter. Decided by WHO triggered the turn (Participant.canElevate), never by the model; each runner maps it to its own argv through a declared table.")
enum PermissionPosture {
  AUTO: "AUTO",
  BYPASS: "BYPASS",
}
