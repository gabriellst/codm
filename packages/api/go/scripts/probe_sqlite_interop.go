//go:build ignore

// probe_sqlite_interop.go — the GO HALF of the cross-process SQLite interop probe.
//
// It is driven by scripts/probe-sqlite-interop.ts, which owns the output contract; this
// file only ever prints `KEY=value` lines on stdout for the TS side to forward verbatim.
// Run it directly:
//
//	go run scripts/probe_sqlite_interop.go interop     <dbPath>
//	go run scripts/probe_sqlite_interop.go concurrent  <dbPath> <n>
//	go run scripts/probe_sqlite_interop.go commit      <dbPath> <sentinel>
//
// `//go:build ignore` keeps it out of `go build ./...` / `go vet ./...` / the OpenAPI
// walker: it is a measurement tool, not part of the binary.
//
// THE ONE THING THAT MATTERS HERE: the DSN is copied VERBATIM from the real gateway
// (core/db/sqlite/store.go). A probe that opened the file with different pragmas would
// measure a configuration nobody ships, which is exactly how the previous round of
// interop numbers became worthless.
package main

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"

	_ "modernc.org/sqlite"
)

// gatewayDSN is core/db/sqlite/store.go's regime DSN, verbatim.
func gatewayDSN(dbPath string) string {
	return "file:" + dbPath + "?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_txlock=immediate"
}

func openGateway(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", gatewayDSN(dbPath))
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	return db, nil
}

func isBusy(err error) bool {
	if err == nil {
		return false
	}
	s := strings.ToUpper(err.Error())
	return strings.Contains(s, "SQLITE_BUSY") || strings.Contains(s, "DATABASE IS LOCKED")
}

func die(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}

func main() {
	if len(os.Args) < 3 {
		die("usage: probe_sqlite_interop.go <interop|concurrent|commit> <dbPath> [arg]")
	}
	mode, dbPath := os.Args[1], os.Args[2]

	switch mode {
	case "interop":
		interop(dbPath)
	case "concurrent":
		n := 300
		if len(os.Args) > 3 {
			parsed, err := strconv.Atoi(os.Args[3])
			if err != nil {
				die("bad n: %v", err)
			}
			n = parsed
		}
		concurrent(dbPath, n)
	case "commit":
		if len(os.Args) < 4 {
			die("commit needs a sentinel")
		}
		commitOne(dbPath, os.Args[3])
	default:
		die("unknown mode %q", mode)
	}
}

// interop: read the row the TS side wrote, then write our own. Proves the two engines
// (libsql fork vs modernc pure-Go) actually share ONE WAL file, in both directions.
func interop(dbPath string) {
	db, err := openGateway(dbPath)
	if err != nil {
		die("GO_OPEN_FAIL %v", err)
	}
	defer db.Close()

	var mode string
	if err := db.QueryRow("PRAGMA journal_mode").Scan(&mode); err != nil {
		die("GO_JOURNAL_FAIL %v", err)
	}
	fmt.Printf("GO_JOURNAL_MODE=%s\n", mode)

	var seen string
	if err := db.QueryRow(`SELECT note FROM probe_interop WHERE writer = 'ts'`).Scan(&seen); err != nil {
		fmt.Println("GO_READ_TS=fail")
		die("GO_READ_TS_ERR %v", err)
	}
	fmt.Printf("GO_READ_TS=ok\nGO_SAW_TS_NOTE=%s\n", seen)

	if _, err := db.Exec(`INSERT INTO probe_interop (writer, note) VALUES ('go', ?)`, "written-by-modernc"); err != nil {
		die("GO_WRITE_FAIL %v", err)
	}
	fmt.Println("GO_WRITE=ok")
}

// concurrent: n simultaneous write transactions against the same file, while the TS side
// is doing the same. _txlock=immediate means each BeginTx is a BEGIN IMMEDIATE, so this
// exercises exactly the contention the daemon will live with.
func concurrent(dbPath string, n int) {
	db, err := openGateway(dbPath)
	if err != nil {
		die("GO_OPEN_FAIL %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(8)

	var ok, failed, busy atomic.Int64
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			tx, err := db.BeginTx(context.Background(), nil)
			if err != nil {
				failed.Add(1)
				if isBusy(err) {
					busy.Add(1)
				}
				return
			}
			if _, err := tx.Exec(`INSERT INTO probe_go (i) VALUES (?)`, i); err != nil {
				_ = tx.Rollback()
				failed.Add(1)
				if isBusy(err) {
					busy.Add(1)
				}
				return
			}
			if err := tx.Commit(); err != nil {
				failed.Add(1)
				if isBusy(err) {
					busy.Add(1)
				}
				return
			}
			ok.Add(1)
		}(i)
	}
	wg.Wait()

	fmt.Printf("GO_OK=%d\nGO_ERR=%d\nGO_SQLITE_BUSY=%d\n", ok.Load(), failed.Load(), busy.Load())
}

// commitOne: commit a single sentinel row and exit. The TS side holds a LONG-LIVED read
// client open across this call — the point is whether that client sees the row afterwards
// without reopening, which is the property the whole phase depends on.
func commitOne(dbPath, sentinel string) {
	db, err := openGateway(dbPath)
	if err != nil {
		die("GO_OPEN_FAIL %v", err)
	}
	defer db.Close()

	if _, err := db.Exec(`INSERT INTO probe_visibility (writer, sentinel) VALUES ('go', ?)`, sentinel); err != nil {
		die("GO_COMMIT_FAIL %v", err)
	}
	fmt.Println("GO_COMMIT=ok")
}
