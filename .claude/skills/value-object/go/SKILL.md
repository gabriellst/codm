---
name: value-object-go
description: Create an immutable value object in Go. Use when modeling concepts without identity like Email, CPF, JobOutputUrl, or Address. Covers private-field structs, New<Name> constructor returning error, Value()/String() accessors, Equals(), IsZero(), and composite VOs using struct tags with go-playground/validator.
---

# Create Value Object — Go

## Why Value Objects Exist

Value objects model domain concepts that are defined entirely by their value, not by an identity. An `Email` is the same `Email` regardless of when it was created. This means:
- They are immutable after construction — no setters.
- Two VOs are equal if their fields are equal.
- They validate themselves at construction — an invalid `CPF` never exists.

## When to Use This Skill

- Wrapping a primitive with domain validation: `Email`, `CPF`, `CNPJ`, `Phone`
- Representing a composite concept: `Address` (street + city + zip + country), `Money` (amount + currency)
- Encapsulating an opaque identifier with format rules: `JobOutputUrl`, `HashedID`

## When NOT to Use This Skill

- Simple strings with no validation or domain behavior — use plain `string` fields
- Values that need identity across time — use an entity instead
- Large data bags with no invariants — use a plain struct without the VO pattern

## Value Object Types

| Type | Pattern | Use case |
|------|---------|---------|
| **Primitive** | struct with one private `value` field | Email, CPF, ID, JobOutputUrl |
| **Composite** | struct with multiple private fields + struct tags | Address, Money, Phone |

## Process

### Step 1: Declare the struct with private fields

All fields are private. Callers only access values through exported accessor methods.

```go
// internal/transcoding/objects/job_output_url.go
package objects

// JobOutputUrl is an immutable value object representing a validated output URL.
type JobOutputUrl struct {
    value string
}
```

### Step 2: Write the constructor — New<Name> returns (VO, error)

The constructor validates and normalizes the input. It never panics.

**Primitive VO:**

```go
import (
    "net/url"
    "strings"

    ctxerrors "template/api-go/internal/transcoding/errors"
    "template/core-go/errors"
)

func NewJobOutputUrl(raw string) (JobOutputUrl, error) {
    trimmed := strings.TrimSpace(raw)
    if trimmed == "" {
        return JobOutputUrl{}, errors.NewBaseError(ctxerrors.CodeInvalidJobOutputUrl, "job output URL must not be empty")
    }
    u, err := url.Parse(trimmed)
    if err != nil || u.Scheme == "" || u.Host == "" {
        return JobOutputUrl{}, errors.NewBaseError(ctxerrors.CodeInvalidJobOutputUrl, "job output URL must be a valid absolute URL: "+raw)
    }
    return JobOutputUrl{value: trimmed}, nil
}
```

**Composite VO — using go-playground/validator struct tags:**

```go
import (
    "template/core-go/errors"
    "template/core-go/pkg/validation"
    "template/core-go/enums"
)

type Address struct {
    street       string        `validate:"required"`
    number       string        `validate:"required"`
    complement   string
    neighborhood string        `validate:"required"`
    city         string        `validate:"required"`
    state        string        `validate:"required,len=2"`
    zipCode      string
    country      enums.Country `validate:"omitempty,oneof=BR US"`
}

type NewAddressParams struct {
    Street, Number, Complement, Neighborhood, City, State, ZipCode string
    Country enums.Country
}

func NewAddress(data NewAddressParams) (Address, error) {
    a := Address{
        street:       data.Street,
        number:       data.Number,
        complement:   data.Complement,
        neighborhood: data.Neighborhood,
        city:         data.City,
        state:        data.State,
        zipCode:      data.ZipCode,
        country:      data.Country,
    }
    if err := validation.ValidateWithCode(&a, errors.CodeInvalidAddress); err != nil {
        return Address{}, err
    }
    return a, nil
}
```

### Step 3: Accessors, String(), Equals(), IsZero()

Every VO exposes:
- `Value()` — returns the underlying primitive or canonical string form.
- `String() string` — human-readable representation.
- `Equals(other T) bool` — value equality.
- `IsZero() bool` — true when the VO is the zero value (empty/unset).

```go
func (j JobOutputUrl) Value() string             { return j.value }
func (j JobOutputUrl) String() string            { return j.value }
func (j JobOutputUrl) Equals(o JobOutputUrl) bool { return j.value == o.value }
func (j JobOutputUrl) IsZero() bool              { return j.value == "" }
```

For composite VOs, each field has its own getter:

```go
func (a Address) Street() string         { return a.street }
func (a Address) Number() string         { return a.number }
func (a Address) City() string           { return a.city }
func (a Address) State() string          { return a.state }
func (a Address) ZipCode() string        { return a.zipCode }
func (a Address) Country() enums.Country { return a.country }

func (a Address) String() string {
    return fmt.Sprintf("%s, %s, %s/%s", a.street, a.number, a.city, a.state)
}
func (a Address) IsZero() bool  { return a.street == "" && a.city == "" }
func (a Address) Equals(other Address) bool {
    return a.street == other.street && a.number == other.number &&
        a.city == other.city && a.state == other.state && a.zipCode == other.zipCode
}
```

### Step 4: Optional static helpers

For boolean validity checks without constructing the VO:

```go
// IsValidCPF reports whether raw passes the CPF check-digit algorithm.
func IsValidCPF(raw string) bool {
    clean := cpfCleanRegex.ReplaceAllString(raw, "")
    // ... algorithm ...
    return true
}
```

## Where to put the file

| Scope | Location |
|-------|---------|
| Shared across contexts | `core/objects/<name>.go` (e.g., `Email`, `ID`, `Address`, `Money`) |
| Context-specific | `internal/<ctx>/objects/<name>.go` (e.g., `JobOutputUrl`) |

Context-specific VOs import error codes from the context's own errors package using the alias `ctxerrors`.

## Error handling in constructors

Always return `*errors.AppError` via `errors.NewBaseError(code, message)`:
- For shared VOs: use a code from `template/core-go/errors/codes.go` (e.g., `errors.CodeInvalidEmail`).
- For context VOs: use the context's own code (e.g., `ctxerrors.CodeInvalidJobOutputUrl`).

```go
// Shared VO (in core/objects/)
return Email{}, errors.NewBaseError(errors.CodeInvalidEmail, "invalid email: "+raw)

// Context VO (in internal/<ctx>/objects/)
return JobOutputUrl{}, errors.NewBaseError(ctxerrors.CodeInvalidJobOutputUrl, "...")
```

## Using VOs in entities

VOs are embedded as struct fields by value (not pointer) when the field is always present, or as pointer when optional:

```go
type TranscodingJob struct {
    entities.BaseEntity
    VideoID   string
    Status    enums.JobStatus
    InputUrl  string
    OutputUrl *string          // optional — use *string for simple cases, or *JobOutputUrl
    OwnerID   string
}
```

For core VOs like `Email` and `ID`, embed by value:

```go
type Channel struct {
    entities.BaseEntity
    Name    string
    OwnerID string
    // Email would be objects.Email embedded by value
}
```

When a VO field is set, call the constructor in the entity's own constructor or behavior method and propagate the error up:

```go
func NewTranscodingJob(videoID, inputUrl, ownerID string) (*TranscodingJob, error) {
    if videoID == "" {
        return nil, errors.NewBaseError(ctxerrors.CodeInvalidVideoID, "videoID must not be empty")
    }
    // ...
    return job, nil
}
```

## Critical Rules

### Private fields only [VO-GO-01]

All struct fields are private (lowercase). Public exported fields are not immutable — any caller could write `vo.value = "tampered"`. Accessors are the only read path.

```go
// WRONG — public field
type Email struct {
    Value string
}

// CORRECT — private field, accessor method
type Email struct {
    value string
}
func (e Email) Value() string { return e.value }
```

### Constructor returns (VO, error) — never panics [VO-GO-02]

Constructors always return `(T, error)`. Never use `Must` wrappers or panic in production code paths. The caller decides how to handle validation failure.

```go
// WRONG
func NewEmail(raw string) Email {
    // panics if invalid — unacceptable in domain constructors
    if !isValid(raw) { panic("invalid email") }
    return Email{value: raw}
}

// CORRECT
func NewEmail(raw string) (Email, error) {
    // ...validation...
    return Email{value: normalized}, nil
}
```

### No setters — VOs are immutable [VO-GO-03]

Once constructed a VO is never mutated. Entity behavior methods that need a new VO value create a new instance and assign it to the entity field.

```go
// WRONG — setter method
func (e *Email) SetValue(raw string) { e.value = raw }

// CORRECT — entity method creates new VO
func (c *Channel) UpdateOwnerEmail(raw string) error {
    email, err := objects.NewEmail(raw)
    if err != nil { return err }
    c.OwnerEmail = email
    _ = c.IncrementVersion()
    return nil
}
```

### Composite VOs use struct tags for validation [VO-GO-C01]

For VOs with multiple fields, use `validate:"..."` struct tags and `validation.ValidateWithCode` instead of manual if-chains. This keeps the validation rules co-located with the field declarations.

```go
// WRONG — manual if-chain
func NewAddress(data NewAddressParams) (Address, error) {
    if data.Street == "" {
        return Address{}, errors.NewBaseError(errors.CodeInvalidAddress, "street required")
    }
    if data.City == "" {
        return Address{}, errors.NewBaseError(errors.CodeInvalidAddress, "city required")
    }
    // ...
}

// CORRECT — struct tags
type Address struct {
    street string `validate:"required"`
    city   string `validate:"required"`
}
func NewAddress(data NewAddressParams) (Address, error) {
    a := Address{street: data.Street, city: data.City}
    if err := validation.ValidateWithCode(&a, errors.CodeInvalidAddress); err != nil {
        return Address{}, err
    }
    return a, nil
}
```

## Checklist

- [ ] All struct fields are private (lowercase)
- [ ] Constructor signature: `func New<Name>(...) (<Name>, error)`
- [ ] Constructor returns `errors.NewBaseError(code, msg)` on failure — never panics
- [ ] `Value() T`, `String() string`, `Equals(other T) bool`, `IsZero() bool` methods present
- [ ] Composite VO uses struct tags + `validation.ValidateWithCode`
- [ ] File location correct: `core/objects/` for shared, `internal/<ctx>/objects/` for context-specific

## Complete Examples

### Primitive VO — JobOutputUrl

```go
// internal/transcoding/objects/job_output_url.go
package objects

import (
    "net/url"
    "strings"

    ctxerrors "template/api-go/internal/transcoding/errors"
    "template/core-go/errors"
)

// JobOutputUrl is an immutable value object representing a validated output URL.
type JobOutputUrl struct {
    value string
}

func NewJobOutputUrl(raw string) (JobOutputUrl, error) {
    trimmed := strings.TrimSpace(raw)
    if trimmed == "" {
        return JobOutputUrl{}, errors.NewBaseError(ctxerrors.CodeInvalidJobOutputUrl, "job output URL must not be empty")
    }
    u, err := url.Parse(trimmed)
    if err != nil || u.Scheme == "" || u.Host == "" {
        return JobOutputUrl{}, errors.NewBaseError(ctxerrors.CodeInvalidJobOutputUrl, "job output URL must be a valid absolute URL: "+raw)
    }
    return JobOutputUrl{value: trimmed}, nil
}

func (j JobOutputUrl) Value() string             { return j.value }
func (j JobOutputUrl) String() string            { return j.value }
func (j JobOutputUrl) Equals(o JobOutputUrl) bool { return j.value == o.value }
func (j JobOutputUrl) IsZero() bool              { return j.value == "" }
```

### Primitive VO — Email (shared core)

```go
// core/objects/email.go
package objects

import (
    "net/mail"
    "strings"

    "template/core-go/errors"
)

type Email struct {
    value string
}

func NewEmail(raw string) (Email, error) {
    normalized := strings.TrimSpace(strings.ToLower(raw))
    if _, err := mail.ParseAddress(normalized); err != nil {
        return Email{}, errors.NewBaseError(errors.CodeInvalidEmail, "invalid email: "+raw)
    }
    return Email{value: normalized}, nil
}

func (e Email) Value() string        { return e.value }
func (e Email) String() string       { return e.value }
func (e Email) Equals(other Email) bool { return e.value == other.value }
func (e Email) IsZero() bool         { return e.value == "" }
```

### Composite VO — Address (shared core)

```go
// core/objects/address.go
package objects

import (
    "fmt"

    "template/core-go/enums"
    "template/core-go/errors"
    "template/core-go/pkg/validation"
)

type Address struct {
    street       string        `validate:"required"`
    number       string        `validate:"required"`
    complement   string
    neighborhood string        `validate:"required"`
    city         string        `validate:"required"`
    state        string        `validate:"required,len=2"`
    zipCode      string
    country      enums.Country `validate:"omitempty,oneof=BR US"`
}

type NewAddressParams struct {
    Street, Number, Complement, Neighborhood, City, State, ZipCode string
    Country enums.Country
}

func NewAddress(data NewAddressParams) (Address, error) {
    a := Address{
        street: data.Street, number: data.Number, complement: data.Complement,
        neighborhood: data.Neighborhood, city: data.City,
        state: data.State, zipCode: data.ZipCode, country: data.Country,
    }
    if err := validation.ValidateWithCode(&a, errors.CodeInvalidAddress); err != nil {
        return Address{}, err
    }
    return a, nil
}

func (a Address) Street() string         { return a.street }
func (a Address) Number() string         { return a.number }
func (a Address) City() string           { return a.city }
func (a Address) State() string          { return a.state }
func (a Address) ZipCode() string        { return a.zipCode }
func (a Address) Country() enums.Country { return a.country }
func (a Address) String() string {
    return fmt.Sprintf("%s, %s, %s/%s", a.street, a.number, a.city, a.state)
}
func (a Address) IsZero() bool { return a.street == "" && a.city == "" }
func (a Address) Equals(other Address) bool {
    return a.street == other.street && a.number == other.number &&
        a.city == other.city && a.state == other.state && a.zipCode == other.zipCode
}
```

## References

- `packages/api/go/core/objects/` — Email, ID, Address, Money, PersonName
- `packages/api/go/internal/transcoding/objects/job_output_url.go` — canonical context VO
- `dev:packages/channel/internal/shared/objects/email.go` — Email pattern
- `dev:packages/channel/internal/shared/objects/cpf.go` — CPF with algorithm + IsValidCPF helper
- `dev:packages/channel/internal/shared/objects/value_object.go` — PrimitiveValueObject[T] generic base
