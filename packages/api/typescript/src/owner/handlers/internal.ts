// Internal (domain-event) handlers for the owner context.
// None in the base template — the thin Owner aggregate raises created/settings/
// disabled/enabled events with no in-context side effects. (The member-invite
// bridge handler is a Tier-3 exemplar: the multi-user tenant example under examples/.)
export {}
