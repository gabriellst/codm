package whatsapp

// WhatsAppCredentials holds WhatsApp-specific credentials stored in Integration.Credentials.
type WhatsAppCredentials struct {
	PhoneNumber string `json:"phoneNumber,omitempty"`
	OwnerJID    string `json:"ownerJid,omitempty"`
	// DeviceJID is the full AD-JID (with device suffix, e.g. "5584....:96@s.whatsapp.net")
	// required by whatsmeow's GetDevice for exact device lookup on reconnection.
	DeviceJID string `json:"deviceJid,omitempty"`
}
