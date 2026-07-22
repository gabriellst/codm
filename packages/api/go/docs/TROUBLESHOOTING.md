# Troubleshooting - Problemas Comuns e Soluções

> **Guia de resolução de problemas frequentes**

Este documento lista problemas comuns encontrados durante o desenvolvimento e suas soluções.

---

## 📋 Índice Rápido

1. [Problemas de Configuração](#problemas-de-configuração)
2. [Problemas com SDK](#problemas-com-sdk)
3. [Problemas com TanStack Router](#problemas-com-tanstack-router)
4. [Problemas de TypeScript](#problemas-de-typescript)
5. [Problemas com Query Keys](#problemas-com-query-keys)
6. [Problemas com Controllers](#problemas-com-controllers)
7. [Problemas de Build/Lint](#problemas-de-buildlint)
8. [Problemas de Validação](#problemas-de-validação)

---

## ⚙️ Problemas de Configuração

### ❌ Backend não inicia - Erro de variáveis de ambiente

**Sintomas:**
- Erro: `Environment variable X is not defined`
- Backend falha ao iniciar
- Erro de conexão com banco de dados

**Causa:** Arquivo `.env` não existe ou está incompleto

**Solução:**

```bash
# 1. Verificar se .env existe
ls -la .env

# 2. Se não existir, criar a partir do exemplo
cp .env.example .env

# 3. Verificar diferenças
diff .env.example .env

# 4. Reiniciar o backend
cd api
bun run dev
```

### ❌ Banco de dados não conecta

**Sintomas:**
- Erro: `Cannot connect to database`
- Migrações falham
- Queries não executam

**Causa:** URL do banco incorreta ou banco não iniciado

**Solução:**

```bash
# 1. Verificar .env
cat .env | grep DATABASE_URL

# 2. Se usando Docker, iniciar Postgres
docker-compose up -d postgres

# 3. Rodar migrações
bun migrate
```

---

## 🔧 Problemas com SDK

### ❌ SDK não gera ou está vazia

**Sintomas:**
- `bun sdk` completa mas não gera arquivos
- Pasta `client/src/app/` vazia ou desatualizada
- Hooks não disponíveis no import

**Causas Comuns:**
1. Backend não está rodando
2. Controller não registrado em `module.go` do contexto
3. Módulo não registrado em `api/cmd/api/main.go`

**Soluções:**

```bash
# 1. Verificar se backend está rodando
bun dev:backend
# Deve mostrar: "Server running on http://localhost:3030"

# 2. Verificar api/internal/<contexto>/module.go
# Deve ter o controller em fx.Annotate com group:"controllers"

# 3. Verificar api/cmd/api/main.go
# Deve ter o fx.Module do contexto registrado

# 4. Gerar spec e SDK novamente
bun swag && bun sdk
```

### ❌ Tipos da SDK não sincronizam com backend

**Sintomas:**
- TypeScript reclama de propriedades faltando
- Tipos parecem desatualizados

**Solução:**

```bash
# 1. Parar o backend (Ctrl+C)
# 2. Reiniciar o backend
bun dev:backend

# 3. Em outro terminal — regenerar spec e SDK
bun swag
rm -rf client/src/app/*
bun sdk
```

---

## 🛣️ Problemas com TanStack Router

### ❌ Route não reconhecida - Type error

**Sintomas:**
```typescript
// Erro: Argument of type '"/todo/"' is not assignable to parameter of type '"/(index)/"'
export const Route = createFileRoute('/todo/')({
```

**Causa:** `routeTree.gen.ts` não foi gerado ou está desatualizado

**Solução:**

```bash
cd app
bun tsr generate
```

### ❌ useSearch() não funciona

**Sintomas:**
- `Route.useSearch() is not a function`
- `Cannot read property 'useSearch' of undefined`

**Causa:** Route não foi definida antes do componente

**Solução:**

```typescript
// ❌ ERRADO: Componente antes da Route
function ExamplePage() {
	const search = Route.useSearch() // ❌ Route não existe ainda
}

export const Route = createFileRoute('/example/')({
	component: ExamplePage,
})

// ✅ CORRETO: Route antes do componente
export const Route = createFileRoute('/example/')({
	component: ExamplePage,
})

function ExamplePage() {
	const search = Route.useSearch() // ✅ Route já existe
}
```

### ❌ Search params não validam

**Sintomas:**
- Search params chegam como `any`
- Validação não acontece

**Causa:** `validateSearch` não configurado

**Solução:**

```typescript
// ❌ ERRADO: Sem validateSearch
export const Route = createFileRoute('/example/')({
	component: ExamplePage,
})

// ✅ CORRETO: Com validateSearch
import { listExampleQueryParamsSchema } from '@monorepo/sdk/app'

export const Route = createFileRoute('/example/')({
	validateSearch: search => listExampleQueryParamsSchema.parse(search),
	errorComponent: () => <div>Parâmetros Incorretos</div>,
	component: ExamplePage,
})
```

---

## 🔤 Problemas de TypeScript

### ❌ "Cannot find module '@monorepo/sdk/app'"

**Causa:** SDK não foi gerada

**Solução:**

```bash
cd api
bun run dev

# Em outro terminal
cd ..
bun sdk
```

### ❌ "Property 'items' does not exist on type..."

**Sintomas:**
- Tipos da SDK parecem incorretos
- Propriedades esperadas não existem

**Causa:** SDK desatualizada ou OutputSchema incorreto no controller

**Solução:**

```bash
# 1. Verificar OutputSchema no controller
# Deve ter a estrutura correta com examples

# 2. Re-gerar SDK
cd api && bun run dev
cd .. && bun sdk

# 3. Verificar em client/src/app/types/
```

### ❌ "Type 'X' is not assignable to type 'Y'"

**Causa:** Tipo inferido incorretamente

**Solução:**

```typescript
// ✅ CORRETO: Inferência com [number]
type Todo = ListTodo200['items'][number]
```

---

## 🔑 Problemas com Query Keys

### ❌ Cache não invalida após mutation

**Sintomas:**
- Dados não atualizam após criar/editar/deletar
- Precisa dar refresh manual

**Causa:** Query key incorreta ou não está invalidando

**Solução:**

```typescript
// ❌ ERRADO: String hardcoded
await queryClient.invalidateQueries({ queryKey: ['listTodo'] })

// ✅ CORRETO: Função da SDK
import { listTodoQueryKey } from '@monorepo/sdk/app'
await queryClient.invalidateQueries({ queryKey: listTodoQueryKey() })
```

### ❌ "listTodoQueryKey is not a function"

**Causa:** SDK gerada sem funções de query key

**Solução:**

```bash
# Re-gerar SDK com versão atualizada
bun update
bun sdk
```

---

## 🎮 Problemas com Controllers

### ❌ Endpoint não aparece no Swagger

**Causas Comuns:**
1. Controller não registrado em `module.go` do contexto
2. Módulo não registrado em `api/cmd/api/main.go`
3. Erro de compilação no controller

**Soluções:**

```bash
# 1. Verificar api/internal/<contexto>/module.go
# Deve ter o controller em:
# fx.Annotate(controllers.NewHelloWorldController,
#     fx.As(new(types.Controller)),
#     fx.ResultTags(`group:"controllers"`))

# 2. Verificar api/cmd/api/main.go
# Deve ter o fx.Module do contexto registrado

# 3. Verificar compilação
go build ./cmd/api/

# 4. Reiniciar backend e regenerar spec
bun dev:backend
bun swag
```

### ❌ Validação de query params não funciona

**Sintomas:**
- Query params ignorados ou chegam com valor zero
- Erros de validação inesperados

**Causa:** Struct tags incorretas ou ausentes no request struct

**Solução:**

```go
// ❌ ERRADO: sem tag from:"query"
type ListRequest struct {
    Page  int  // nunca preenchido da URL
    Limit int
}

// ✅ CORRETO: struct tags corretas
type ListRequest struct {
    Page  int `from:"query" name:"page"  validate:"omitempty,min=1"`
    Limit int `from:"query" name:"limit" validate:"omitempty,min=1,max=100"`
}
```

### ❌ Endpoint retorna erro 500

**Sintomas:**
- Endpoint compila mas retorna 500
- Log mostra "error code not registered"

**Causa:** Código de erro não registrado no `init()` do contexto

**Solução:**

```go
// api/internal/<contexto>/errors/errors.go
func init() {
    errors.RegisterErrorCodes(map[errors.ErrorCode]int{
        CodeYourError: http.StatusBadRequest,  // adicionar o código faltante
    })
}
```

---

## 🏗️ Problemas de Build/Lint

### ❌ Build falha com "cannot find package"

**Causa:** Import path incorreto no Go

**Solução:**

```go
// ❌ ERRADO: Import path relativo ou incorreto
import "../shared/entities"

// ✅ CORRETO: Import path completo com module name
import "monorepo/api/internal/shared/entities"

// Verificar module name em api/go.mod:
// module monorepo/api
```

### ❌ Lint falha com "Unused variable"

**Sintomas:**
- `'isSubmitting' is declared but its value is never read`

**Solução:**

```typescript
// ❌ ERRADO: Variável declarada mas não usada
<form.Subscribe selector={state => [state.canSubmit, state.isSubmitting]}>
	{([canSubmit, isSubmitting]) => (
		<Button disabled={!canSubmit}> {/* isSubmitting não usado */}
			Submit
		</Button>
	)}
</form.Subscribe>

// ✅ CORRETO: Remover variável não usada
<form.Subscribe selector={state => [state.canSubmit]}>
	{([canSubmit]) => (
		<Button disabled={!canSubmit}>
			Submit
		</Button>
	)}
</form.Subscribe>
```

---

## ✅ Problemas de Validação

### ❌ Form validation não funciona

**Sintomas:**
- Validação não acontece em tempo real
- Erros não aparecem

**Causa:** Schema Zod no lugar errado ou validação explícita

**Solução:**

```typescript
// ❌ ERRADO: Parse manual no onSubmit
const form = useForm({
	onSubmit: async ({ value }) => {
		const parsed = schema.parse(value) // ❌ Validação apenas no submit
		await mutateAsync({ data: parsed })
	},
})

// ✅ CORRETO: Schema no validators
const form = useForm({
	validators: {
		onChange: createTodoMutationRequestSchema, // ✅ Validação em tempo real
	},
	onSubmit: async ({ value }) => {
		try {
			const parsed = createTodoMutationRequestSchema.parse(value)
			await mutateAsync({ data: parsed })
		} catch (error) {
			console.error('Validation error:', error)
		}
	},
})
```

### ❌ validateSearch causa crash na rota

**Sintomas:**
- Página não carrega
- Erro: "ZodError: Invalid input"

**Causa:** Search params inválidos mas sem `errorComponent`

**Solução:**

```typescript
// ❌ ERRADO: Sem errorComponent
export const Route = createFileRoute('/example/')({
	validateSearch: search => schema.parse(search), // ❌ Crash se inválido
	component: ExamplePage,
})

// ✅ CORRETO: Com errorComponent
export const Route = createFileRoute('/example/')({
	validateSearch: search => schema.parse(search),
	errorComponent: () => <div>Parâmetros Incorretos</div>, // ✅ Trata erro
	component: ExamplePage,
})
```

---

## 🔍 Debugging Tips

### 1. Verificar arquivo .env

```bash
# Verificar se .env existe
ls -la .env

# Se não existir, criar a partir do exemplo
cp .env.example .env
```

### 2. Verificar se backend está respondendo

```bash
# Testar endpoint diretamente
curl http://localhost:3030/example
```

### 3. Verificar OpenAPI gerada

```bash
# Ver arquivo gerado (swagger spec)
cat api/docs/swagger.json | grep -A 10 "example"

# Acessar Swagger UI
# http://localhost:3030/v1/shared/internal/docs
```

### 4. Verificar SDK gerada

```bash
# Listar hooks gerados
ls -la client/src/app/hooks/

# Ver tipo específico
cat client/src/app/types/ListTodo.ts
```

### 5. Limpar cache e rebuild

```bash
# Backend
cd api
rm -rf node_modules
bun install

# Frontend
cd app
rm -rf node_modules
bun install
```

---

## 📞 Quando Pedir Ajuda

Se após tentar todas as soluções o problema persistir:

1. ✅ Verifique todos os checklists em [DEVELOPMENT.md](./DEVELOPMENT.md)
2. ✅ Leia a documentação relevante ([BACKEND.md](./backend/BACKEND.md), [FRONTEND.md](./frontend/FRONTEND.md))
3. ✅ Verifique se seguiu a ordem correta de implementação
4. ✅ Confirme que todos os comandos CLI foram executados
5. ✅ Verifique os logs do backend e frontend

**Informações úteis para reportar:**
- Mensagem de erro completa
- Código do componente/controller
- Logs do console
- Versão do Node/Bun
- Passos que levaram ao erro

---

## 🎯 Checklist de Resolução

Use este checklist ao encontrar um problema:

```
[ ] Li a mensagem de erro completa
[ ] Verifiquei se o arquivo .env existe e está configurado
[ ] Verifiquei se o backend está rodando
[ ] Verifiquei se a SDK foi gerada
[ ] Verifiquei se o routeTree foi gerado (frontend)
[ ] Tentei limpar cache e reinstalar
[ ] Verifiquei os logs do console
[ ] Consultei a documentação relevante
[ ] Verifiquei se segui as regras críticas
[ ] Tentei as soluções listadas neste documento
```

---

## 🆘 Comandos de Emergência

### Reset Completo

```bash
# ⚠️ Último recurso - reset completo

# 1. Verificar .env
ls -la .env || cp .env.example .env

# 2. Backend — recompilar
cd api
go build ./cmd/api/
bun dev:backend

# 3. Frontend
cd ../app
rm -rf node_modules
bun install
bun tsr generate
bun run dev

# 4. SDK — regenerar spec e SDK
cd ..
bun swag
rm -rf client/src/app/*
bun sdk
```

### Verificar Integridade

```bash
# Type check completo
bun tsc

# Lint completo
cd bun lint

# Build completo
cd bun run build
```

---

**Problema não listado aqui?** Adicione ao documento após resolver para ajudar outros desenvolvedores!

