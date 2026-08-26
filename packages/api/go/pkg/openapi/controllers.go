package openapi

import (
	"fmt"
	"go/types"
	"net/http"
	"sort"
	"strings"
)

// registerControllers discovers controllers and registers their operations +
// component schemas.
func registerControllers(spec *Spec, w *walker, unions map[string][]UnionAnnotation) error {
	ctx := &schemaCtx{spec: spec, w: w, unions: unions}

	// Collect first so we can sort deterministically.
	var all []*controllerType
	if err := w.forEachController(func(c *controllerType) error {
		all = append(all, c)
		return nil
	}); err != nil {
		return err
	}
	sort.Slice(all, func(i, j int) bool {
		return controllerKey(all[i]) < controllerKey(all[j])
	})

	for _, c := range all {
		if err := registerOne(ctx, c); err != nil {
			return fmt.Errorf("controller %s: %w", c.named.Obj().Name(), err)
		}
	}
	return nil
}

func controllerKey(c *controllerType) string {
	return c.metadata.Method + " " + buildFullPath(c.metadata)
}

// registerOne adds the request/response components for a single controller,
// then inserts the operation into the paths map.
func registerOne(ctx *schemaCtx, c *controllerType) error {
	meta := c.metadata
	fullPath := buildFullPath(meta)
	openapiPath := convertPath(fullPath)

	op := map[string]any{
		"operationId": c.named.Obj().Name() + "_" + strings.ToLower(meta.Method),
		"summary":     meta.Description,
	}
	if len(meta.Tags) > 0 {
		op["tags"] = toAnySlice(meta.Tags)
	}

	// Operation ID convention: <ControllerStructName minus "Controller">.
	opID := strings.TrimSuffix(c.named.Obj().Name(), "Controller")
	op["operationId"] = opID

	// Request: split into parameters (path/query/header) and body.
	if meta.Request != nil {
		params, bodySchema, err := requestToParamsAndBody(ctx, meta.Request)
		if err != nil {
			return err
		}
		if len(params) > 0 {
			op["parameters"] = params
		}
		if bodySchema != nil {
			op["requestBody"] = map[string]any{
				"required": true,
				"content": map[string]any{
					"application/json": map[string]any{
						"schema": bodySchema,
					},
				},
			}
		}
	}

	// Responses.
	responses := map[string]any{}

	successStatus := meta.ResolvedStatus()
	if meta.Response == nil {
		responses[fmt.Sprint(successStatus)] = map[string]any{
			"description": http.StatusText(successStatus),
		}
	} else {
		// If the response type is one of the SSE endpoints (named `EventPayloads`),
		// use ServerEvent as the body and application/json. Frontend treats /events as
		// text/event-stream at runtime — kept as JSON schema for Kubb compat.
		schema := typeSchemaForAny(ctx, meta.Response)

		// Special-case: if it's EventPayloads, replace with ServerEvent ref.
		if named, ok := meta.Response.(*types.Named); ok && named.Obj().Name() == "EventPayloads" {
			schema = ref("ServerEvent")
		}

		responses[fmt.Sprint(successStatus)] = map[string]any{
			"description": http.StatusText(successStatus),
			"content": map[string]any{
				"application/json": map[string]any{
					"schema": schema,
				},
			},
		}
	}

	// Default error response.
	responses["default"] = map[string]any{
		"description": "Error",
		"content": map[string]any{
			"application/json": map[string]any{
				"schema": ref("ErrorResponse"),
			},
		},
	}

	op["responses"] = responses

	// Insert into spec.Paths — fetch (or create) the path item and set the method entry.
	pi := getOrCreatePathItem(ctx.spec, openapiPath)
	pi[strings.ToLower(meta.Method)] = op
	return nil
}

func getOrCreatePathItem(spec *Spec, path string) map[string]any {
	if pi, ok := spec.Paths[path].(map[string]any); ok {
		return pi
	}
	pi := map[string]any{}
	spec.Paths[path] = pi
	return pi
}

// buildFullPath replicates the HttpRouter path composition: /api/{context}{path}.
// For spec purposes we drop `/api` to keep URLs short & stable — the SDK
// already prepends a base URL. Matches the existing swagger.json convention.
func buildFullPath(meta controllerMetadata) string {
	if meta.Context == "" {
		return meta.Path
	}
	return "/" + meta.Context + meta.Path
}

// convertPath converts Go router path `{id}` into OpenAPI path `{id}` (same syntax, noop).
// Included for symmetry with other languages that may need translation.
func convertPath(p string) string { return p }

// requestToParamsAndBody introspects the request struct and builds (params, bodySchema).
// Struct tags drive classification:
//   - from:"path" / from:"param" → path parameter
//   - from:"query"               → query parameter
//   - from:"header"              → header parameter
//   - from:"body"                → merged into the request body schema
//
// Untagged fields default to body.
func requestToParamsAndBody(ctx *schemaCtx, reqType any) ([]any, map[string]any, error) {
	named, ok := reqType.(*types.Named)
	if !ok {
		return nil, nil, fmt.Errorf("request type is not a named struct: %T", reqType)
	}
	st, ok := named.Underlying().(*types.Struct)
	if !ok {
		return nil, nil, fmt.Errorf("request type %s is not a struct", named.Obj().Name())
	}

	var params []any
	bodyProps := map[string]any{}
	bodyRequired := []string{}

	for i := 0; i < st.NumFields(); i++ {
		f := st.Field(i)
		if !f.Exported() {
			continue
		}
		tag := parseTag(st.Tag(i))
		if tag.swaggerignore {
			continue
		}
		if tag.jsonName == "-" {
			continue
		}
		fieldSchema := ctx.typeSchema(f.Type())
		if tag.example != "" {
			fieldSchema["example"] = tag.example
		}
		required := hasRequiredValidateTag(tag.validate)

		paramName := tag.nameOverride
		if paramName == "" {
			paramName = tag.jsonName
		}
		if paramName == "" {
			paramName = f.Name()
		}

		switch tag.from {
		case "path", "param":
			params = append(params, map[string]any{
				"name":     paramName,
				"in":       "path",
				"required": true,
				"schema":   fieldSchema,
			})
		case "query":
			param := map[string]any{
				"name":   paramName,
				"in":     "query",
				"schema": fieldSchema,
			}
			if required {
				param["required"] = true
			}
			params = append(params, param)
		case "header":
			param := map[string]any{
				"name":   paramName,
				"in":     "header",
				"schema": fieldSchema,
			}
			if required {
				param["required"] = true
			}
			params = append(params, param)
		case "body", "":
			bodyProps[paramName] = fieldSchema
			if required {
				bodyRequired = append(bodyRequired, paramName)
			}
		}
	}

	if len(bodyProps) == 0 {
		return params, nil, nil
	}
	body := map[string]any{
		"type":       "object",
		"properties": bodyProps,
	}
	if len(bodyRequired) > 0 {
		body["required"] = bodyRequired
	}
	return params, body, nil
}

type parsedTag struct {
	jsonName      string
	nameOverride  string
	from          string
	validate      string
	example       string
	swaggerignore bool
}

func parseTag(raw string) parsedTag {
	st := structTagParse(raw)
	name, _ := parseJSONTag(st.get("json"), "")
	return parsedTag{
		jsonName:      name,
		nameOverride:  st.get("name"),
		from:          st.get("from"),
		validate:      st.get("validate"),
		example:       st.get("example"),
		swaggerignore: st.get("swaggerignore") == "true",
	}
}

// tinyTag is a stripped-down struct tag parser (stdlib reflect.StructTag gets
// a `Get`, but we want it directly on a string without a reflect import).
type tinyTag map[string]string

func (t tinyTag) get(key string) string { return t[key] }

func structTagParse(tag string) tinyTag {
	out := tinyTag{}
	for tag != "" {
		// skip leading whitespace.
		i := 0
		for i < len(tag) && tag[i] == ' ' {
			i++
		}
		tag = tag[i:]
		if tag == "" {
			break
		}
		// scan key.
		i = 0
		for i < len(tag) && tag[i] != ' ' && tag[i] != ':' && tag[i] != '"' {
			i++
		}
		if i == 0 || i+1 >= len(tag) || tag[i] != ':' || tag[i+1] != '"' {
			break
		}
		key := tag[:i]
		tag = tag[i+1:]
		// scan quoted value.
		i = 1
		for i < len(tag) && tag[i] != '"' {
			if tag[i] == '\\' {
				i++
			}
			i++
		}
		if i >= len(tag) {
			break
		}
		val := tag[1:i]
		out[key] = val
		tag = tag[i+1:]
	}
	return out
}

// typeSchemaForAny handles the controller's `Response any` field — it may be
// the zero-value of a named struct (via the composite literal in Metadata()).
func typeSchemaForAny(ctx *schemaCtx, t any) map[string]any {
	gt, ok := t.(types.Type)
	if !ok {
		return map[string]any{"x-unknown": true}
	}
	return ctx.typeSchema(gt)
}
