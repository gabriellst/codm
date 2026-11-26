package triage

import "testing"

func TestSendAllowlistIsSendOnly(t *testing.T) {
	c := &Config{
		Allowlist:     parseAllowlist("558500000009-1500000000@g.us"),
		SendAllowlist: parseAllowlist("120363000000000011@g.us, *"),
	}
	if !c.SendAllowed("558500000009-1500000000@g.us") {
		t.Fatal("webhook allowlist chat must still be sendable")
	}
	if !c.SendAllowed("120363000000000011@g.us") {
		t.Fatal("send allowlist chat must be sendable")
	}
	if c.Allowed("120363000000000011@g.us") {
		t.Fatal("send allowlist must not affect webhook forwarding")
	}
	if c.SendAllowed("120363000000000012@g.us") {
		t.Fatal("unlisted chat must be rejected (and * in SEND_ALLOWLIST_JIDS ignored)")
	}
}
