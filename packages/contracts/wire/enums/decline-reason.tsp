namespace TemplateContracts;

@doc("Structured card-decline classification — the localizable subset of why a charge failed. Providers map their own signals onto it; the raw gateway string still travels separately for diagnostics. An unclassifiable decline simply carries no code.")
enum DeclineReason {
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  CARD_EXPIRED: "CARD_EXPIRED",
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  PROCESSING_ERROR: "PROCESSING_ERROR",
  CARD_DECLINED: "CARD_DECLINED",
}
