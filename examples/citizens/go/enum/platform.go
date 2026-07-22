// CONTEXT-ORIGIN: medscall/software/monorepo/packages/channel@ff66dbb1ee0fcd6212e5bf68879fa1d5a0a9cd1b (2026-07-20)
// Source path: packages/channel/internal/shared/enums/platform.go
// Harvested verbatim for the enum skill exemplar set — do not edit; re-harvest instead.
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
