---
name: trace-analysis
description: Use when debugging issues with Grafana Tempo traces, analyzing request flows, finding slow operations, or investigating errors. Use this skill for any production debugging that requires trace analysis, span inspection, or performance investigation.
---

# Trace Analysis

Analyze distributed traces in Grafana Tempo using span attributes from `packages/api/typescript/src/shared/utils/Tracing.ts`.

## When to Use

- Debugging production errors or unexpected behavior
- Investigating slow API responses
- Analyzing request flows across services
- Finding error patterns in specific endpoints

## When NOT to Use

- Local development debugging (use console logs or debugger)
- Investigating frontend-only issues
- Database performance issues (use Grafana dashboards instead)

## Available Span Attributes

### Class/Component

| Attribute | Type | Description |
|-----------|------|-------------|
| `class.name` | string | Class name (e.g., `CreateUserUseCase`) |
| `class.component` | string | Component type: `router`, `middleware`, `controller`, `service`, `repository`, `handler`, `factory`, `event`, `mediator` |
| `class.module` | string | Context/module name (e.g., `user`, `appointment`) |

### Method

| Attribute | Type | Description |
|-----------|------|-------------|
| `method.name` | string | Method name (e.g., `execute`, `save`) |
| `method.type` | string | `async` or `sync` |
| `method.args.count` | number | Number of arguments passed |
| `method.input.json` | string | JSON stringified input arguments |
| `method.output.json` | string | JSON stringified return value |
| `method.duration.ms` | number | Execution time in milliseconds |
| `method.timestamp.start` | number | Unix timestamp when method started |
| `method.timestamp.end` | number | Unix timestamp when method ended |

### Result

| Attribute | Type | Description |
|-----------|------|-------------|
| `method.result.type` | string | `typeof` result (`object`, `string`, etc.) |
| `method.result.has_value` | boolean | Whether method returned a value |
| `method.result.constructor` | string | Result object's constructor name |
| `method.result.keys` | string | Comma-separated object keys |

### Error

| Attribute | Type | Description |
|-----------|------|-------------|
| `method.error.type` | string | Error constructor name (e.g., `BaseError`) |
| `method.error.message` | string | Error message |
| `method.error.stack` | string | Full stack trace |

## TraceQL Queries

### Find Errors

```traceql
// All errors in a module
{ class.module = "appointment" && status = error }

// Specific error type
{ method.error.type = "ValidationError" }

// Errors containing message
{ method.error.message =~ ".*not found.*" }
```

### Performance Analysis

```traceql
// Slow operations (>1000ms)
{ method.duration.ms > 1000 }

// Slow repository calls
{ class.component = "repository" && method.duration.ms > 500 }

// Slow use cases in specific module
{ class.component = "usecase" && class.module = "user" && method.duration.ms > 2000 }
```

### Filter by Component Layer

```traceql
// All controller calls
{ class.component = "controller" }

// Repository operations for a module
{ class.component = "repository" && class.module = "appointment" }

// Event handlers
{ class.component = "handler" }
```

### Find Specific Operations

```traceql
// Specific class and method
{ class.name = "CreateUserUseCase" && method.name = "execute" }

// All save operations
{ method.name = "save" }

// Search by input content
{ method.input.json =~ ".*email@example.com.*" }
```

### Trace Flow Analysis

```traceql
// Full request trace for a module
{ class.module = "appointment" } | select(class.name, method.name, method.duration.ms)

// Compare async vs sync methods
{ method.type = "async" && class.component = "service" }
```

## Debugging Workflows

### Investigating a Failed Request

1. Find the error span:
   ```traceql
   { status = error && class.module = "<module>" }
   ```

2. Check error details in span attributes:
   - `method.error.type` - What error class
   - `method.error.message` - Error description
   - `method.error.stack` - Stack trace

3. Look at input that caused the error:
   - `method.input.json` - Arguments passed

### Performance Investigation

1. Find slow operations:
   ```traceql
   { method.duration.ms > 1000 }
   ```

2. Check call hierarchy in trace view:
   - Which component is slowest?
   - Which method within that component?

3. Analyze pattern:
   ```traceql
   { class.name = "SlowClass" } | rate() by (method.name)
   ```

### Request Flow Analysis

1. Get full trace for a request
2. Check component order: `router` → `middleware` → `controller` → `service` → `repository`
3. Verify data transformation via `method.input.json` and `method.output.json`

## Grafana Dashboard Queries

### Error Rate by Module

```promql
sum(rate(traces_spanmetrics_calls_total{status="STATUS_CODE_ERROR"}[5m])) by (class_module)
```

### P95 Latency by Component

```promql
histogram_quantile(0.95, sum(rate(traces_spanmetrics_latency_bucket[5m])) by (le, class_component))
```

### Throughput by Use Case

```promql
sum(rate(traces_spanmetrics_calls_total{class_component="usecase"}[5m])) by (class_name)
```

## Debugging Process

### Step 1: Identify the Symptom
Determine what you're investigating: error responses (5xx), slow requests, missing data, or unexpected behavior.

### Step 2: Choose Query Strategy
| Symptom | Strategy |
|---------|----------|
| Known request | Search by `traceId` |
| Error on endpoint | Filter by `http.route` + `status = error` |
| Slow responses | Filter by `duration > 1s` + `http.route` |
| Missing data | Search by entity ID in span attributes |

### Step 3: Analyze Spans
Look for: error status codes, long durations between spans, gaps in the trace, and unexpected span attributes.

### Step 4: Identify Root Cause
Read span attributes (`input`, `output`, `error.message`) to understand what went wrong.

## Complete Debugging Example

**Problem**: API returns 500 on `POST /appointments`

```
// Step 1: Search error spans
{ resource.service.name = "template-api" } && status = error && span.http.route = "POST /appointments"

// Step 2: Found error span with attributes:
//   error.message: "DOCTOR_NOT_AVAILABLE"
//   input: { doctorId: "abc-123", date: "2024-03-15" }
//   module: "service"

// Step 3: Root cause — doctor availability not checked before scheduling
// Fix: Add availability validation in CreateAppointment use case
```

## Common Issues

### Missing Traces

- Check `OTEL_COLLECTOR_TRACE_URL` in Config
- Verify `startTelemetry()` called at startup
- Check if class is resolved via DI container (auto-traced via `autoTrace`)

### Truncated Data

- `method.input.json` and `method.output.json` are truncated at 10000 characters
- Shows `[truncated]` suffix when exceeded
- Check `method.result.keys` for object structure

### Unserializable Data

- Shows `[unserializable]` for circular references or special objects
- Common with streams, Buffers, complex class instances

## References

- `packages/api/typescript/src/shared/utils/Tracing.ts` - Tracing implementation
- `packages/api/typescript/src/shared/utils/Config.ts` - OTEL configuration
