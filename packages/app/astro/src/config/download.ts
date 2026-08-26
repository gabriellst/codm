// Fixed R2 alias for the macOS (Apple Silicon) DMG — the only build that ships
// today. .github/workflows/release-stable.yml keeps this alias pointed at the
// latest stable release, so the URL itself never needs to change here. Single
// source of truth for every download CTA (Home.astro → Hero/ClosingCta, Nav.astro).
// The SAVED filename is versioned anyway (`CoDM_<versão>_aarch64.dmg`): the alias
// object carries a Content-Disposition header set by the release workflow — do NOT
// add an `<a download>` attribute for this, browsers ignore it cross-origin.
export const DMG_DOWNLOAD_URL = 'https://pub-ae0c8cac60c94920b35464575c09e67d.r2.dev/stable/codm-aarch64.dmg'
