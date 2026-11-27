# syntax=docker/dockerfile:1
# (No RUN --mount=type=cache: Railway requires service-specific cache ids.)
# =============================================================================
# whatsapp-triage — the standalone WhatsApp bridge (whatsmeow + SQLite).
# Build from the REPO ROOT:
#   docker build -f docker/whatsapp-triage/Dockerfile -t whatsapp-triage .
# Railway: set RAILWAY_DOCKERFILE_PATH=docker/whatsapp-triage/Dockerfile.
#
# The binary is fully static (modernc.org/sqlite is pure Go → CGO_ENABLED=0).
# The runtime base is alpine rather than scratch/distroless ONLY because
# POST /send/media shells out to ffmpeg/ffprobe for image/video/voice sends,
# and the entrypoint guard needs sh + sha256sum + curl.
# =============================================================================

FROM golang:1.26-alpine AS build
WORKDIR /src
ENV CGO_ENABLED=0 GOOS=linux GOFLAGS=-trimpath
# go.mod replaces: template/core-go => ./core, template/contracts-go => ../../contracts/generated/go
COPY packages/contracts/generated/go ./packages/contracts/generated/go
COPY packages/api/go/go.mod packages/api/go/go.sum ./packages/api/go/
COPY packages/api/go/core/go.mod packages/api/go/core/go.sum ./packages/api/go/core/
WORKDIR /src/packages/api/go
RUN go mod download
COPY packages/api/go ./
RUN go build -ldflags="-s -w" -o /out/whatsapp-triage ./cmd/whatsapp-triage

FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata ffmpeg curl
COPY --from=build /out/whatsapp-triage /usr/local/bin/whatsapp-triage
COPY docker/whatsapp-triage/entrypoint.sh /usr/local/bin/entrypoint.sh
ENV CODM_DATA_DIR=/data BIND_HOST=0.0.0.0 AUTO_PAIR=false TZ=America/Fortaleza
# Runs as root: Railway volumes mount root-owned. Data dir is chmod 700 by the guard.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
