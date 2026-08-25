// Package shared_test hosts core-go's own genericity rail (spec T11 AC-1):
// core must stay reusable by ANY Go service of any fork, so no file under
// this module may name a particular service's vocabulary — not even in a
// comment, which is where the drift this task fixed actually hid ("codm-gateway"
// and "whatsmeow" were living in docblocks, not just in literal env-var reads).
package shared_test

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// forbidden is deliberately narrow, so it only ever fires on genuine service
// vocabulary:
//   - `CHANNEL_` (upper-case, trailing underscore) can only be an env-var
//     name — it never collides with Go's OWN "channel"/"chan" concept
//     (ChannelMediator, "domain events via channels", etc.), which is always
//     lower/mixed-case with no trailing underscore. This is the exact false
//     positive the audit flagged and asked to be avoided by scoping, not by
//     renaming core's own ChannelMediator.
//   - `(?i:whatsmeow)` matches the word regardless of casing — it shows up as
//     Whatsmeow (Go identifiers), whatsmeow (comments/paths) and WHATSMEOW
//     (the old env key) in the wild, and none of those belong in core.
//   - `codm-gateway` is the literal default value this task moved out of core
//     (now declared on the channel service's own config.Service value).
var forbidden = regexp.MustCompile(`CHANNEL_|(?i:whatsmeow)|codm-gateway`)

// selfBasename is this file's own name: it necessarily NAMES every forbidden
// pattern above (in the regex literal and in this docblock), so it is the
// one declared, conscious exception — never a file that merely happens to
// avoid the walk.
const selfBasename = "vocabulary_test.go"

// TestCoreCarriesNoServiceVocabulary walks every .go file in this module
// (code and comments alike) and fails on the first forbidden token found.
//
// Falsifier (recorded in the T11 report): temporarily add a line containing
// "CHANNEL_FOO" to any core file (e.g. a comment in config.go) — this test
// goes RED, naming the file:line. Remove it — GREEN again.
func TestCoreCarriesNoServiceVocabulary(t *testing.T) {
	root := "." // core-go module root (packages/api/go/core, cwd at test time)

	err := filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() {
			return nil
		}
		if filepath.Ext(path) != ".go" {
			return nil
		}
		if filepath.Base(path) == selfBasename {
			return nil
		}

		raw, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}

		for i, line := range strings.Split(string(raw), "\n") {
			if match := forbidden.FindString(line); match != "" {
				t.Errorf(
					"%s:%d: forbidden service vocabulary %q — core-go must stay reusable by any Go service of any fork (spec T11 AC-1); this belongs in the SERVICE's own package (e.g. internal/channel), never in core",
					path, i+1, match,
				)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walking core-go for the vocabulary rail: %v", err)
	}
}
