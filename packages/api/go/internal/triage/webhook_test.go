package triage

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestSignShapes(t *testing.T) {
	secret, body, ts := "s3cret", []byte(`{"ok":true}`), "1700000000"
	gotCodm := Sign(secret, ts, body)
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(ts + "."))
	m.Write(body)
	if want := hex.EncodeToString(m.Sum(nil)); gotCodm != want {
		t.Fatalf("Sign: got %s want %s", gotCodm, want)
	}
	gotHub := SignBody(secret, body)
	m = hmac.New(sha256.New, []byte(secret))
	m.Write(body)
	if want := hex.EncodeToString(m.Sum(nil)); gotHub != want {
		t.Fatalf("SignBody: got %s want %s", gotHub, want)
	}
	if gotCodm == gotHub {
		t.Fatal("Codm and Hub signatures must differ (timestamp prefix vs raw body)")
	}
}
