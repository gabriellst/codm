module template/api-go

go 1.25.0

replace template/core-go => ./core

replace template/contracts-go => ../../contracts/generated/go

replace template/client-go => ../../client/dist/go

require (
	github.com/go-playground/validator/v10 v10.30.1
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.9.1
	github.com/redis/go-redis/v9 v9.7.3
	go.uber.org/fx v1.23.0
	template/client-go v0.0.0
	template/contracts-go v0.0.0
	template/core-go v0.0.0
)

require (
	github.com/apapsch/go-jsonmerge/v2 v2.0.0 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/dgryski/go-rendezvous v0.0.0-20200823014737-9f7001d12a5f // indirect
	github.com/gabriel-vasile/mimetype v1.4.12 // indirect
	github.com/go-playground/locales v0.14.1 // indirect
	github.com/go-playground/universal-translator v0.18.1 // indirect
	github.com/golang-migrate/migrate/v4 v4.19.1 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/joho/godotenv v1.5.1 // indirect
	github.com/leodido/go-urn v1.4.0 // indirect
	github.com/lib/pq v1.10.9 // indirect
	github.com/oapi-codegen/nullable v1.1.0 // indirect
	github.com/oapi-codegen/runtime v1.4.0 // indirect
	go.uber.org/dig v1.18.0 // indirect
	go.uber.org/multierr v1.11.0 // indirect
	go.uber.org/zap v1.27.1 // indirect
	golang.org/x/crypto v0.50.0 // indirect
	golang.org/x/mod v0.35.0 // indirect
	golang.org/x/sync v0.20.0 // indirect
	golang.org/x/sys v0.43.0 // indirect
	golang.org/x/text v0.36.0 // indirect
	golang.org/x/tools v0.44.0 // indirect
)
