package openapi

import (
	"go/types"
	"sort"
	"strings"

	"golang.org/x/tools/go/packages"
)

// eventMapping records the pairing between a payload struct and its event-name constant.
type eventMapping struct {
	PayloadName string
	EventName   string
	Payload     *types.Named
}

// registerEvents walks channel/internal/shared/events/*.go, pairs each
// `XxxEventName` const with the payload type embedded in the `XxxEvent` type
// alias (IntegrationEvent[PayloadType]), and registers:
//  1. The payload component (with @union handling)
//  2. A `<PascalEventName>Event` wrapper component
//  3. A synthesized `ServerEvent` oneOf with `discriminator: name -> ref` mapping
//  4. A synthesized `ServerEventName` enum component (listed in eventname order)
//
// After Task 3 (payload ownership inversion), payload structs live in
// channel/events/* and remote/events/*. shared/events only holds thin wrappers:
// a Name const + a type alias `= types.IntegrationEvent[domainevents.XxxPayload]`
// + a constructor. The emitter now resolves the payload type by unwrapping the
// generic type argument from the alias's RHS.
//
// Mirrors client/scripts/channel/sse.ts.
func registerEvents(spec *Spec, w *walker, unions map[string]*UnionAnnotation) error {
	ctx := &schemaCtx{spec: spec, w: w, unions: unions}

	eventsPkg, ok := w.byPath["template/api-go/internal/shared/events"]
	if !ok {
		return nil // no events package; skip.
	}

	mappings := collectEventMappings(eventsPkg)
	if len(mappings) == 0 {
		return nil
	}

	// Register payload components first.
	for _, m := range mappings {
		ctx.ensureComponent(m.Payload)
	}

	// Build event wrapper components + ServerEvent oneOf + ServerEventName enum.
	type variantEntry struct {
		wrapperName string
		eventName   string
	}
	var variants []variantEntry

	for _, m := range mappings {
		wrapperName := eventNameToPascal(m.EventName) + "Event"
		isIntegration := strings.HasPrefix(m.EventName, "integration.")
		props := map[string]any{
			"id":      map[string]any{"type": "string"},
			"ownerId": map[string]any{"type": "string"},
			"time":    map[string]any{"type": "string", "format": "date-time"},
			"name":    map[string]any{"type": "string", "const": m.EventName},
			"payload": ref(m.PayloadName),
		}
		required := []string{"id", "ownerId", "time", "name", "payload"}
		if !isIntegration {
			props["entityId"] = map[string]any{"type": "string"}
			required = []string{"id", "entityId", "ownerId", "time", "name", "payload"}
		}

		spec.putSchema(wrapperName, map[string]any{
			"type":       "object",
			"required":   required,
			"properties": props,
			"x-tag":      "event",
		})

		variants = append(variants, variantEntry{wrapperName: wrapperName, eventName: m.EventName})
	}

	// Sort deterministically by eventName.
	sort.Slice(variants, func(i, j int) bool { return variants[i].eventName < variants[j].eventName })

	// ServerEvent oneOf + discriminator.
	oneOf := make([]map[string]any, 0, len(variants))
	mapping := map[string]any{}
	names := make([]any, 0, len(variants))
	for _, v := range variants {
		oneOf = append(oneOf, ref(v.wrapperName))
		mapping[v.eventName] = "#/components/schemas/" + v.wrapperName
		names = append(names, v.eventName)
	}
	spec.putSchema("ServerEvent", map[string]any{
		"oneOf": oneOf,
		"discriminator": map[string]any{
			"propertyName": "name",
			"mapping":      mapping,
		},
		"x-discriminators": []any{"name"},
	})

	// ServerEventName enum.
	varnames := make([]any, 0, len(variants))
	for _, v := range variants {
		varnames = append(varnames, eventNameToPascal(v.eventName))
	}
	spec.putSchema("ServerEventName", map[string]any{
		"type":            "string",
		"enum":            names,
		"x-enum-varnames": varnames,
	})

	return nil
}

// collectEventMappings pairs XxxEventName constants in shared/events with the
// payload type resolved from the corresponding XxxEvent type alias.
//
// After payload ownership inversion (Task 3), each shared/events file has:
//   - const XxxEventName = "integration...."
//   - type XxxEvent = types.IntegrationEvent[domainevents.XxxPayload]
//
// The payload type is the first generic type argument of the IntegrationEvent
// instantiation, resolved via (*types.Alias).Rhs().(*types.Named).TypeArgs().At(0).
func collectEventMappings(pkg *packages.Package) []eventMapping {
	if pkg.Types == nil {
		return nil
	}
	scope := pkg.Types.Scope()

	// Step 1: map stripped prefix -> event name string from XxxEventName consts.
	// e.g. "ChannelConnected" -> "integration.channel.connected"
	byPrefix := map[string]string{}
	for _, name := range scope.Names() {
		if !strings.HasSuffix(name, "EventName") {
			continue
		}
		obj := scope.Lookup(name)
		c, ok := obj.(*types.Const)
		if !ok {
			continue
		}
		prefix := strings.TrimSuffix(name, "EventName")
		s := c.Val().String()
		s = strings.TrimPrefix(s, `"`)
		s = strings.TrimSuffix(s, `"`)
		byPrefix[prefix] = s
	}

	// Step 2: for each XxxEvent alias, resolve the payload type from the generic
	// type argument of IntegrationEvent[T].
	var mappings []eventMapping
	for _, name := range scope.Names() {
		if !strings.HasSuffix(name, "Event") || name == "ChannelEvent" {
			continue
		}
		obj := scope.Lookup(name)
		tn, ok := obj.(*types.TypeName)
		if !ok || !tn.IsAlias() {
			continue
		}
		alias, ok := tn.Type().(*types.Alias)
		if !ok {
			continue
		}

		// Unwrap: alias.Rhs() should be IntegrationEvent[PayloadType]
		rhs, ok := alias.Rhs().(*types.Named)
		if !ok {
			continue
		}
		// Verify it's IntegrationEvent (sanity check).
		if rhs.Obj().Name() != "IntegrationEvent" {
			continue
		}
		if rhs.TypeArgs() == nil || rhs.TypeArgs().Len() == 0 {
			continue
		}
		// Unalias: after the union-slots binding swap, context payload types are
		// aliases to the generated wire structs (`type X = wire.X`).
		payloadType, ok := types.Unalias(rhs.TypeArgs().At(0)).(*types.Named)
		if !ok {
			continue
		}
		if _, ok := payloadType.Underlying().(*types.Struct); !ok {
			continue
		}

		// Match against the byPrefix map: strip "Event" suffix from alias name.
		prefix := strings.TrimSuffix(name, "Event")
		eventName, ok := byPrefix[prefix]
		if !ok {
			continue
		}

		mappings = append(mappings, eventMapping{
			PayloadName: payloadType.Obj().Name(),
			EventName:   eventName,
			Payload:     payloadType,
		})
	}

	// Sort for determinism.
	sort.Slice(mappings, func(i, j int) bool { return mappings[i].EventName < mappings[j].EventName })
	return mappings
}

// eventNameToPascal converts dotted/underscored event names to PascalCase.
func eventNameToPascal(name string) string {
	var parts []string
	for _, seg := range strings.Split(name, ".") {
		for _, w := range strings.Split(seg, "_") {
			if w == "" {
				continue
			}
			parts = append(parts, strings.ToUpper(w[:1])+w[1:])
		}
	}
	return strings.Join(parts, "")
}
