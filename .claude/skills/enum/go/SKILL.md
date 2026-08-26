---
name: enum-go
description: Create a domain enum (status, type, category) in Go. Use when defining closed sets of named constants like JobStatus, ChannelStatus, MessageType. Covers type string declaration, const block, doc-comment convention, and optional IsValid helper.
---

# Create Domain Enum — Go

## Why Enums Exist

Go has no native enum keyword. The idiomatic pattern is a named string type plus a block of typed constants. This gives compile-time type safety (you cannot pass a plain `string` where a `JobStatus` is expected), IDE autocomplete, and a single definition consumed by entities, repositories, controllers, and the database column type.

## When to Use This Skill

- Status fields that drive a state machine: `JobStatus`, `ChannelStatus`
- Type classifications: `MessageType`, `ReactionType`, `SubscriptionTier`
- Fixed categories: `Platform`, `Country`, `Currency`
- Any closed vocabulary where the allowed values must be enforced at the type level

## When NOT to Use This Skill

- Open-ended string fields with no fixed set of values
- Flags or bitmasks — Go iota + bit-shift is more idiomatic for those
- Values that come exclusively from the contracts package (import from `contracts/generated/go` instead of re-declaring)

## Process

### Step 1: Create the enum file

Create `internal/<ctx>/enums/<name>.go` (one enum per file, kebab-case filename):

```go
// Package enums defines closed vocabularies for the <ctx> bounded context.
package enums

// JobStatus represents the lifecycle state of a transcoding job.
// Values: PENDING RUNNING COMPLETED FAILED
type JobStatus string

const (
    JobStatusPending   JobStatus = "PENDING"
    JobStatusRunning   JobStatus = "RUNNING"
    JobStatusCompleted JobStatus = "COMPLETED"
    JobStatusFailed    JobStatus = "FAILED"
)
```

Key conventions:
- Type name is `PascalCase` matching the domain concept.
- Constant names: `<TypeName><VariantPascalCase>` (e.g., `JobStatusPending`).
- Wire values (the string literals): `SCREAMING_SNAKE_CASE`.
- Doc-comment `// Values: A B C` on the type declaration for tooling / OpenAPI.

### Step 2: Add an optional IsValid helper (when: controller or repository needs runtime validation)

```go
// IsValid reports whether s is a known JobStatus value.
func (s JobStatus) IsValid() bool {
    switch s {
    case JobStatusPending, JobStatusRunning, JobStatusCompleted, JobStatusFailed:
        return true
    }
    return false
}
```

Use `IsValid` in controllers/repositories when you receive an enum value from external input (JSON body, query param, DB column) and need to guard before constructing an entity.

### Step 3: Use in entities, repositories, and controllers

In entities — the enum type is used directly on struct fields:

```go
type TranscodingJob struct {
    entities.BaseEntity
    Status enums.JobStatus
    // ...
}
```

In constructors — pass the enum constant:

```go
job := &TranscodingJob{
    Status: enums.JobStatusPending,
}
```

In behavior methods — compare against constants:

```go
func (j *TranscodingJob) MarkRunning() error {
    if j.Status != enums.JobStatusPending {
        return errors.NewBaseError(ctxerrors.CodeJobNotPending, "job must be in PENDING status to start running")
    }
    j.Status = enums.JobStatusRunning
    _ = j.IncrementVersion()
    return nil
}
```

In Postgres via `sqlx` / `pgx` — the enum maps to a text column. Cast on scan:

```go
var rawStatus string
// ... scan rawStatus from row ...
job.Status = enums.JobStatus(rawStatus) // safe because DB constraint mirrors Go consts
```

## Critical Rules

### Wire values are SCREAMING_SNAKE_CASE [ENUM-GO-01]

The string literal stored in the DB and sent over the wire is always uppercase. The Go constant identifier mirrors the value in PascalCase prefix.

```go
// WRONG — lowercase wire value
const JobStatusPending JobStatus = "pending"

// CORRECT
const JobStatusPending JobStatus = "PENDING"
```

### One enum per file [ENUM-GO-02]

Each enum lives in its own file named after the concept in snake_case. Do not group unrelated enums into a single file.

```
// WRONG
enums/statuses.go   // contains JobStatus + ChannelStatus + MessageType

// CORRECT
enums/job_status.go
enums/channel_status.go
enums/message_type.go
```

### Values() helper — the exhaustiveness building block [ENUM-GO-05]

Every Go enum ships a `<Name>Values() []<Name>` function returning the canonical ordered
member list, and `Valid()` iterates it (one source of truth for the member set). Go has no
compiler exhaustiveness — `XValues()` is what makes enum-exhaustive-by-construction shapes
POSSIBLE (iterate it to build per-member responses/maps; never hand-enumerate members at
use sites). A new member added to Values() flows to every iterating call site automatically.

### Doc-comment Values line [ENUM-GO-03]

Add `// Values: A B C` as the first line of the type doc comment. This is consumed by the OpenAPI emitter and code-generation tools.

```go
// JobStatus represents the lifecycle state of a transcoding job.
// Values: PENDING RUNNING COMPLETED FAILED
type JobStatus string
```

### Never use untyped string for enum fields [ENUM-GO-04]

Struct fields that carry an enum value must use the named type, not `string`. This makes invalid-enum bugs compile errors instead of runtime surprises.

```go
// WRONG
type TranscodingJob struct {
    Status string
}

// CORRECT
type TranscodingJob struct {
    Status enums.JobStatus
}
```

### Status transitions go in entity methods, not in a transitions map [ENUM-GO-C01]

Unlike some TypeScript patterns, Go encodes valid transitions as explicit guard conditions inside behavior methods. A `map[JobStatus][]JobStatus` is verbose and adds indirection without benefit.

```go
// PREFERRED — guard condition in behavior method
func (j *TranscodingJob) MarkRunning() error {
    if j.Status != enums.JobStatusPending {
        return errors.NewBaseError(ctxerrors.CodeJobNotPending, "...")
    }
    j.Status = enums.JobStatusRunning
    _ = j.IncrementVersion()
    return nil
}
```

## Checklist

- [ ] File at `internal/<ctx>/enums/<snake_name>.go`
- [ ] Type declared as `type X string`
- [ ] Doc-comment `// Values: A B C` on type
- [ ] All wire values are `SCREAMING_SNAKE_CASE`
- [ ] Constant identifier pattern: `<TypeName><Variant>` (e.g., `JobStatusPending`)
- [ ] `IsValid()` method present when external input validation is needed
- [ ] Struct fields use the typed enum, not `string`

## Complete Example

```go
// internal/transcoding/enums/job_status.go
// Package enums defines closed vocabularies for the transcoding bounded context.
package enums

// JobStatus represents the lifecycle state of a transcoding job.
// Values: PENDING RUNNING COMPLETED FAILED
type JobStatus string

const (
    JobStatusPending   JobStatus = "PENDING"
    JobStatusRunning   JobStatus = "RUNNING"
    JobStatusCompleted JobStatus = "COMPLETED"
    JobStatusFailed    JobStatus = "FAILED"
)

// IsValid reports whether s is a known JobStatus value.
func (s JobStatus) IsValid() bool {
    switch s {
    case JobStatusPending, JobStatusRunning, JobStatusCompleted, JobStatusFailed:
        return true
    }
    return false
}
```

Usage in entity:

```go
// internal/transcoding/entities/transcoding_job.go
type TranscodingJob struct {
    entities.BaseEntity
    Status  enums.JobStatus
    VideoID string
    OwnerID string
}

func NewTranscodingJob(videoID, inputUrl, ownerID string) (*TranscodingJob, error) {
    // ...
    job := &TranscodingJob{
        BaseEntity: entities.NewBaseEntity(),
        VideoID:    videoID,
        Status:     enums.JobStatusPending, // always set via named constant
        OwnerID:    ownerID,
    }
    // ...
    return job, nil
}
```

## References

- `packages/api/go/internal/transcoding/enums/job_status.go` — canonical context enum
- `packages/api/go/core/enums/` — shared base enums (Country, Currency, Platform, Language)
- `dev:packages/channel/internal/channel/enums/channel_status.go` — multi-value status enum
- `dev:packages/channel/internal/channel/enums/message_type.go` — large enum with many variants
