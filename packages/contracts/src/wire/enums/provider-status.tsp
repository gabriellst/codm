namespace TemplateContracts;

@doc("Whether a provider CLI was found on the machine. Result of PATH + known-install-dir probing (BC3 detection Service).")
enum ProviderStatus {
  DETECTED: "DETECTED",
  NOT_INSTALLED: "NOT_INSTALLED",
}
