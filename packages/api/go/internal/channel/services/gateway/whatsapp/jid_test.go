package whatsapp

import "testing"

func TestStripDeviceSuffix(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"5511900000010:96@s.whatsapp.net", "5511900000010@s.whatsapp.net"},
		{"5511900000010:30@s.whatsapp.net", "5511900000010@s.whatsapp.net"},
		{"5511900000010@s.whatsapp.net", "5511900000010@s.whatsapp.net"},
		{"5511900000010:96", "5511900000010"},
		{"5511900000010", "5511900000010"},
		{"120363145252584936@g.us", "120363145252584936@g.us"},
		{"", ""},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := StripDeviceSuffix(tt.input)
			if got != tt.expected {
				t.Errorf("StripDeviceSuffix(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestNormalizeJID(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"5511900000010", "5511900000010@s.whatsapp.net"},
		{"5511900000010:96", "5511900000010@s.whatsapp.net"},
		{"5511900000010@s.whatsapp.net", "5511900000010@s.whatsapp.net"},
		{"5511900000010:96@s.whatsapp.net", "5511900000010@s.whatsapp.net"},
		{"120363145252584936@g.us", "120363145252584936@g.us"},
	}
	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := NormalizeJID(tt.input)
			if got != tt.expected {
				t.Errorf("NormalizeJID(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}

func TestStripJIDServer(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{"direct JID", "5511999999999@s.whatsapp.net", "5511999999999"},
		{"group JID", "123456789-1234567890@g.us", "123456789-1234567890"},
		{"already stripped", "5511999999999", "5511999999999"},
		{"empty string", "", ""},
		{"with device suffix", "5511999999999:96@s.whatsapp.net", "5511999999999:96"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := StripJIDServer(tt.input)
			if got != tt.expected {
				t.Errorf("StripJIDServer(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}
