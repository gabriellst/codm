package triage

import (
	"bytes"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestReadMultipartMediaSavesFileAndMeta(t *testing.T) {
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	_ = mw.WriteField("meta", `{"chat_jid":"1@g.us","type":"voice","caption":"oi"}`)
	fw, _ := mw.CreateFormFile("file", "../../etc/reply.mp3")
	_, _ = fw.Write([]byte("ID3fake"))
	_ = mw.Close()
	r := httptest.NewRequest("POST", "/send/media", &body)
	r.Header.Set("Content-Type", mw.FormDataContentType())
	dir := t.TempDir()
	var req mediaRequest
	p, err := readMultipartMedia(httptest.NewRecorder(), r, dir, &req)
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Dir(p) != dir || filepath.Base(p) != "reply.mp3" {
		t.Fatalf("saved outside temp dir or unsanitized: %s", p)
	}
	if b, _ := os.ReadFile(p); string(b) != "ID3fake" || req.ChatJID != "1@g.us" || req.Type != "voice" {
		t.Fatalf("bad parse: %q %+v", b, req)
	}
}

func TestReadMultipartMediaRejectsUnknownMetaAndMissingFile(t *testing.T) {
	for _, meta := range []string{`{"chat_jid":"1@g.us","type":"voice","bogus":1}`, `{"chat_jid":"1@g.us","type":"voice"}`} {
		var body bytes.Buffer
		mw := multipart.NewWriter(&body)
		_ = mw.WriteField("meta", meta)
		_ = mw.Close()
		r := httptest.NewRequest("POST", "/send/media", &body)
		r.Header.Set("Content-Type", mw.FormDataContentType())
		var req mediaRequest
		if _, err := readMultipartMedia(httptest.NewRecorder(), r, t.TempDir(), &req); err == nil {
			t.Fatalf("expected error for %s", meta)
		}
	}
}
