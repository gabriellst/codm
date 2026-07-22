package remote

import (
	"database/sql"
	"fmt"
	"net/url"
	"os"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// TestMain sweeps stale test_remote_* schemas left by crashed or interrupted
// prior runs before executing the suite, then sweeps again on exit.
func TestMain(m *testing.M) {
	sweepTestSchemas("test_remote_")
	code := m.Run()
	sweepTestSchemas("test_remote_")
	os.Exit(code)
}

func sweepTestSchemas(prefix string) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		return
	}
	u, err := url.Parse(dbURL)
	if err != nil {
		return
	}
	db, err := sql.Open("pgx", u.String())
	if err != nil {
		return
	}
	defer db.Close()

	rows, err := db.Query(
		`SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE $1`,
		prefix+"%",
	)
	if err != nil {
		return
	}
	defer rows.Close()

	var schemas []string
	for rows.Next() {
		var name string
		if rows.Scan(&name) == nil {
			schemas = append(schemas, name)
		}
	}
	for _, s := range schemas {
		_, _ = db.Exec(fmt.Sprintf("DROP SCHEMA IF EXISTS %s CASCADE", s))
	}
}
