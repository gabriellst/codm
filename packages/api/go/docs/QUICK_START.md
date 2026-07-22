# Quick Start - Primeiros Passos

> **Comece a desenvolver em 15 minutos**

Este guia te leva do zero ao primeiro endpoint e tela funcionando em tempo recorde.

---

## 📋 Pré-requisitos

```bash
bun --version   # >= 1.0
```

---

## 🚀 Configuração Inicial (5 minutos)

### 1. Configurar Variáveis de Ambiente

```bash
# Copiar arquivo de exemplo
cp .env.example .env

# Editar .env com suas configurações (opcional)
# Para desenvolvimento local, o padrão geralmente funciona
```

### 2. Instalar Dependências

```bash
# Na raiz do projeto
bun install

# Verificar se instalou corretamente
bun lint
```

### 3. Iniciar Servidores

```bash
# Terminal
bun dev
```

**Verificar:**
- ✅ Back e Front rodando em `http://localhost:3030`
- ✅ Swagger disponível em `http://localhost:3030/v1/shared/internal/docs`

---

## 🎯 Seu Primeiro Endpoint (10 minutos)

Vamos criar um endpoint completo usando o contexto `example` que já existe.

### Passo 1: Criar o Controller

```bash
# Na raiz do projeto
bun cli controller example HelloWorld --method get --path /example/hello
```

### Passo 2: Editar o Controller

Abra `api/internal/example/controllers/helloworld.go` e configure:

```go
package controllers

import (
	"net/http"
	"time"

	"monorepo/api/pkg/httputil"
)

// HelloWorldRequest defines query parameters
type HelloWorldRequest struct {
	Name string `from:"query" name:"name" validate:"omitempty"`
}

// HelloWorldResponse defines the response
type HelloWorldResponse struct {
	Message   string `json:"message"`
	Timestamp string `json:"timestamp"`
}

type HelloWorldController struct{}

func NewHelloWorldController() *HelloWorldController {
	return &HelloWorldController{}
}

// Handle godoc
// @Summary Say hello to someone
// @Description Returns a greeting message
// @Tags example
// @Accept json
// @Produce json
// @Param name query string false "Name to greet"
// @Success 200 {object} HelloWorldResponse
// @Router /example/hello [get]
func (c *HelloWorldController) Handle(w http.ResponseWriter, r *http.Request) {
	var req HelloWorldRequest
	if err := httputil.DecodeRequest(r, &req); err != nil {
		httputil.WriteError(w, err)
		return
	}

	name := req.Name
	if name == "" {
		name = "World"
	}

	httputil.WriteJSON(w, http.StatusOK, HelloWorldResponse{
		Message:   "Hello, " + name + "!",
		Timestamp: time.Now().Format(time.RFC3339),
	})
}
```

### Passo 3: Verificar registro em module.go

O CLI auto-registra o controller em `api/internal/example/module.go`. Verifique se o `fx.Annotate` está presente:

```go
fx.Provide(
    fx.Annotate(
        controllers.NewHelloWorldController,
        fx.As(new(types.Controller)),
        fx.ResultTags(`group:"controllers"`),
    ),
),
```

### Passo 4: Gerar SDK

```bash
# Backend já deve estar rodando
bun dev:backend

# Em outro terminal na raiz — gerar spec e SDK:
bun swag
bun sdk
```

### Passo 5: Testar no Swagger

Abra `http://localhost:3030/v1/shared/internal/docs` e teste o endpoint `GET /example/hello`

✅ **Pronto! Seu primeiro endpoint está funcionando!**

---

## 🎨 Sua Primeira Tela (10 minutos)

Vamos criar uma tela que usa o endpoint que acabamos de criar.

### Passo 1: Criar Estrutura de Pastas

```bash
cd app
mkdir -p src/routes/hello/-types
mkdir -p src/routes/hello/-components
```

### Passo 2: Criar a Rota

Crie `app/src/routes/hello/index.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useHelloWorld } from '@monorepo/sdk/app'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/hello/')({
	component: HelloPage,
})

function HelloPage() {
	const [name, setName] = useState('')
	const { data, refetch, isLoading } = useHelloWorld({
		params: { name },
	})

	const handleGreet = () => {
		refetch()
	}

	return (
		<div className="container mx-auto py-8 max-w-md">
			<Card>
				<CardHeader>
					<CardTitle>Hello World</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<label className="text-sm font-medium">Seu nome:</label>
						<Input
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Digite seu nome..."
						/>
					</div>
					
					<Button onClick={handleGreet} disabled={isLoading}>
						{isLoading ? 'Carregando...' : 'Dizer Olá'}
					</Button>

					{data && (
						<div className="p-4 bg-blue-50 rounded border border-blue-200">
							<p className="text-lg font-bold text-blue-900">
								{data.message}
							</p>
							<p className="text-xs text-gray-500 mt-2">
								{new Date(data.timestamp).toLocaleString()}
							</p>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	)
}
```

### Passo 3: Gerar RouteTree

```bash
# No diretório app
bun tsr generate
```

### Passo 4: Testar no Navegador

Abra `http://localhost:3030/hello`

✅ **Pronto! Sua primeira tela está funcionando!**

---

## 🎓 Próximos Passos

Agora que você tem o básico funcionando, explore:

### 1. Criar Feature Completa

Siga o fluxo completo em [WORKFLOW.md](./WORKFLOW.md):
- Backend: Erros → Controller → Entities → Use Cases → Repositories
- Frontend: Tipos → Componentes → Página

### 2. Entender a Arquitetura

Leia na ordem:
1. [DEVELOPMENT.md](./DEVELOPMENT.md) - Regras críticas e fluxo
2. [backend/BACKEND.md](./backend/BACKEND.md) - Padrões backend
3. [frontend/FRONTEND.md](./frontend/FRONTEND.md) - Padrões frontend

### 3. Implementar CRUD Completo

Use como exemplo:
```bash
# Criar contexto
bun cli context product

# Criar erros em api/internal/product/errors/errors.go
# Criar controllers (Create, List, Get, Update, Delete)
bun cli controller product CreateProduct
bun cli controller product ListProduct --method get
bun cli controller product GetProduct --method get
bun cli controller product UpdateProduct --method put
bun cli controller product DeleteProduct --method delete

# Gerar spec e SDK
bun swag && bun sdk

# Implementar frontend
```

---

## 🔍 Comandos Essenciais

### Backend

```bash
# Na raiz do projeto

# Criar contexto
bun cli context <nome>

# Criar controller
bun cli controller <contexto> <nome>

# Criar use case
bun cli usecase <contexto> <nome>

# Criar evento
bun cli event <contexto> <nome>

# Rodar servidor backend
bun dev:backend

# Gerar spec OpenAPI + SDK
bun swag
bun sdk
```

### Frontend

```bash
cd app

# Gerar routeTree após criar rotas
bun tsr generate

# Rodar dev server
bun run dev

# Type check
bun tsc
```

### SDK

```bash
# Na raiz, com backend rodando
bun sdk
```

---

## 🐛 Problemas Comuns

### SDK não gera

**Causa:** Backend não está rodando ou controller não registrado em module.go

**Solução:**
```bash
# 1. Verificar se backend está rodando
bun dev:backend

# 2. Verificar api/internal/<contexto>/module.go — controller registrado?
# 3. Gerar spec e SDK
bun swag && bun sdk
```

### RouteTree não atualiza

**Causa:** Não rodou `bun tsr generate`

**Solução:**
```bash
cd app
bun tsr generate
```

### Tipos não sincronizam

**Causa:** SDK desatualizada

**Solução:**
```bash
# Re-gerar spec e SDK
bun dev:backend   # em um terminal
bun swag && bun sdk  # em outro terminal
```

---

## 📚 Documentação Completa

### Por Área

**Gestão:**
- [WORKFLOW.md](./WORKFLOW.md) - Fluxo completo (16 etapas)
- [MANAGING.md](./MANAGING.md) - Metodologia ágil
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Tasks → Código

**Backend:**
- [backend/BACKEND.md](./backend/BACKEND.md) - Implementação backend

**Frontend:**
- [frontend/FRONTEND.md](./frontend/FRONTEND.md) - Implementação frontend
- [ui/COMPONENTS.md](./ui/COMPONENTS.md) - Componentes primitivos

**Troubleshooting:**
- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Problemas comuns

---

## ✅ Checklist do Iniciante

```
[ ] Arquivo .env criado (cp .env.example .env)
[ ] Dependências instaladas (bun install)
[ ] Backend e Frontend rodando (http://localhost:3030)
[ ] Swagger acessível (http://localhost:3030/v1/shared/internal/docs)
[ ] Primeiro endpoint criado e testado
[ ] Primeira tela criada e testada
[ ] SDK gerada com sucesso
[ ] RouteTree atualizado
[ ] Li DEVELOPMENT.md (regras críticas)
```

---

**Pronto para começar?** Escolha uma feature e siga [WORKFLOW.md](./WORKFLOW.md)!

