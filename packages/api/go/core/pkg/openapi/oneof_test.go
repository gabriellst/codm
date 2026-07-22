package openapi

import "testing"

func TestParseOneofAnnotation(t *testing.T) {
	cases := []struct {
		name string
		text string
		want []string
	}{
		{"basic", "Platform is a union.\n@oneof values=SalesPlatform,CheckoutPlatform,MarketingPlatform\n", []string{"SalesPlatform", "CheckoutPlatform", "MarketingPlatform"}},
		{"none", "Just a normal doc comment.\n", nil},
		{"single", "@oneof values=SalesPlatform\n", []string{"SalesPlatform"}},
		{"tolerates spaces after commas", "@oneof values=SalesPlatform, CheckoutPlatform\n", []string{"SalesPlatform", "CheckoutPlatform"}},
		{"bare form no longer matches", "@oneof SalesPlatform CheckoutPlatform\n", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := parseOneofAnnotation(tc.text)
			if len(got) != len(tc.want) {
				t.Fatalf("parseOneofAnnotation(%q) = %v, want %v", tc.text, got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Fatalf("member %d = %q, want %q", i, got[i], tc.want[i])
				}
			}
		})
	}
}

func TestRegisterOneofUnionsEmitsOneofComponent(t *testing.T) {
	spec := newSpec()
	// Pre-register the member enums (registerEnums runs before registerOneofUnions in Generate).
	spec.putSchema("SalesPlatform", map[string]any{"type": "string", "enum": []any{"EXAMPLE"}})
	spec.putSchema("MarketingPlatform", map[string]any{"type": "string", "enum": []any{"META"}})

	emitOneofComponent(spec, "Platform", []string{"SalesPlatform", "MarketingPlatform"})

	got, ok := spec.schemas()["Platform"].(map[string]any)
	if !ok {
		t.Fatal("Platform component not registered")
	}
	variants, ok := got["oneOf"].([]map[string]any)
	if !ok || len(variants) != 2 {
		t.Fatalf("Platform.oneOf = %v, want 2 $ref variants", got["oneOf"])
	}
	if variants[0]["$ref"] != "#/components/schemas/SalesPlatform" {
		t.Fatalf("variant[0] = %v", variants[0])
	}
}
