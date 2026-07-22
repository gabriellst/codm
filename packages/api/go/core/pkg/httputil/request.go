package httputil

import (
	"encoding/json"
	"net/http"
	"reflect"
	"strconv"
	"strings"

	"template/core-go/errors"
	"template/core-go/pkg/validation"
)

// DecodeRequest decodes an HTTP request into a struct that defines the full request schema.
// The struct should have fields tagged with `from:"body"`, `from:"param"`, `from:"query"`,
// `from:"header"`, or `from:"cookie"` to indicate where each field comes from.
//
// Fields tagged with `from:"body"` are decoded from the JSON request body.
// Fields tagged with `from:"param"` are read from path parameters via r.PathValue().
// Fields tagged with `from:"query"` are read from query string parameters.
// Fields tagged with `from:"header"` are read from request headers.
// Fields tagged with `from:"cookie"` are read from HTTP cookies.
//
// The `json` tag is used for body field names, and `name` tag for param/query/header/cookie names.
// After decoding, the struct is validated using validator/v10 tags.
//
// Example:
//
//	type CreateTodoRequest struct {
//	    OwnerID string `from:"cookie" name:"owner_id" validate:"required" swaggerignore:"true"`
//	    Title    string `from:"body"   json:"title"     validate:"required,min=1,max=255" example:"Buy groceries"`
//	}
//
//	type CompleteTodoRequest struct {
//	    ID string `from:"param" name:"id" validate:"required,uuid" example:"7c9e..."`
//	}
//
//	type ListTodosRequest struct {
//	    OwnerID string `from:"cookie" name:"owner_id" validate:"required" swaggerignore:"true"`
//	    Limit    int    `from:"query"  name:"limit"     validate:"omitempty,min=1,max=100"`
//	    Offset   int    `from:"query"  name:"offset"    validate:"omitempty,min=0"`
//	}
func DecodeRequest[T any](r *http.Request) (T, error) {
	var input T
	val := reflect.ValueOf(&input).Elem()
	typ := val.Type()

	var hasBody bool

	// First pass: check if there are any body fields
	for i := 0; i < typ.NumField(); i++ {
		if typ.Field(i).Tag.Get("from") == "body" {
			hasBody = true
			break
		}
	}

	// Decode body fields from JSON
	if hasBody && r.Body != nil {
		bodyMap := make(map[string]json.RawMessage)
		if err := json.NewDecoder(r.Body).Decode(&bodyMap); err != nil {
			return input, errors.NewBaseError(errors.CodeBadRequest, "invalid request body: "+err.Error())
		}

		for i := 0; i < typ.NumField(); i++ {
			field := typ.Field(i)
			if field.Tag.Get("from") != "body" {
				continue
			}

			// Standard Go json tag semantics: the tag can carry options after
			// the name separated by commas (e.g. `json:"foo,omitempty"`). Only
			// the first segment is the actual field name — split it off so
			// optional pointer fields decode correctly.
			jsonTag := field.Tag.Get("json")
			jsonName, _, _ := strings.Cut(jsonTag, ",")
			if jsonName == "" || jsonName == "-" {
				jsonName = field.Name
			}

			raw, ok := bodyMap[jsonName]
			if !ok {
				continue
			}

			fieldVal := val.Field(i)
			if fieldVal.CanSet() {
				ptr := reflect.New(field.Type)
				if err := json.Unmarshal(raw, ptr.Interface()); err != nil {
					return input, errors.NewBaseError(errors.CodeBadRequest, "invalid field "+jsonName+": "+err.Error())
				}
				fieldVal.Set(ptr.Elem())
			}
		}
	}

	// Decode param, query, header, and ctx fields
	for i := 0; i < typ.NumField(); i++ {
		field := typ.Field(i)
		from := field.Tag.Get("from")
		name := field.Tag.Get("name")
		if name == "" {
			name = field.Name
		}

		var strValue string

		switch from {
		case "param":
			strValue = r.PathValue(name)
		case "query":
			strValue = r.URL.Query().Get(name)
		case "header":
			strValue = r.Header.Get(name)
		case "cookie":
			if c, err := r.Cookie(name); err == nil {
				strValue = c.Value
			}
		default:
			continue
		}

		if strValue == "" {
			continue
		}

		fieldVal := val.Field(i)
		if !fieldVal.CanSet() {
			continue
		}

		switch field.Type.Kind() {
		case reflect.String:
			fieldVal.SetString(strValue)
		case reflect.Int, reflect.Int64:
			if n, err := strconv.ParseInt(strValue, 10, 64); err == nil {
				fieldVal.SetInt(n)
			}
		case reflect.Bool:
			if b, err := strconv.ParseBool(strValue); err == nil {
				fieldVal.SetBool(b)
			}
		case reflect.Float64:
			if f, err := strconv.ParseFloat(strValue, 64); err == nil {
				fieldVal.SetFloat(f)
			}
		}
	}

	// Validate the fully decoded struct
	if err := validation.Validate(&input); err != nil {
		return input, err
	}

	return input, nil
}

