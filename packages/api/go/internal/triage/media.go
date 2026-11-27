package triage

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"mime"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// Media preparation for POST /send/media: validate the source, normalise it
// with ffmpeg where WhatsApp needs a specific format, and compute metadata
// (duration, waveform, thumbnail). Everything here is local and unit-testable;
// the actual upload/send happens in MediaSender.

const (
	maxMediaBytes   = 64 << 20
	ffmpegTimeout   = 3 * time.Minute
	urlFetchTimeout = 90 * time.Second
)

// MediaKind is the wire value of the "type" field.
type MediaKind string

const (
	KindImage    MediaKind = "image"
	KindVideo    MediaKind = "video"
	KindAudio    MediaKind = "audio"
	KindVoice    MediaKind = "voice"
	KindDocument MediaKind = "document"
	KindSticker  MediaKind = "sticker"
)

func parseKind(s string) (MediaKind, bool) {
	switch k := MediaKind(strings.ToLower(strings.TrimSpace(s))); k {
	case KindImage, KindVideo, KindAudio, KindVoice, KindDocument, KindSticker:
		return k, true
	}
	return "", false
}

// mediaError carries the HTTP status the endpoint should answer with.
type mediaError struct {
	Status int
	Msg    string
}

func (e *mediaError) Error() string { return e.Msg }

func badMedia(format string, a ...any) error {
	return &mediaError{Status: http.StatusBadRequest, Msg: fmt.Sprintf(format, a...)}
}

// PreparedMedia is the ready-to-upload result.
type PreparedMedia struct {
	Kind      MediaKind
	Data      []byte
	Mimetype  string
	FileName  string
	Thumbnail []byte
	Width     uint32
	Height    uint32
	Seconds   uint32
	Waveform  []byte
	PTT       bool
	Animated  bool
}

type mediaPrep struct {
	root    string // allowed source root (default /workspace)
	dataDir string // gateway data dir; only <dataDir>/media is readable from it
	ffmpeg  string
	ffprobe string
	sem     chan struct{}
}

func newMediaPrep(cfg *Config) *mediaPrep {
	root := env("MEDIA_SEND_ROOT", "/workspace")
	if r, err := filepath.EvalSymlinks(root); err == nil {
		root = r
	}
	data := cfg.DataDir
	if abs, err := filepath.Abs(data); err == nil {
		data = abs
	}
	if r, err := filepath.EvalSymlinks(data); err == nil {
		data = r
	}
	ff, _ := exec.LookPath("ffmpeg")
	fp, _ := exec.LookPath("ffprobe")
	return &mediaPrep{root: root, dataDir: data, ffmpeg: ff, ffprobe: fp, sem: make(chan struct{}, 2)}
}

func (m *mediaPrep) hasFFmpeg() bool { return m.ffmpeg != "" && m.ffprobe != "" }

func within(base, p string) bool {
	rel, err := filepath.Rel(base, p)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// resolveLocalPath validates a caller-supplied absolute path: no traversal,
// must resolve (symlinks included) inside the media root, be a regular file
// within the size cap, and not be a secret (gateway data dir except media/,
// env files, databases, keys, .git, .ssh).
func (m *mediaPrep) resolveLocalPath(p string) (string, int64, error) {
	if !filepath.IsAbs(p) {
		return "", 0, badMedia("path must be absolute")
	}
	for _, seg := range strings.Split(filepath.ToSlash(p), "/") {
		if seg == ".." {
			return "", 0, badMedia("path must not contain '..'")
		}
	}
	resolved, err := filepath.EvalSymlinks(filepath.Clean(p))
	if err != nil {
		return "", 0, badMedia("cannot read path: file not found")
	}
	if !within(m.root, resolved) {
		return "", 0, &mediaError{Status: http.StatusForbidden, Msg: "path is outside " + m.root}
	}
	if within(m.dataDir, resolved) && !within(filepath.Join(m.dataDir, "media"), resolved) {
		return "", 0, &mediaError{Status: http.StatusForbidden, Msg: "path inside the gateway data dir is not allowed (only its media/ folder)"}
	}
	if deniedFile(resolved) {
		return "", 0, &mediaError{Status: http.StatusForbidden, Msg: "path looks like a secret/credential file and is not allowed"}
	}
	st, err := os.Stat(resolved)
	if err != nil {
		return "", 0, badMedia("cannot stat path")
	}
	if !st.Mode().IsRegular() {
		return "", 0, badMedia("path is not a regular file")
	}
	if st.Size() == 0 {
		return "", 0, badMedia("file is empty")
	}
	if st.Size() > maxMediaBytes {
		return "", 0, &mediaError{Status: http.StatusRequestEntityTooLarge, Msg: fmt.Sprintf("file too large: %d bytes (max %d)", st.Size(), maxMediaBytes)}
	}
	return resolved, st.Size(), nil
}

func deniedFile(resolved string) bool {
	for _, seg := range strings.Split(filepath.ToSlash(resolved), "/") {
		if seg == ".git" || seg == ".ssh" || seg == ".gnupg" || seg == ".aws" {
			return true
		}
	}
	b := strings.ToLower(filepath.Base(resolved))
	if b == "env" || b == ".env" || strings.HasPrefix(b, ".env.") || strings.HasSuffix(b, ".env") ||
		strings.HasPrefix(b, "id_rsa") || strings.HasPrefix(b, "id_ed25519") {
		return true
	}
	switch strings.ToLower(filepath.Ext(b)) {
	case ".db", ".sqlite", ".sqlite3", ".db-wal", ".db-shm", ".pem", ".key", ".p12", ".pfx":
		return true
	}
	return false
}

// safeDialControl rejects loopback/private/link-local targets (SSRF guard).
func safeDialControl(_, address string, _ syscall.RawConn) error {
	host, _, err := net.SplitHostPort(address)
	if err != nil {
		return err
	}
	ip := net.ParseIP(host)
	if ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsUnspecified() || ip.IsMulticast() {
		return errors.New("destination address is not allowed")
	}
	return nil
}

// fetchURL downloads an http(s) URL to a temp file inside dir.
func fetchURL(ctx context.Context, raw, dir string) (string, string, error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", "", badMedia("url must be http(s)")
	}
	client := &http.Client{
		Timeout: urlFetchTimeout,
		Transport: &http.Transport{
			DialContext:     (&net.Dialer{Timeout: 15 * time.Second, Control: safeDialControl}).DialContext,
			Proxy:           nil,
			TLSClientConfig: nil,
		},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return "", "", badMedia("bad url")
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", "", &mediaError{Status: http.StatusBadGateway, Msg: "url download failed: " + err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", &mediaError{Status: http.StatusBadGateway, Msg: fmt.Sprintf("url download returned HTTP %d", resp.StatusCode)}
	}
	if resp.ContentLength > maxMediaBytes {
		return "", "", &mediaError{Status: http.StatusRequestEntityTooLarge, Msg: "remote file too large"}
	}
	f, err := os.CreateTemp(dir, "dl-*")
	if err != nil {
		return "", "", err
	}
	n, err := io.Copy(f, io.LimitReader(resp.Body, maxMediaBytes+1))
	_ = f.Close()
	if err != nil {
		return "", "", &mediaError{Status: http.StatusBadGateway, Msg: "url download failed: " + err.Error()}
	}
	if n > maxMediaBytes {
		return "", "", &mediaError{Status: http.StatusRequestEntityTooLarge, Msg: "remote file too large"}
	}
	if n == 0 {
		return "", "", badMedia("remote file is empty")
	}
	return f.Name(), path.Base(u.Path), nil
}

func (m *mediaPrep) run(ctx context.Context, bin string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, ffmpegTimeout)
	defer cancel()
	var out, errb bytes.Buffer
	cmd := exec.CommandContext(ctx, bin, args...)
	cmd.Stdout, cmd.Stderr = &out, &errb
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(errb.String())
		if len(msg) > 400 {
			msg = msg[len(msg)-400:]
		}
		return nil, fmt.Errorf("%s failed: %v: %s", filepath.Base(bin), err, msg)
	}
	return out.Bytes(), nil
}

type probeInfo struct {
	Streams []struct {
		CodecType string `json:"codec_type"`
		CodecName string `json:"codec_name"`
		Width     int    `json:"width"`
		Height    int    `json:"height"`
	} `json:"streams"`
	Format struct {
		FormatName string `json:"format_name"`
		Duration   string `json:"duration"`
	} `json:"format"`
}

func (p probeInfo) codec(t string) string {
	for _, s := range p.Streams {
		if s.CodecType == t {
			return s.CodecName
		}
	}
	return ""
}

func (p probeInfo) dims() (int, int) {
	for _, s := range p.Streams {
		if s.CodecType == "video" && s.Width > 0 {
			return s.Width, s.Height
		}
	}
	return 0, 0
}

func (p probeInfo) seconds() uint32 {
	d, err := strconv.ParseFloat(p.Format.Duration, 64)
	if err != nil || d <= 0 {
		return 0
	}
	return uint32(math.Round(d))
}

func (m *mediaPrep) probe(ctx context.Context, file string) (probeInfo, error) {
	var pi probeInfo
	out, err := m.run(ctx, m.ffprobe, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", file)
	if err != nil {
		return pi, badMedia("unreadable or unsupported media file")
	}
	if err := json.Unmarshal(out, &pi); err != nil {
		return pi, badMedia("unreadable media file")
	}
	return pi, nil
}

// Prepare turns a request into upload-ready media. tmp is a scratch dir owned
// by the caller (removed after the send).
func (m *mediaPrep) Prepare(ctx context.Context, kind MediaKind, localPath, rawURL, filename, mimetype, tmp string) (*PreparedMedia, error) {
	if (localPath == "") == (rawURL == "") {
		return nil, badMedia("provide exactly one of path or url")
	}
	var src string
	name := filename
	if localPath != "" {
		resolved, _, err := m.resolveLocalPath(localPath)
		if err != nil {
			return nil, err
		}
		src = resolved
		if name == "" {
			name = filepath.Base(resolved)
		}
	} else {
		dl, base, err := fetchURL(ctx, rawURL, tmp)
		if err != nil {
			return nil, err
		}
		src = dl
		if name == "" && base != "" && base != "." && base != "/" {
			name = base
		}
	}
	return m.PrepareFile(ctx, kind, src, name, mimetype, tmp)
}

// PrepareFile converts an already-validated local file (a checked path, a URL
// download, or a multipart upload in a private temp dir).
func (m *mediaPrep) PrepareFile(ctx context.Context, kind MediaKind, src, name, mimetype, tmp string) (*PreparedMedia, error) {
	if kind != KindDocument && !m.hasFFmpeg() {
		return nil, &mediaError{Status: http.StatusServiceUnavailable, Msg: "ffmpeg/ffprobe not installed on the box"}
	}
	select {
	case m.sem <- struct{}{}:
		defer func() { <-m.sem }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	switch kind {
	case KindDocument:
		return m.prepDocument(src, name, mimetype)
	case KindImage:
		return m.prepImage(ctx, src, tmp)
	case KindSticker:
		return m.prepSticker(ctx, src, tmp)
	case KindVideo:
		return m.prepVideo(ctx, src, tmp)
	case KindVoice:
		return m.prepVoice(ctx, src, tmp, true)
	case KindAudio:
		return m.prepAudio(ctx, src, tmp, mimetype)
	}
	return nil, badMedia("unsupported type")
}

func readCapped(file string) ([]byte, error) {
	st, err := os.Stat(file)
	if err != nil {
		return nil, err
	}
	if st.Size() > maxMediaBytes {
		return nil, &mediaError{Status: http.StatusRequestEntityTooLarge, Msg: fmt.Sprintf("media too large after processing: %d bytes (max %d)", st.Size(), maxMediaBytes)}
	}
	return os.ReadFile(file)
}

func (m *mediaPrep) prepDocument(src, name, mimetype string) (*PreparedMedia, error) {
	data, err := readCapped(src)
	if err != nil {
		return nil, err
	}
	if name == "" {
		name = "file"
	}
	name = filepath.Base(name)
	if mimetype == "" {
		mimetype = mime.TypeByExtension(strings.ToLower(filepath.Ext(name)))
	}
	if mimetype == "" {
		mimetype = http.DetectContentType(data)
	}
	return &PreparedMedia{Kind: KindDocument, Data: data, Mimetype: mimetype, FileName: name}, nil
}

func sniff(file string) string {
	f, err := os.Open(file)
	if err != nil {
		return ""
	}
	defer f.Close()
	buf := make([]byte, 512)
	n, _ := f.Read(buf)
	return http.DetectContentType(buf[:n])
}

func (m *mediaPrep) jpegThumb(ctx context.Context, src, tmp string, seek string) []byte {
	out := filepath.Join(tmp, "thumb-"+strconv.FormatInt(time.Now().UnixNano(), 36)+".jpg")
	args := []string{"-y", "-v", "error"}
	if seek != "" {
		args = append(args, "-ss", seek)
	}
	args = append(args, "-i", src, "-frames:v", "1",
		"-vf", "scale=w=100:h=100:force_original_aspect_ratio=decrease", "-q:v", "6", out)
	if _, err := m.run(ctx, m.ffmpeg, args...); err != nil {
		return nil
	}
	b, err := os.ReadFile(out)
	if err != nil || len(b) == 0 || len(b) > 64<<10 {
		return nil
	}
	return b
}

func (m *mediaPrep) prepImage(ctx context.Context, src, tmp string) (*PreparedMedia, error) {
	pi, err := m.probe(ctx, src)
	if err != nil {
		return nil, err
	}
	w, h := pi.dims()
	if w == 0 {
		return nil, badMedia("file is not a valid image")
	}
	file, mt := src, sniff(src)
	if mt != "image/jpeg" && mt != "image/png" && mt != "image/webp" {
		file = filepath.Join(tmp, "img.jpg")
		if _, err := m.run(ctx, m.ffmpeg, "-y", "-v", "error", "-i", src, "-frames:v", "1",
			"-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-q:v", "2", file); err != nil {
			return nil, badMedia("could not convert image to jpeg")
		}
		mt = "image/jpeg"
	}
	data, err := readCapped(file)
	if err != nil {
		return nil, err
	}
	return &PreparedMedia{Kind: KindImage, Data: data, Mimetype: mt, Width: uint32(w), Height: uint32(h),
		Thumbnail: m.jpegThumb(ctx, file, tmp, "")}, nil
}

func (m *mediaPrep) prepSticker(ctx context.Context, src, tmp string) (*PreparedMedia, error) {
	pi, err := m.probe(ctx, src)
	if err != nil {
		return nil, err
	}
	if w, _ := pi.dims(); w == 0 {
		return nil, badMedia("file is not a valid image")
	}
	file := src
	if sniff(src) != "image/webp" {
		file = filepath.Join(tmp, "sticker.webp")
		if _, err := m.run(ctx, m.ffmpeg, "-y", "-v", "error", "-i", src, "-frames:v", "1",
			"-vf", "scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000,format=rgba",
			"-c:v", "libwebp", "-lossless", "0", "-q:v", "80", file); err != nil {
			return nil, badMedia("could not convert image to webp sticker")
		}
	}
	data, err := readCapped(file)
	if err != nil {
		return nil, err
	}
	animated := bytes.Contains(data[:min(len(data), 256)], []byte("ANIM"))
	return &PreparedMedia{Kind: KindSticker, Data: data, Mimetype: "image/webp", Width: 512, Height: 512, Animated: animated}, nil
}

func (m *mediaPrep) prepVideo(ctx context.Context, src, tmp string) (*PreparedMedia, error) {
	pi, err := m.probe(ctx, src)
	if err != nil {
		return nil, err
	}
	vc := pi.codec("video")
	if vc == "" {
		return nil, badMedia("file has no video stream")
	}
	file := src
	st, _ := os.Stat(src)
	isMP4 := strings.Contains(pi.Format.FormatName, "mp4")
	ac := pi.codec("audio")
	if !(isMP4 && vc == "h264" && (ac == "" || ac == "aac") && st != nil && st.Size() <= maxMediaBytes) {
		file = filepath.Join(tmp, "video.mp4")
		args := []string{"-y", "-v", "error", "-i", src, "-map", "0:v:0", "-map", "0:a:0?",
			"-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26",
			"-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", file}
		if _, err := m.run(ctx, m.ffmpeg, args...); err != nil {
			return nil, badMedia("could not convert video to mp4 (h264/aac)")
		}
		pi, err = m.probe(ctx, file)
		if err != nil {
			return nil, err
		}
	}
	w, h := pi.dims()
	secs := pi.seconds()
	seek := ""
	if secs >= 2 {
		seek = "0.5"
	}
	thumb := m.jpegThumb(ctx, file, tmp, seek)
	data, err := readCapped(file)
	if err != nil {
		return nil, err
	}
	return &PreparedMedia{Kind: KindVideo, Data: data, Mimetype: "video/mp4", Width: uint32(w), Height: uint32(h),
		Seconds: secs, Thumbnail: thumb}, nil
}

const opusMime = "audio/ogg; codecs=opus"

// prepVoice converts anything to OGG/Opus mono 48k and adds duration+waveform.
func (m *mediaPrep) prepVoice(ctx context.Context, src, tmp string, ptt bool) (*PreparedMedia, error) {
	pi, err := m.probe(ctx, src)
	if err != nil {
		return nil, err
	}
	if pi.codec("audio") == "" {
		return nil, badMedia("file has no audio stream")
	}
	out := filepath.Join(tmp, "voice.ogg")
	if _, err := m.run(ctx, m.ffmpeg, "-y", "-v", "error", "-i", src, "-vn", "-map", "0:a:0", "-ac", "1", "-ar", "48000",
		"-c:a", "libopus", "-b:a", "32k", "-application", "voip", "-f", "ogg", out); err != nil {
		return nil, badMedia("could not convert audio to ogg/opus")
	}
	op, err := m.probe(ctx, out)
	if err != nil {
		return nil, err
	}
	data, err := readCapped(out)
	if err != nil {
		return nil, err
	}
	pm := &PreparedMedia{Kind: KindVoice, Data: data, Mimetype: opusMime, Seconds: op.seconds(), PTT: ptt}
	if !ptt {
		pm.Kind = KindAudio
	} else {
		pm.Waveform = m.waveform(ctx, out)
	}
	if pm.Seconds == 0 {
		pm.Seconds = 1
	}
	return pm, nil
}

func (m *mediaPrep) prepAudio(ctx context.Context, src, tmp, mimetype string) (*PreparedMedia, error) {
	pi, err := m.probe(ctx, src)
	if err != nil {
		return nil, err
	}
	ac := pi.codec("audio")
	if ac == "" {
		return nil, badMedia("file has no audio stream")
	}
	var mt string
	f := pi.Format.FormatName
	switch {
	case ac == "mp3":
		mt = "audio/mpeg"
	case ac == "aac" && strings.Contains(f, "mp4"):
		mt = "audio/mp4"
	case ac == "opus" && strings.Contains(f, "ogg"):
		mt = opusMime
	}
	if mt == "" {
		return m.prepVoice(ctx, src, tmp, false)
	}
	data, err := readCapped(src)
	if err != nil {
		return nil, err
	}
	secs := pi.seconds()
	if secs == 0 {
		secs = 1
	}
	return &PreparedMedia{Kind: KindAudio, Data: data, Mimetype: mt, Seconds: secs}, nil
}

// waveform returns the 64-sample 0..100 envelope WhatsApp draws for voice notes.
func (m *mediaPrep) waveform(ctx context.Context, file string) []byte {
	raw, err := m.run(ctx, m.ffmpeg, "-v", "error", "-i", file, "-vn", "-ac", "1", "-ar", "8000", "-f", "s16le", "-")
	if err != nil {
		return nil
	}
	return waveformFromPCM(raw)
}

func waveformFromPCM(raw []byte) []byte {
	n := len(raw) / 2
	const buckets = 64
	if n == 0 {
		return nil
	}
	avg := make([]float64, buckets)
	var peak float64
	for b := 0; b < buckets; b++ {
		from, to := b*n/buckets, (b+1)*n/buckets
		if to <= from {
			to = from + 1
			if to > n {
				from, to = n-1, n
			}
		}
		var sum float64
		for i := from; i < to; i++ {
			v := float64(int16(uint16(raw[2*i]) | uint16(raw[2*i+1])<<8))
			sum += math.Abs(v)
		}
		avg[b] = sum / float64(to-from)
		peak = math.Max(peak, avg[b])
	}
	out := make([]byte, buckets)
	if peak == 0 {
		return out
	}
	for i, v := range avg {
		out[i] = byte(math.Round(v / peak * 100))
	}
	return out
}
