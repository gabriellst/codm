package events

const EventNameQRCodeUpdated = "channel.gateway.qr_code_updated"

// WhatsAppQRCodeUpdated carries the QR code string for pairing display.
type WhatsAppQRCodeUpdated struct {
	Code string `json:"code" validate:"required"`
}
