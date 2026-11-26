package triage

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func testPrep(t *testing.T) (*mediaPrep, string) {
	t.Helper()
	root := t.TempDir()
	data := filepath.Join(root, "data")
	if err := os.MkdirAll(filepath.Join(data, "media"), 0o755); err != nil {
		t.Fatal(err)
	}
	r, _ := filepath.EvalSymlinks(root)
	d, _ := filepath.EvalSymlinks(data)
	ff, _ := exec.LookPath("ffmpeg")
	fp, _ := exec.LookPath("ffprobe")
	return &mediaPrep{root: r, dataDir: d, ffmpeg: ff, ffprobe: fp, sem: make(chan struct{}, 2)}, r
}

func TestResolveLocalPathRestrictions(t *testing.T) {
	m, root := testPrep(t)
	ok := filepath.Join(root, "a.txt")
	os.WriteFile(ok, []byte("hi"), 0o644)
	os.WriteFile(filepath.Join(m.dataDir, "env"), []byte("SECRET=1"), 0o600)
	os.WriteFile(filepath.Join(m.dataDir, "codm.db"), []byte("x"), 0o600)
	os.WriteFile(filepath.Join(m.dataDir, "media", "in.jpg"), []byte("x"), 0o644)
	os.WriteFile(filepath.Join(root, ".env"), []byte("x"), 0o600)
	outside := t.TempDir()
	os.WriteFile(filepath.Join(outside, "o.txt"), []byte("x"), 0o644)
	os.Symlink(filepath.Join(outside, "o.txt"), filepath.Join(root, "link.txt"))
	os.Symlink(m.dataDir, filepath.Join(root, "datalink"))

	cases := []struct {
		name, path string
		status     int // 0 = ok
	}{
		{"ok", ok, 0},
		{"media dir ok", filepath.Join(m.dataDir, "media", "in.jpg"), 0},
		{"relative", "a.txt", 400},
		{"dotdot", root + "/x/../a.txt", 400},
		{"outside root", "/etc/passwd", 403},
		{"symlink escape", filepath.Join(root, "link.txt"), 403},
		{"data env", filepath.Join(m.dataDir, "env"), 403},
		{"data env via symlink", filepath.Join(root, "datalink", "env"), 403},
		{"data db", filepath.Join(m.dataDir, "codm.db"), 403},
		{"dotenv", filepath.Join(root, ".env"), 403},
		{"missing", filepath.Join(root, "nope"), 400},
		{"directory", root, 400},
	}
	for _, c := range cases {
		_, _, err := m.resolveLocalPath(c.path)
		if c.status == 0 {
			if err != nil {
				t.Errorf("%s: unexpected error %v", c.name, err)
			}
			continue
		}
		me, isME := err.(*mediaError)
		if !isME || me.Status != c.status {
			t.Errorf("%s: want status %d, got %v", c.name, c.status, err)
		}
	}
}

func TestSafeDialControl(t *testing.T) {
	for _, a := range []string{"127.0.0.1:80", "10.0.0.5:80", "192.168.1.1:443", "169.254.169.254:80", "[::1]:80"} {
		if safeDialControl("tcp", a, nil) == nil {
			t.Errorf("%s should be blocked", a)
		}
	}
	if err := safeDialControl("tcp", "8.8.8.8:443", nil); err != nil {
		t.Errorf("public ip blocked: %v", err)
	}
}

func TestWaveformFromPCM(t *testing.T) {
	raw := make([]byte, 0, 2*6400)
	for i := 0; i < 6400; i++ {
		v := int16(0)
		if i >= 3200 {
			v = 8000
		}
		raw = append(raw, byte(uint16(v)), byte(uint16(v)>>8))
	}
	w := waveformFromPCM(raw)
	if len(w) != 64 || w[0] != 0 || w[63] != 100 {
		t.Fatalf("unexpected waveform %v", w)
	}
	if waveformFromPCM(nil) != nil {
		t.Fatal("empty pcm must give nil")
	}
}

func need(t *testing.T) {
	t.Helper()
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		t.Skip("ffmpeg not installed")
	}
}

func gen(t *testing.T, dir, name string, args ...string) string {
	t.Helper()
	out := filepath.Join(dir, name)
	full := append([]string{"-y", "-v", "error"}, args...)
	full = append(full, out)
	if b, err := exec.Command("ffmpeg", full...).CombinedOutput(); err != nil {
		t.Fatalf("ffmpeg gen: %v %s", err, b)
	}
	return out
}

func TestPrepareVoiceImageVideoDocSticker(t *testing.T) {
	need(t)
	m, root := testPrep(t)
	tmp := t.TempDir()
	ctx := context.Background()

	wav := gen(t, root, "tone.wav", "-f", "lavfi", "-i", "sine=frequency=440:duration=2")
	v, err := m.Prepare(ctx, KindVoice, wav, "", "", "", tmp)
	if err != nil {
		t.Fatal(err)
	}
	if !v.PTT || v.Mimetype != opusMime || v.Seconds != 2 || len(v.Waveform) != 64 || !bytes.HasPrefix(v.Data, []byte("OggS")) {
		t.Fatalf("bad voice: ptt=%v mime=%q secs=%d wf=%d", v.PTT, v.Mimetype, v.Seconds, len(v.Waveform))
	}
	a, err := m.Prepare(ctx, KindAudio, wav, "", "", "", tmp) // wav → converted, not PTT
	if err != nil || a.PTT || a.Kind != KindAudio || a.Mimetype != opusMime {
		t.Fatalf("bad audio: %+v %v", a, err)
	}
	mp3 := gen(t, root, "tone.mp3", "-f", "lavfi", "-i", "sine=frequency=330:duration=1", "-c:a", "libmp3lame")
	a, err = m.Prepare(ctx, KindAudio, mp3, "", "", "", tmp)
	if err != nil || a.Mimetype != "audio/mpeg" {
		t.Fatalf("mp3 passthrough: %+v %v", a, err)
	}

	bmp := gen(t, root, "img.bmp", "-f", "lavfi", "-i", "color=c=red:s=64x48", "-frames:v", "1")
	im, err := m.Prepare(ctx, KindImage, bmp, "", "", "", tmp)
	if err != nil || im.Mimetype != "image/jpeg" || im.Width != 64 || im.Height != 48 || len(im.Thumbnail) == 0 {
		t.Fatalf("bad image: %+v %v", im, err)
	}
	png := gen(t, root, "img.png", "-f", "lavfi", "-i", "color=c=blue:s=32x32", "-frames:v", "1")
	im, err = m.Prepare(ctx, KindImage, png, "", "", "", tmp)
	if err != nil || im.Mimetype != "image/png" {
		t.Fatalf("png passthrough: %+v %v", im, err)
	}
	st, err := m.Prepare(ctx, KindSticker, png, "", "", "", tmp)
	if err != nil || st.Mimetype != "image/webp" || !bytes.HasPrefix(st.Data, []byte("RIFF")) {
		t.Fatalf("bad sticker: %v", err)
	}

	mkv := gen(t, root, "clip.mkv", "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=2",
		"-f", "lavfi", "-i", "sine=duration=2", "-c:v", "libx264", "-c:a", "libopus", "-shortest")
	vd, err := m.Prepare(ctx, KindVideo, mkv, "", "", "", tmp)
	if err != nil || vd.Mimetype != "video/mp4" || vd.Seconds < 1 || len(vd.Thumbnail) == 0 || vd.Width != 160 {
		t.Fatalf("bad video: %+v %v", vd, err)
	}

	txt := filepath.Join(root, "report.csv")
	os.WriteFile(txt, []byte("a,b\n1,2\n"), 0o644)
	d, err := m.Prepare(ctx, KindDocument, txt, "", "", "", tmp)
	if err != nil || d.FileName != "report.csv" || !strings.HasPrefix(d.Mimetype, "text/csv") {
		t.Fatalf("bad doc: %+v %v", d, err)
	}
	d, err = m.Prepare(ctx, KindDocument, txt, "", "x.bin", "application/x-test", tmp)
	if err != nil || d.FileName != "x.bin" || d.Mimetype != "application/x-test" {
		t.Fatalf("doc overrides: %+v %v", d, err)
	}

	if _, err := m.Prepare(ctx, KindImage, txt, "", "", "", tmp); err == nil {
		t.Fatal("text file must not pass as image")
	}
	if _, err := m.Prepare(ctx, KindVoice, png, "", "", "", tmp); err == nil {
		t.Fatal("image must not pass as voice")
	}
}

func TestPrepareExactlyOneSource(t *testing.T) {
	m, _ := testPrep(t)
	if _, err := m.Prepare(context.Background(), KindDocument, "", "", "", "", t.TempDir()); err == nil {
		t.Fatal("expected error")
	}
	if _, err := m.Prepare(context.Background(), KindDocument, "/x", "http://x", "", "", t.TempDir()); err == nil {
		t.Fatal("expected error")
	}
}

func TestMediaEndpointValidation(t *testing.T) {
	cfg := &Config{APIKey: "k", Allowlist: map[string]bool{"1@g.us": true}, SendAllowlist: map[string]bool{}}
	e := &MediaEndpoint{cfg: cfg, prep: newMediaPrep(cfg)}
	do := func(method, auth, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/send/media", strings.NewReader(body))
		if auth != "" {
			r.Header.Set("Authorization", auth)
		}
		w := httptest.NewRecorder()
		e.ServeSend(w, r)
		return w
	}
	cases := []struct {
		name         string
		method, auth string
		body         string
		want         int
	}{
		{"get", "GET", "", "", http.StatusMethodNotAllowed},
		{"no auth", "POST", "", `{}`, http.StatusUnauthorized},
		{"bad auth", "POST", "Bearer nope", `{}`, http.StatusUnauthorized},
		{"bad json", "POST", "Bearer k", `{`, http.StatusBadRequest},
		{"unknown field", "POST", "Bearer k", `{"chat_jid":"1@g.us","type":"image","path":"/workspace/a","x":1}`, http.StatusBadRequest},
		{"bad type", "POST", "Bearer k", `{"chat_jid":"1@g.us","type":"gif","path":"/workspace/a"}`, http.StatusBadRequest},
		{"both sources", "POST", "Bearer k", `{"chat_jid":"1@g.us","type":"image","path":"/workspace/a","url":"http://x"}`, http.StatusBadRequest},
		{"no source", "POST", "Bearer k", `{"chat_jid":"1@g.us","type":"image"}`, http.StatusBadRequest},
		{"not allowlisted", "POST", "Bearer k", `{"chat_jid":"2@g.us","type":"image","path":"/workspace/a"}`, http.StatusForbidden},
	}
	for _, c := range cases {
		if got := do(c.method, c.auth, c.body).Code; got != c.want {
			t.Errorf("%s: want %d got %d", c.name, c.want, got)
		}
	}
	// disabled when no key configured
	e2 := &MediaEndpoint{cfg: &Config{}}
	w := httptest.NewRecorder()
	e2.ServeSend(w, httptest.NewRequest("POST", "/send/media", strings.NewReader(`{}`)))
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("no key: got %d", w.Code)
	}
}

func TestParseReceived(t *testing.T) {
	dir := t.TempDir()
	f := filepath.Join(dir, "a.ogg")
	os.WriteFile(f, []byte("x"), 0o644)
	e := &MediaEndpoint{mediaDr: dir}
	content := `{"audioMessage":{"mediaPath":"` + f + `","mimetype":"audio/ogg; codecs=opus","ptt":true,"seconds":3}}`
	m, ok := e.parseReceived("ID", "1@g.us", "2@s.whatsapp.net", "AUDIO", content, 1795704206000)
	if !ok || !m.PTT || m.Seconds != 3 || m.Timestamp != 1795704206 || m.Type != "audio" {
		t.Fatalf("bad parse %+v %v", m, ok)
	}
	bad := `{"audioMessage":{"mediaPath":"/etc/passwd"}}`
	if _, ok := e.parseReceived("ID", "r", "s", "AUDIO", bad, 0); ok {
		t.Fatal("path outside media dir must be rejected")
	}
}
