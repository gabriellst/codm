package enums

type Platform string

const (
	PlatformWhatsApp Platform = "WHATSAPP"
	PlatformInternal Platform = "INTERNAL"
)

func (p Platform) IsValid() bool {
	switch p {
	case PlatformWhatsApp, PlatformInternal:
		return true
	}
	return false
}
