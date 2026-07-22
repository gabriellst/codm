#!/usr/bin/env bun

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const args = process.argv.slice(2)
const command = args[0]

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GO_MODULE = 'monorepo/api'

const VALID_HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'ws', 'sse'] as const
type ValidHttpMethod = (typeof VALID_HTTP_METHODS)[number]

// ---------------------------------------------------------------------------
// String helpers
// ---------------------------------------------------------------------------

const toPascalCase = (str: string): string => str.charAt(0).toUpperCase() + str.slice(1)

/**
 * Convert PascalCase / camelCase to snake_case.
 *   "CreateOrder"  -> "create_order"
 *   "OrderStatus"  -> "order_status"
 *   "listOrders"   -> "list_orders"
 *   "HTMLParser"    -> "html_parser"
 */
const toSnakeCase = (str: string): string => {
	return str
		.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
		.replace(/([a-z\d])([A-Z])/g, '$1_$2')
		.toLowerCase()
}

/**
 * Extract verb and entity from a PascalCase use-case name.
 *   "CreateOrder"  -> { verb: "Create",  entity: "Order" }
 *   "ListOrders"   -> { verb: "List",    entity: "Orders" }
 *   "GetUser"      -> { verb: "Get",     entity: "User" }
 *   "PatchStatus"  -> { verb: "Patch",   entity: "Status" }
 */
const extractVerbEntity = (name: string): { verb: string; entity: string } => {
	const match = name.match(/^([A-Z][a-z]+)(.+)$/)
	if (!match) {
		return { verb: name, entity: '' }
	}
	return { verb: match[1], entity: match[2] }
}

/**
 * Singularize a simple plural word (Orders -> Order, Todos -> Todo).
 * Handles basic English plurals only.
 */
const singularize = (str: string): string => {
	if (str.endsWith('ies')) return `${str.slice(0, -3)}y`
	if (str.endsWith('ses') || str.endsWith('xes') || str.endsWith('zes') || str.endsWith('ches') || str.endsWith('shes'))
		return str.slice(0, -2)
	if (str.endsWith('s') && !str.endsWith('ss')) return str.slice(0, -1)
	return str
}

/**
 * Pluralize a simple word (Order -> Orders, Todo -> Todos).
 */
const pluralize = (str: string): string => {
	if (str.endsWith('s')) return str
	if (str.endsWith('y') && !/[aeiou]y$/i.test(str)) return `${str.slice(0, -1)}ies`
	return `${str}s`
}

// ---------------------------------------------------------------------------
// Flag parsing
// ---------------------------------------------------------------------------

function parseFlags(args: string[]): { flags: Record<string, string>; positional: string[] } {
	const flags: Record<string, string> = {}
	const positional: string[] = []

	for (let i = 0; i < args.length; i++) {
		const arg = args[i]
		if (!arg) continue

		if (arg.startsWith('--')) {
			const flagName = arg.substring(2)
			const nextArg = args[i + 1]
			if (nextArg && !nextArg.startsWith('--')) {
				flags[flagName] = nextArg
				i++
			} else {
				flags[flagName] = 'true'
			}
		} else if (arg.startsWith('-') && arg.length === 2) {
			const flagName = arg.substring(1)
			const nextArg = args[i + 1]
			if (nextArg && !nextArg.startsWith('-')) {
				flags[flagName] = nextArg
				i++
			} else {
				flags[flagName] = 'true'
			}
		} else {
			positional.push(arg)
		}
	}

	return { flags, positional }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateHttpMethod(method: string): ValidHttpMethod {
	const lowerMethod = method.toLowerCase()
	if (!VALID_HTTP_METHODS.includes(lowerMethod as any)) {
		console.error(`Error: Invalid HTTP method: "${method}"`)
		console.error(`  Valid methods: ${VALID_HTTP_METHODS.join(', ')}`)
		process.exit(1)
	}
	return lowerMethod as ValidHttpMethod
}

function validatePath(path: string): string {
	if (!path.startsWith('/')) {
		console.error(`Error: Invalid path: "${path}"`)
		console.error('  Path must start with "/"')
		process.exit(1)
	}

	// Allow {param} for Go 1.22 routing; disallow other special chars.
	const invalidChars = /[<>"|\\^`\s]/
	if (invalidChars.test(path)) {
		console.error(`Error: Invalid path: "${path}"`)
		console.error('  Path contains invalid characters')
		process.exit(1)
	}

	return path
}

// ---------------------------------------------------------------------------
// Inference helpers
// ---------------------------------------------------------------------------

function inferHttpMethod(controllerName: string): ValidHttpMethod {
	const lowerName = controllerName.toLowerCase()

	if (lowerName.startsWith('create')) return 'post'
	if (lowerName.startsWith('update')) return 'put'
	if (lowerName.startsWith('delete') || lowerName.startsWith('remove')) return 'delete'
	if (lowerName.startsWith('get')) return 'get'
	if (lowerName.startsWith('list') || lowerName.startsWith('fetch')) return 'get'
	if (lowerName.startsWith('patch') || lowerName.startsWith('complete')) return 'patch'

	return 'post'
}

/**
 * Infer a REST-style path for a controller using Go 1.22 {param} syntax.
 *   CreateOrder  -> /orders
 *   UpdateOrder  -> /orders/{id}
 *   DeleteOrder  -> /orders/{id}
 *   GetOrder     -> /orders/{id}
 *   ListOrders   -> /orders
 */
function inferPath(controllerName: string, contextName: string): string {
	const lowerName = controllerName.toLowerCase()

	// Convert context name to kebab-case and pluralize
	const kebabContext = contextName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
	const pluralContext = kebabContext.endsWith('s') ? kebabContext : `${kebabContext}s`

	const basePath = `/${pluralContext}`

	if (lowerName.startsWith('create')) return basePath
	if (lowerName.startsWith('update')) return `${basePath}/{id}`
	if (lowerName.startsWith('delete')) return `${basePath}/{id}`
	if (lowerName.startsWith('get')) return `${basePath}/{id}`
	if (lowerName.startsWith('list')) return basePath

	return basePath
}

// ---------------------------------------------------------------------------
// Context existence check (Go layout)
// ---------------------------------------------------------------------------

async function contextExists(contextName: string): Promise<boolean> {
	try {
		await access(join(process.cwd(), 'api', 'internal', contextName))
		return true
	} catch {
		return false
	}
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const templates = {
	// ── Entity ──────────────────────────────────────────────────────────
	entity(_contextName: string, entityName: string): string {
		const snakeEntity = toSnakeCase(entityName)
		return `package entities

import (
	"time"

	"github.com/google/uuid"

	"${GO_MODULE}/internal/shared/entities"
)

type ${entityName} struct {
	entities.BaseEntity
	// TODO: Add entity fields
	TenantID string
}

type New${entityName}Params struct {
	// TODO: Add constructor params
	TenantID string
}

func New${entityName}(params New${entityName}Params) *${entityName} {
	${snakeEntity} := &${entityName}{
		BaseEntity: entities.NewBaseEntity(),
		TenantID:   params.TenantID,
	}
	// ${snakeEntity}.AddDomainEvent(...)
	return ${snakeEntity}
}

type Reconstruct${entityName}Params struct {
	ID        uuid.UUID
	// TODO: Add reconstruction params
	TenantID  string
	CreatedAt time.Time
	UpdatedAt time.Time
	Version   int
}

func Reconstruct(params Reconstruct${entityName}Params) *${entityName} {
	return &${entityName}{
		BaseEntity: entities.ReconstructBaseEntity(params.ID, params.CreatedAt, params.UpdatedAt, params.Version),
		TenantID:   params.TenantID,
	}
}
`
	},

	// ── Enum ────────────────────────────────────────────────────────────
	enum(_contextName: string, enumName: string): string {
		const upperSnake = toSnakeCase(enumName).toUpperCase()
		return `package enums

type ${enumName} string

const (
	${enumName}Example ${enumName} = "${upperSnake}_EXAMPLE"
	// TODO: Add enum values
)
`
	},

	// ── Error Codes ─────────────────────────────────────────────────────
	errorCodes(contextName: string): string {
		const upperContext = toSnakeCase(contextName).toUpperCase()
		return `package errors

import (
	"net/http"

	"${GO_MODULE}/internal/shared/errors"
)

const (
	CodeNotFound errors.ErrorCode = "${upperContext}_NOT_FOUND"
	// TODO: Add error codes
)

func init() {
	errors.RegisterErrorCodes(map[errors.ErrorCode]int{
		CodeNotFound: http.StatusNotFound,
	})
}
`
	},

	// ── Event ───────────────────────────────────────────────────────────
	event(contextName: string, eventName: string): string {
		const snakeEvent = toSnakeCase(eventName)
		const constName = `${eventName}EventName`
		return `package events

import (
	"github.com/google/uuid"

	"${GO_MODULE}/internal/shared/events"
)

const ${constName} = "${contextName}.${snakeEvent}"

type ${eventName}Payload struct {
	// TODO: Add payload fields
	EntityID uuid.UUID \`json:"entityId"\`
}

type ${eventName}Event = events.DomainEvent[${eventName}Payload]

func New${eventName}Event(entityID uuid.UUID, tenantID string, payload ${eventName}Payload) ${eventName}Event {
	return events.NewDomainEvent(${constName}, entityID, tenantID, payload)
}
`
	},

	// ── Handler ─────────────────────────────────────────────────────────
	handler(contextName: string, handlerName: string): string {
		const ctxAlias = `${contextName}events`
		const constName = `${handlerName}EventName`
		return `package handlers

import (
	"context"
	"log/slog"

	"${GO_MODULE}/internal/shared/events"
	${ctxAlias} "${GO_MODULE}/internal/${contextName}/events"
)

type ${handlerName}Handler struct{}

func New${handlerName}Handler() *${handlerName}Handler {
	return &${handlerName}Handler{}
}

func (h *${handlerName}Handler) EventName() string {
	return ${ctxAlias}.${constName}
}

//dd:span
func (h *${handlerName}Handler) Handle(ctx context.Context, event events.DomainEventI) error {
	e, ok := event.(${ctxAlias}.${handlerName}Event)
	if !ok {
		return nil
	}

	slog.Info("${toSnakeCase(handlerName)} event received",
		"entityId", e.EntityID,
		"tenantId", e.TenantID,
	)

	return nil
}
`
	},

	// ── Repository Interface ────────────────────────────────────────────
	repositoryInterface(contextName: string, entityName: string): string {
		const snakeEntity = toSnakeCase(entityName)
		return `package ${snakeEntity}

import (
	"context"

	"${GO_MODULE}/internal/${contextName}/entities"
)

type ${entityName}Repository interface {
	Find(ctx context.Context, id string) (*entities.${entityName}, error)
	Save(ctx context.Context, ${snakeEntity} *entities.${entityName}) error
	Delete(ctx context.Context, id string) error
}
`
	},

	// ── Repository Memory ───────────────────────────────────────────────
	repositoryMemory(contextName: string, entityName: string): string {
		const snakeEntity = toSnakeCase(entityName)
		const pluralSnake = toSnakeCase(pluralize(entityName))
		return `package ${snakeEntity}

import (
	"context"
	"sync"

	"${GO_MODULE}/internal/${contextName}/entities"
)

type Memory${entityName}Repository struct {
	mu    sync.RWMutex
	${pluralSnake} map[string]*entities.${entityName}
}

func NewMemory${entityName}Repository() *Memory${entityName}Repository {
	return &Memory${entityName}Repository{
		${pluralSnake}: make(map[string]*entities.${entityName}),
	}
}

//dd:span
func (r *Memory${entityName}Repository) Find(_ context.Context, id string) (*entities.${entityName}, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	${snakeEntity}, ok := r.${pluralSnake}[id]
	if !ok {
		return nil, nil
	}
	return ${snakeEntity}, nil
}

//dd:span
func (r *Memory${entityName}Repository) Save(_ context.Context, ${snakeEntity} *entities.${entityName}) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.${pluralSnake}[${snakeEntity}.ID.String()] = ${snakeEntity}
	return nil
}

//dd:span
func (r *Memory${entityName}Repository) Delete(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.${pluralSnake}, id)
	return nil
}
`
	},

	// ── Usecase: Create ─────────────────────────────────────────────────
	usecaseCreate(contextName: string, name: string): string {
		const { entity } = extractVerbEntity(name)
		const singularEntity = singularize(entity)
		const snakeEntity = toSnakeCase(singularEntity)
		const repoAlias = `${contextName}repo`
		return `package usecases

import (
	"context"

	"${GO_MODULE}/internal/shared/services/mediator"
	"${GO_MODULE}/internal/shared/services/unitofwork"
	"${GO_MODULE}/internal/shared/utils"
	"${GO_MODULE}/internal/${contextName}/entities"
	${repoAlias} "${GO_MODULE}/internal/${contextName}/repositories/${snakeEntity}"
)

type ${name}Input struct {
	// TODO: Add input fields
	TenantID string \`validate:"required"\`
}

type ${name}Output struct {
	ID        string \`json:"id"\`
	CreatedAt string \`json:"createdAt"\`
}

type ${name}Handler struct {
	repo     ${repoAlias}.${singularEntity}Repository
	uow      unitofwork.UnitOfWork
	mediator mediator.InternalMediator
}

func New${name}Handler(
	repo ${repoAlias}.${singularEntity}Repository,
	uow unitofwork.UnitOfWork,
	mediator mediator.InternalMediator,
) *${name}Handler {
	return &${name}Handler{repo: repo, uow: uow, mediator: mediator}
}

func (h *${name}Handler) Name() string { return "${name}" }

//dd:span
func (h *${name}Handler) Execute(ctx context.Context, input ${name}Input) (output ${name}Output, err error) {
	utils.TraceArgs(ctx, map[string]any{"tenantID": input.TenantID})
	defer utils.TraceReturn(ctx, &err)

	entity := entities.New${singularEntity}(entities.New${singularEntity}Params{
		TenantID: input.TenantID,
	})

	err = h.uow.Execute(ctx, func(txCtx context.Context) error {
		if err := h.repo.Save(txCtx, entity); err != nil {
			return err
		}
		for _, event := range entity.PullDomainEvents() {
			if err := h.mediator.Publish(txCtx, event); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return output, err
	}

	return ${name}Output{
		ID:        entity.ID.String(),
		CreatedAt: entity.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}, nil
}
`
	},

	// ── Usecase: List ───────────────────────────────────────────────────
	usecaseList(contextName: string, name: string): string {
		const { entity } = extractVerbEntity(name)
		const singularEntity = singularize(entity)
		const snakeEntity = toSnakeCase(singularEntity)
		const repoAlias = `${contextName}repo`
		return `package usecases

import (
	"context"

	"${GO_MODULE}/internal/shared/utils"
	${repoAlias} "${GO_MODULE}/internal/${contextName}/repositories/${snakeEntity}"
)

type ${name}Input struct {
	TenantID string \`validate:"required"\`
	Limit    int    \`validate:"omitempty,min=1,max=100"\`
	Offset   int    \`validate:"omitempty,min=0"\`
}

type ${singularEntity}Item struct {
	ID        string \`json:"id"\`
	CreatedAt string \`json:"createdAt"\`
}

type ${name}Output struct {
	Items []${singularEntity}Item \`json:"items"\`
}

type ${name}Handler struct {
	repo ${repoAlias}.${singularEntity}Repository
}

func New${name}Handler(repo ${repoAlias}.${singularEntity}Repository) *${name}Handler {
	return &${name}Handler{repo: repo}
}

func (h *${name}Handler) Name() string { return "${name}" }

//dd:span
func (h *${name}Handler) Execute(ctx context.Context, input ${name}Input) (output ${name}Output, err error) {
	utils.TraceArgs(ctx, map[string]any{"tenantID": input.TenantID, "limit": input.Limit, "offset": input.Offset})
	defer utils.TraceReturn(ctx, &err)

	limit := input.Limit
	if limit == 0 {
		limit = 20
	}
	// TODO: Implement list logic
	return ${name}Output{Items: []${singularEntity}Item{}}, nil
}
`
	},

	// ── Usecase: Generic ────────────────────────────────────────────────
	usecaseGeneric(contextName: string, name: string): string {
		const { entity } = extractVerbEntity(name)
		const singularEntity = singularize(entity)
		const snakeEntity = toSnakeCase(singularEntity)
		const repoAlias = `${contextName}repo`
		return `package usecases

import (
	"context"

	"${GO_MODULE}/internal/shared/services/unitofwork"
	"${GO_MODULE}/internal/shared/utils"
	${repoAlias} "${GO_MODULE}/internal/${contextName}/repositories/${snakeEntity}"
)

type ${name}Input struct {
	// TODO: Add input fields
}

type ${name}Output struct {
	// TODO: Add output fields
}

type ${name}Handler struct {
	repo ${repoAlias}.${singularEntity}Repository
	uow  unitofwork.UnitOfWork
}

func New${name}Handler(
	repo ${repoAlias}.${singularEntity}Repository,
	uow unitofwork.UnitOfWork,
) *${name}Handler {
	return &${name}Handler{repo: repo, uow: uow}
}

func (h *${name}Handler) Name() string { return "${name}" }

//dd:span
func (h *${name}Handler) Execute(ctx context.Context, input ${name}Input) (output ${name}Output, err error) {
	utils.TraceArgs(ctx, map[string]any{})
	defer utils.TraceReturn(ctx, &err)

	// TODO: Implement use case logic
	return ${name}Output{}, nil
}
`
	},

	// ── Controller: Create ──────────────────────────────────────────────
	controllerCreate(contextName: string, name: string, path: string): string {
		const tag = toPascalCase(contextName)
		const { entity } = extractVerbEntity(name)
		const singularEntity = singularize(entity)
		const lowerEntity = singularEntity.toLowerCase()
		return `package controllers

import (
	"net/http"

	"${GO_MODULE}/internal/shared/middleware"
	"${GO_MODULE}/internal/shared/types"
	"${GO_MODULE}/internal/${contextName}/usecases"
	"${GO_MODULE}/pkg/httputil"
)

type ${name}Request struct {
	TenantID string \`from:"ctx"  name:"tenantId" validate:"required"\`
	// TODO: Add body fields
}

type ${name}Controller struct {
	handler *usecases.${name}Handler
}

func New${name}Controller(handler *usecases.${name}Handler) *${name}Controller {
	return &${name}Controller{handler: handler}
}

func (c *${name}Controller) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Path:        "${path}",
		Method:      "POST",
		Description: "Create a new ${lowerEntity}",
		Tags:        []string{"${tag}"},
		Middlewares:  []types.Middleware{middleware.Auth},
	}
}

// @Summary      Create a new ${lowerEntity}
// @Tags         ${tag}
// @Accept       json
// @Produce      json
// @Param        input body ${name}Request true "${singularEntity} data"
// @Success      201 {object} usecases.${name}Output
// @Failure      400 {object} errors.AppError
// @Router       ${path} [post]
func (c *${name}Controller) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[${name}Request](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.${name}Input{
		TenantID: req.TenantID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusCreated, output)
}
`
	},

	// ── Controller: List ────────────────────────────────────────────────
	controllerList(contextName: string, name: string, path: string): string {
		const tag = toPascalCase(contextName)
		const { entity } = extractVerbEntity(name)
		const lowerEntity = entity.toLowerCase()
		return `package controllers

import (
	"net/http"

	"${GO_MODULE}/internal/shared/middleware"
	"${GO_MODULE}/internal/shared/types"
	"${GO_MODULE}/internal/${contextName}/usecases"
	"${GO_MODULE}/pkg/httputil"
)

type ${name}Request struct {
	TenantID string \`from:"ctx"   name:"tenantId" validate:"required"\`
	Limit    int    \`from:"query" name:"limit"     validate:"omitempty,min=1,max=100"\`
	Offset   int    \`from:"query" name:"offset"    validate:"omitempty,min=0"\`
}

type ${name}Controller struct {
	handler *usecases.${name}Handler
}

func New${name}Controller(handler *usecases.${name}Handler) *${name}Controller {
	return &${name}Controller{handler: handler}
}

func (c *${name}Controller) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Path:        "${path}",
		Method:      "GET",
		Description: "List ${lowerEntity}",
		Tags:        []string{"${tag}"},
		Middlewares:  []types.Middleware{middleware.Auth},
	}
}

// @Summary      List ${lowerEntity}
// @Tags         ${tag}
// @Produce      json
// @Param        limit  query int false "Limit" default(20)
// @Param        offset query int false "Offset" default(0)
// @Success      200 {object} usecases.${name}Output
// @Failure      401 {object} errors.AppError
// @Router       ${path} [get]
func (c *${name}Controller) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[${name}Request](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.${name}Input{
		TenantID: req.TenantID,
		Limit:    req.Limit,
		Offset:   req.Offset,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
`
	},

	// ── Controller: Get ─────────────────────────────────────────────────
	controllerGet(contextName: string, name: string, path: string): string {
		const tag = toPascalCase(contextName)
		const { entity } = extractVerbEntity(name)
		const singularEntity = singularize(entity)
		const lowerEntity = singularEntity.toLowerCase()
		return `package controllers

import (
	"net/http"

	"${GO_MODULE}/internal/shared/middleware"
	"${GO_MODULE}/internal/shared/types"
	"${GO_MODULE}/internal/${contextName}/usecases"
	"${GO_MODULE}/pkg/httputil"
)

type ${name}Request struct {
	ID string \`from:"param" name:"id" validate:"required,uuid"\`
}

type ${name}Controller struct {
	handler *usecases.${name}Handler
}

func New${name}Controller(handler *usecases.${name}Handler) *${name}Controller {
	return &${name}Controller{handler: handler}
}

func (c *${name}Controller) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Path:        "${path}",
		Method:      "GET",
		Description: "Get a ${lowerEntity}",
		Tags:        []string{"${tag}"},
		Middlewares:  []types.Middleware{middleware.Auth},
	}
}

// @Summary      Get a ${lowerEntity}
// @Tags         ${tag}
// @Produce      json
// @Param        id path string true "${singularEntity} ID" format(uuid)
// @Success      200 {object} usecases.${name}Output
// @Failure      404 {object} errors.AppError
// @Router       ${path} [get]
func (c *${name}Controller) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[${name}Request](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.${name}Input{
		ID: req.ID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
`
	},

	// ── Controller: Update ──────────────────────────────────────────────
	controllerUpdate(contextName: string, name: string, path: string): string {
		const tag = toPascalCase(contextName)
		const { entity } = extractVerbEntity(name)
		const singularEntity = singularize(entity)
		const lowerEntity = singularEntity.toLowerCase()
		return `package controllers

import (
	"net/http"

	"${GO_MODULE}/internal/shared/middleware"
	"${GO_MODULE}/internal/shared/types"
	"${GO_MODULE}/internal/${contextName}/usecases"
	"${GO_MODULE}/pkg/httputil"
)

type ${name}Request struct {
	ID       string \`from:"param" name:"id"       validate:"required,uuid"\`
	TenantID string \`from:"ctx"   name:"tenantId" validate:"required"\`
	// TODO: Add body fields
}

type ${name}Controller struct {
	handler *usecases.${name}Handler
}

func New${name}Controller(handler *usecases.${name}Handler) *${name}Controller {
	return &${name}Controller{handler: handler}
}

func (c *${name}Controller) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Path:        "${path}",
		Method:      "PUT",
		Description: "Update a ${lowerEntity}",
		Tags:        []string{"${tag}"},
		Middlewares:  []types.Middleware{middleware.Auth},
	}
}

// @Summary      Update a ${lowerEntity}
// @Tags         ${tag}
// @Accept       json
// @Produce      json
// @Param        id    path   string          true "${singularEntity} ID" format(uuid)
// @Param        input body   ${name}Request  true "${singularEntity} data"
// @Success      200 {object} usecases.${name}Output
// @Failure      400 {object} errors.AppError
// @Failure      404 {object} errors.AppError
// @Router       ${path} [put]
func (c *${name}Controller) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[${name}Request](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	output, err := c.handler.Execute(r.Context(), usecases.${name}Input{
		ID:       req.ID,
		TenantID: req.TenantID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	httputil.RespondJSON(w, http.StatusOK, output)
}
`
	},

	// ── Controller: Delete ──────────────────────────────────────────────
	controllerDelete(contextName: string, name: string, path: string): string {
		const tag = toPascalCase(contextName)
		const { entity } = extractVerbEntity(name)
		const singularEntity = singularize(entity)
		const lowerEntity = singularEntity.toLowerCase()
		return `package controllers

import (
	"net/http"

	"${GO_MODULE}/internal/shared/middleware"
	"${GO_MODULE}/internal/shared/types"
	"${GO_MODULE}/internal/${contextName}/usecases"
	"${GO_MODULE}/pkg/httputil"
)

type ${name}Request struct {
	ID string \`from:"param" name:"id" validate:"required,uuid"\`
}

type ${name}Controller struct {
	handler *usecases.${name}Handler
}

func New${name}Controller(handler *usecases.${name}Handler) *${name}Controller {
	return &${name}Controller{handler: handler}
}

func (c *${name}Controller) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Path:        "${path}",
		Method:      "DELETE",
		Description: "Delete a ${lowerEntity}",
		Tags:        []string{"${tag}"},
		Middlewares:  []types.Middleware{middleware.Auth},
	}
}

// @Summary      Delete a ${lowerEntity}
// @Tags         ${tag}
// @Produce      json
// @Param        id path string true "${singularEntity} ID" format(uuid)
// @Success      204
// @Failure      404 {object} errors.AppError
// @Router       ${path} [delete]
func (c *${name}Controller) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[${name}Request](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	_, err = c.handler.Execute(r.Context(), usecases.${name}Input{
		ID: req.ID,
	})
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
`
	},

	// ── Controller: Generic ─────────────────────────────────────────────
	controllerGeneric(contextName: string, name: string, method: string, path: string): string {
		const tag = toPascalCase(contextName)
		const upperMethod = method.toUpperCase()
		const snakeName = toSnakeCase(name)
		const { entity } = extractVerbEntity(name)
		const singularEntity = singularize(entity)
		const lowerEntity = singularEntity.toLowerCase()
		const needsId = path.includes('{id}')
		const needsBody = ['POST', 'PUT', 'PATCH'].includes(upperMethod)

		const requestFields: string[] = []
		if (needsId) {
			requestFields.push(`\tID string \`from:"param" name:"id" validate:"required,uuid"\``)
		}
		requestFields.push(`\tTenantID string \`from:"ctx" name:"tenantId" validate:"required"\``)
		if (needsBody) {
			requestFields.push(`\t// TODO: Add body fields`)
		}

		const inputFields: string[] = []
		if (needsId) {
			inputFields.push(`\t\tID:       req.ID,`)
		}
		inputFields.push(`\t\tTenantID: req.TenantID,`)

		const acceptLine = needsBody ? '\n// @Accept       json' : ''
		const paramLines: string[] = []
		if (needsId) {
			paramLines.push(`// @Param        id path string true "${singularEntity} ID" format(uuid)`)
		}
		if (needsBody) {
			paramLines.push(`// @Param        input body ${name}Request true "${singularEntity} data"`)
		}
		const paramBlock = paramLines.length > 0 ? `\n${paramLines.join('\n')}` : ''

		const statusCode = upperMethod === 'DELETE' ? 'http.StatusNoContent' : 'http.StatusOK'
		const successCode = upperMethod === 'DELETE' ? '204' : '200'
		const successAnnotation =
			upperMethod === 'DELETE' ? `// @Success      ${successCode}` : `// @Success      ${successCode} {object} usecases.${name}Output`

		const respondBlock =
			upperMethod === 'DELETE'
				? `\t_, err = c.handler.Execute(r.Context(), usecases.${name}Input{
${inputFields.join('\n')}
\t})
\tif err != nil {
\t\thttputil.RespondError(w, err)
\t\treturn
\t}

\tw.WriteHeader(http.StatusNoContent)`
				: `\toutput, err := c.handler.Execute(r.Context(), usecases.${name}Input{
${inputFields.join('\n')}
\t})
\tif err != nil {
\t\thttputil.RespondError(w, err)
\t\treturn
\t}

\thttputil.RespondJSON(w, ${statusCode}, output)`

		return `package controllers

import (
	"net/http"

	"${GO_MODULE}/internal/shared/middleware"
	"${GO_MODULE}/internal/shared/types"
	"${GO_MODULE}/internal/${contextName}/usecases"
	"${GO_MODULE}/pkg/httputil"
)

type ${name}Request struct {
${requestFields.join('\n')}
}

type ${name}Controller struct {
	handler *usecases.${name}Handler
}

func New${name}Controller(handler *usecases.${name}Handler) *${name}Controller {
	return &${name}Controller{handler: handler}
}

func (c *${name}Controller) Metadata() types.ControllerMetadata {
	return types.ControllerMetadata{
		Path:        "${path}",
		Method:      "${upperMethod}",
		Description: "${name}",
		Tags:        []string{"${tag}"},
		Middlewares:  []types.Middleware{middleware.Auth},
	}
}

// @Summary      ${name}
// @Tags         ${tag}${acceptLine}
// @Produce      json${paramBlock}
// ${successAnnotation}
// @Failure      400 {object} errors.AppError
// @Router       ${path} [${method.toLowerCase()}]
func (c *${name}Controller) Handle(w http.ResponseWriter, r *http.Request) {
	req, err := httputil.DecodeRequest[${name}Request](r)
	if err != nil {
		httputil.RespondError(w, err)
		return
	}

${respondBlock}
}
`
	},
}

// ---------------------------------------------------------------------------
// Component generators registry
// ---------------------------------------------------------------------------

const componentGenerators: Record<
	string,
	(
		contextName: string,
		componentName: string,
		options: any,
	) =>
		| {
				targetPath: string
				template: string
				fileName: string
		  }
		| {
				targetPath: string
				template: string
				fileName: string
		  }[]
> = {
	entity: (contextName, componentName) => ({
		targetPath: join('api', 'internal', contextName, 'entities'),
		template: templates.entity(contextName, componentName),
		fileName: `${toSnakeCase(componentName)}.go`,
	}),

	enum: (contextName, componentName) => ({
		targetPath: join('api', 'internal', contextName, 'enums'),
		template: templates.enum(contextName, componentName),
		fileName: `${toSnakeCase(componentName)}.go`,
	}),

	'error-codes': contextName => ({
		targetPath: join('api', 'internal', contextName, 'errors'),
		template: templates.errorCodes(contextName),
		fileName: 'errors.go',
	}),

	event: (contextName, componentName) => ({
		targetPath: join('api', 'internal', contextName, 'events'),
		template: templates.event(contextName, componentName),
		fileName: `${toSnakeCase(componentName)}.go`,
	}),

	handler: (contextName, componentName) => ({
		targetPath: join('api', 'internal', contextName, 'handlers'),
		template: templates.handler(contextName, componentName),
		fileName: `${toSnakeCase(componentName)}.go`,
	}),

	repository: (contextName, componentName) => {
		const snakeEntity = toSnakeCase(componentName)
		const repoDir = join('api', 'internal', contextName, 'repositories', snakeEntity)
		return [
			{
				targetPath: repoDir,
				template: templates.repositoryInterface(contextName, componentName),
				fileName: `${snakeEntity}_repository.go`,
			},
			{
				targetPath: repoDir,
				template: templates.repositoryMemory(contextName, componentName),
				fileName: `${snakeEntity}_memory.go`,
			},
		]
	},

	usecase: (contextName, componentName) => {
		const lowerName = componentName.toLowerCase()
		let template: string
		if (lowerName.startsWith('create')) {
			template = templates.usecaseCreate(contextName, componentName)
		} else if (lowerName.startsWith('list') || lowerName.startsWith('fetch')) {
			template = templates.usecaseList(contextName, componentName)
		} else {
			template = templates.usecaseGeneric(contextName, componentName)
		}
		return {
			targetPath: join('api', 'internal', contextName, 'usecases'),
			template,
			fileName: `${toSnakeCase(componentName)}.go`,
		}
	},

	controller: (contextName, componentName, options) => {
		const method = options?.method || inferHttpMethod(componentName)
		const path = options?.path || inferPath(componentName, contextName)
		const lowerName = componentName.toLowerCase()

		let template: string
		if (lowerName.startsWith('create')) {
			template = templates.controllerCreate(contextName, componentName, path)
		} else if (lowerName.startsWith('list') || lowerName.startsWith('fetch')) {
			template = templates.controllerList(contextName, componentName, path)
		} else if (lowerName.startsWith('get')) {
			template = templates.controllerGet(contextName, componentName, path)
		} else if (lowerName.startsWith('update')) {
			template = templates.controllerUpdate(contextName, componentName, path)
		} else if (lowerName.startsWith('delete') || lowerName.startsWith('remove')) {
			template = templates.controllerDelete(contextName, componentName, path)
		} else {
			template = templates.controllerGeneric(contextName, componentName, method, path)
		}
		return {
			targetPath: join('api', 'internal', contextName, 'controllers'),
			template,
			fileName: `${toSnakeCase(componentName)}.go`,
		}
	},
}

// ---------------------------------------------------------------------------
// File generator
// ---------------------------------------------------------------------------

async function generateComponent(result: { targetPath: string; template: string; fileName: string }) {
	const fullDir = join(process.cwd(), result.targetPath)
	const fullPath = join(fullDir, result.fileName)

	// Check if file already exists
	try {
		await access(fullPath)
		console.error(`Error: File already exists: ${result.targetPath}/${result.fileName}`)
		process.exit(1)
	} catch {
		// File doesn't exist, proceed
	}

	await mkdir(fullDir, { recursive: true })
	await writeFile(fullPath, result.template)
	console.log(`  + ${result.targetPath}/${result.fileName}`)
}

// ---------------------------------------------------------------------------
// Auto-wiring into module.go
// ---------------------------------------------------------------------------

type WireType = 'controller' | 'usecase' | 'repository' | 'handler'

async function wireToModule(
	contextName: string,
	wireType: WireType,
	componentName: string,
	/** Only used for repository wiring – the entity name (PascalCase) */
	entityName?: string,
) {
	const modulePath = join(process.cwd(), 'api', 'internal', contextName, 'module.go')
	let content = await readFile(modulePath, 'utf-8')

	// ── Determine what to insert ──────────────────────────────────────
	let newImports: string[] = []
	let marker = ''
	let insertion = ''
	let insertAfterMarker = true // true = insert line(s) AFTER the marker; false = insert BEFORE

	switch (wireType) {
		case 'controller': {
			newImports = [`\t"${GO_MODULE}/internal/${contextName}/controllers"`, `\t"${GO_MODULE}/internal/shared/types"`]
			marker = '// Domain event handlers'
			insertAfterMarker = false // insert BEFORE this marker
			insertion = `\tfx.Provide(
\t\tfx.Annotate(
\t\t\tcontrollers.New${componentName}Controller,
\t\t\tfx.As(new(types.Controller)),
\t\t\tfx.ResultTags(\`group:"controllers"\`),
\t\t),
\t),\n`
			break
		}
		case 'usecase': {
			newImports = [`\t"${GO_MODULE}/internal/${contextName}/usecases"`]
			marker = '// Use cases'
			insertAfterMarker = true
			insertion = `\tfx.Provide(usecases.New${componentName}Handler),`
			break
		}
		case 'repository': {
			const entity = entityName ?? componentName
			const snakeEntity = toSnakeCase(entity)
			newImports = [`\t${snakeEntity}repo "${GO_MODULE}/internal/${contextName}/repositories/${snakeEntity}"`]
			marker = '// Repositories'
			insertAfterMarker = true
			insertion = `\tfx.Provide(
\t\tfx.Annotate(
\t\t\t${snakeEntity}repo.NewMemory${entity}Repository,
\t\t\tfx.As(new(${snakeEntity}repo.${entity}Repository)),
\t\t),
\t),`
			break
		}
		case 'handler': {
			newImports = [`\t"${GO_MODULE}/internal/${contextName}/handlers"`]
			marker = '// Register domain event handlers here'
			insertAfterMarker = true
			insertion = `\tm.Register(handlers.New${componentName}Handler())`
			break
		}
	}

	// ── Add imports (if not already present) ──────────────────────────
	for (const imp of newImports) {
		const trimmedImp = imp.trim()
		if (!content.includes(trimmedImp)) {
			// Insert before the closing ")" of the import block
			const importCloseIdx = content.indexOf('\n)\n')
			if (importCloseIdx !== -1) {
				content = `${content.slice(0, importCloseIdx)}\n${imp}${content.slice(importCloseIdx)}`
			}
		}
	}

	// ── Insert the registration / invocation ──────────────────────────
	const markerIdx = content.indexOf(marker)
	if (markerIdx === -1) {
		console.error(`Warning: Could not find marker "${marker}" in module.go – skipping auto-wire.`)
		return
	}

	if (insertAfterMarker) {
		// Insert after the full marker line
		const endOfMarkerLine = content.indexOf('\n', markerIdx)
		if (endOfMarkerLine === -1) {
			content += `\n${insertion}\n`
		} else {
			content = `${content.slice(0, endOfMarkerLine)}\n${insertion}${content.slice(endOfMarkerLine)}`
		}
	} else {
		// Insert BEFORE the marker line (find the start of that line)
		const lineStart = content.lastIndexOf('\n', markerIdx - 1)
		// We want to insert our block before the marker's line, adding a blank line after
		content = `${content.slice(0, lineStart)}\n${insertion}${content.slice(lineStart)}`
	}

	await writeFile(modulePath, content)
	console.log(`  ~ module.go updated (${wireType}: ${componentName})`)
}

// ---------------------------------------------------------------------------
// Context generator (Task 2)
// ---------------------------------------------------------------------------

async function generateFullContext(contextName: string) {
	const basePath = join(process.cwd(), 'api', 'internal', contextName)

	console.log(`Creating context structure: ${contextName}`)

	// Subdirectories to create (all empty for now)
	const dirs = ['controllers', 'entities', 'enums', 'errors', 'events', 'handlers', 'repositories', 'usecases']

	for (const dir of dirs) {
		const dirPath = join(basePath, dir)
		await mkdir(dirPath, { recursive: true })
		console.log(`  + ${dir}/`)
	}

	// module.go
	const moduleContent = `package ${contextName}

import (
	"go.uber.org/fx"

	"${GO_MODULE}/internal/shared/services/mediator"
)

var Module = fx.Module("${contextName}",
	// Repositories

	// Use cases

	// Controllers

	// Domain event handlers
	fx.Invoke(registerDomainEventHandlers),
)

func registerDomainEventHandlers(m mediator.InternalMediator) {
	// Register domain event handlers here
}
`

	await writeFile(join(basePath, 'module.go'), moduleContent)
	console.log('  + module.go')

	console.log(`\nContext "${contextName}" created successfully at api/internal/${contextName}/`)
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function showHelp() {
	console.log(`
Go Code Generator CLI

USAGE:
  bun run api/scripts/cli.ts <command> [options]

COMMANDS:
  context <name>                                    Generate full context directory structure
  entity <context> <name>                           Generate entity
  enum <context> <name>                             Generate enum
  error-codes <context>                             Generate error codes
  event <context> <name>                            Generate domain event
  handler <context> <name>                          Generate event handler
  repository <context> <name>                       Generate repository (interface + memory)
  usecase <context> <name>                          Generate use case
  controller <context> <name> [options]             Generate controller

OPTIONS:
  --help, -h                                        Show this help message
  --method, -m <method>                             HTTP method (get, post, put, patch, delete, head, ws, sse)
  --path, -p <path>                                 URL path (must start with /)

GENERATED STRUCTURE (context):
  api/internal/<context>/
  ├── controllers/
  ├── entities/
  ├── enums/
  ├── errors/
  ├── events/
  ├── handlers/
  ├── repositories/
  ├── usecases/
  └── module.go

EXAMPLES:
  bun run api/scripts/cli.ts context orders
  bun run api/scripts/cli.ts entity orders Order
  bun run api/scripts/cli.ts enum orders OrderStatus
  bun run api/scripts/cli.ts error-codes orders
  bun run api/scripts/cli.ts event orders OrderCreated
  bun run api/scripts/cli.ts handler orders OrderCreated
  bun run api/scripts/cli.ts repository orders Order
  bun run api/scripts/cli.ts usecase orders CreateOrder
  bun run api/scripts/cli.ts usecase orders ListOrders
  bun run api/scripts/cli.ts controller orders CreateOrder
  bun run api/scripts/cli.ts controller orders CreateOrder --method post --path /orders
  bun run api/scripts/cli.ts controller orders GetOrder
  bun run api/scripts/cli.ts controller orders UpdateOrder
  bun run api/scripts/cli.ts controller orders DeleteOrder
`)
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

const commandHandlers: Record<string, () => Promise<void>> = {
	context: async () => {
		if (!args[1]) {
			console.error('Error: Context name is required')
			console.error('  Usage: context <name>')
			process.exit(1)
		}
		const contextName = args[1]

		const exists = await contextExists(contextName)
		if (exists) {
			console.error(`Error: Context "${contextName}" already exists at api/internal/${contextName}`)
			process.exit(1)
		}

		await generateFullContext(contextName)
	},

	entity: async () => {
		const { positional } = parseFlags(args.slice(1))
		const contextName = positional[0]
		const componentName = positional[1]

		if (!contextName || !componentName) {
			console.error('Error: Context and entity name are required')
			console.error('  Usage: entity <context> <name>')
			process.exit(1)
		}

		if (!(await contextExists(contextName))) {
			console.error(`Error: Context "${contextName}" does not exist. Run "context ${contextName}" first.`)
			process.exit(1)
		}

		console.log(`Generating entity: ${componentName} in ${contextName}`)
		const result = componentGenerators.entity!(contextName, componentName, {})
		await generateComponent(result as { targetPath: string; template: string; fileName: string })
		console.log('Done!')
	},

	enum: async () => {
		const { positional } = parseFlags(args.slice(1))
		const contextName = positional[0]
		const componentName = positional[1]

		if (!contextName || !componentName) {
			console.error('Error: Context and enum name are required')
			console.error('  Usage: enum <context> <name>')
			process.exit(1)
		}

		if (!(await contextExists(contextName))) {
			console.error(`Error: Context "${contextName}" does not exist. Run "context ${contextName}" first.`)
			process.exit(1)
		}

		console.log(`Generating enum: ${componentName} in ${contextName}`)
		const result = componentGenerators.enum!(contextName, componentName, {})
		await generateComponent(result as { targetPath: string; template: string; fileName: string })
		console.log('Done!')
	},

	'error-codes': async () => {
		const { positional } = parseFlags(args.slice(1))
		const contextName = positional[0]

		if (!contextName) {
			console.error('Error: Context name is required')
			console.error('  Usage: error-codes <context>')
			process.exit(1)
		}

		if (!(await contextExists(contextName))) {
			console.error(`Error: Context "${contextName}" does not exist. Run "context ${contextName}" first.`)
			process.exit(1)
		}

		console.log(`Generating error codes in ${contextName}`)
		const result = componentGenerators['error-codes']!(contextName, '', {})
		await generateComponent(result as { targetPath: string; template: string; fileName: string })
		console.log('Done!')
	},

	event: async () => {
		const { positional } = parseFlags(args.slice(1))
		const contextName = positional[0]
		const componentName = positional[1]

		if (!contextName || !componentName) {
			console.error('Error: Context and event name are required')
			console.error('  Usage: event <context> <name>')
			process.exit(1)
		}

		if (!(await contextExists(contextName))) {
			console.error(`Error: Context "${contextName}" does not exist. Run "context ${contextName}" first.`)
			process.exit(1)
		}

		console.log(`Generating event: ${componentName} in ${contextName}`)
		const result = componentGenerators.event!(contextName, componentName, {})
		await generateComponent(result as { targetPath: string; template: string; fileName: string })
		console.log('Done!')
	},

	handler: async () => {
		const { positional } = parseFlags(args.slice(1))
		const contextName = positional[0]
		const componentName = positional[1]

		if (!contextName || !componentName) {
			console.error('Error: Context and handler name are required')
			console.error('  Usage: handler <context> <name>')
			process.exit(1)
		}

		if (!(await contextExists(contextName))) {
			console.error(`Error: Context "${contextName}" does not exist. Run "context ${contextName}" first.`)
			process.exit(1)
		}

		console.log(`Generating handler: ${componentName} in ${contextName}`)
		const result = componentGenerators.handler!(contextName, componentName, {})
		await generateComponent(result as { targetPath: string; template: string; fileName: string })
		await wireToModule(contextName, 'handler', componentName)
		console.log('Done!')
	},

	repository: async () => {
		const { positional } = parseFlags(args.slice(1))
		const contextName = positional[0]
		const componentName = positional[1]

		if (!contextName || !componentName) {
			console.error('Error: Context and entity name are required')
			console.error('  Usage: repository <context> <name>')
			process.exit(1)
		}

		if (!(await contextExists(contextName))) {
			console.error(`Error: Context "${contextName}" does not exist. Run "context ${contextName}" first.`)
			process.exit(1)
		}

		console.log(`Generating repository: ${componentName} in ${contextName}`)
		const results = componentGenerators.repository!(contextName, componentName, {})
		if (Array.isArray(results)) {
			for (const result of results) {
				await generateComponent(result)
			}
		} else {
			await generateComponent(results as { targetPath: string; template: string; fileName: string })
		}
		await wireToModule(contextName, 'repository', componentName)
		console.log('Done!')
	},

	usecase: async () => {
		const { positional } = parseFlags(args.slice(1))
		const contextName = positional[0]
		const componentName = positional[1]

		if (!contextName || !componentName) {
			console.error('Error: Context and usecase name are required')
			console.error('  Usage: usecase <context> <name>')
			process.exit(1)
		}

		if (!(await contextExists(contextName))) {
			console.error(`Error: Context "${contextName}" does not exist. Run "context ${contextName}" first.`)
			process.exit(1)
		}

		console.log(`Generating usecase: ${componentName} in ${contextName}`)
		const result = componentGenerators.usecase!(contextName, componentName, {})
		await generateComponent(result as { targetPath: string; template: string; fileName: string })
		await wireToModule(contextName, 'usecase', componentName)
		console.log('Done!')
	},

	controller: async () => {
		const { positional, flags } = parseFlags(args.slice(1))
		const contextName = positional[0]
		const componentName = positional[1]

		if (!contextName || !componentName) {
			console.error('Error: Context and controller name are required')
			console.error('  Usage: controller <context> <name> [--method <method>] [--path <path>]')
			process.exit(1)
		}

		if (!(await contextExists(contextName))) {
			console.error(`Error: Context "${contextName}" does not exist. Run "context ${contextName}" first.`)
			process.exit(1)
		}

		const options: { method?: string; path?: string } = {}
		if (flags.method || flags.m) {
			options.method = validateHttpMethod(flags.method || flags.m)
		}
		if (flags.path || flags.p) {
			options.path = validatePath(flags.path || flags.p)
		}

		console.log(`Generating controller: ${componentName} in ${contextName}`)
		const result = componentGenerators.controller!(contextName, componentName, options)
		await generateComponent(result as { targetPath: string; template: string; fileName: string })
		await wireToModule(contextName, 'controller', componentName)
		console.log('Done!')
	},
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	if (!command || command === '--help' || command === '-h') {
		showHelp()
		return
	}

	try {
		const handler = commandHandlers[command]
		if (!handler) {
			console.error(`Error: Unknown command: ${command}`)
			console.error('Run with --help to see available commands.')
			process.exit(1)
		}
		await handler()
	} catch (error) {
		console.error('Error:', error)
		process.exit(1)
	}
}

main()
