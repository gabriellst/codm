package main

import (
	"testing"

	"template/api-go/internal/channel"
	"template/core-go/registry"
)

// TestWiring is the rail (spec AC-5): fx.ValidateApp over the SAME
// composition main() boots — the `base` var above plus channel.Overlays —
// for every column (real, integration, e2e). A provider missing from any
// column breaks this test, not a 3am boot.
func TestWiring(t *testing.T) {
	registry.Validate(t, base, channel.Overlays)
}
