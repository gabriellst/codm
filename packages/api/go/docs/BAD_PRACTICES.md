# Bad Practices Guide

> **Padrões proibidos e violações identificadas no projeto**

Este documento lista práticas proibidas que devem ser evitadas em todo o codebase. Organizado do mais fundamental ao mais específico.

---

## Filosofia de Revisão

A padronização de código, tipagem coesa, e correta direção de dependências fazem com que o sistema possa ser mantido de forma saudável. É preciso seguir os fundamentos, mas também ser pragmático.

### Fundamento 1: Frontend é Interface do Backend

O frontend é **apenas uma interface** para o backend. Isso implica:

| Responsabilidade | Backend | Frontend |
|------------------|---------|----------|
| Regras de negócio | ✅ Dono | ❌ Nunca |
| Definição de enums | ✅ Cria | ✅ Importa da SDK |
| Schemas de entrada/saída | ✅ Define | ✅ Usa via SDK |
| Filtragem/computação de dados | ✅ Processa | ❌ Apenas exibe |
| Validação de domínio | ✅ Valida | ✅ Usa schema da SDK |

**Direção de dependência:**
```
Frontend ──depends on──► SDK ──generated from──► Backend

❌ NUNCA: Backend depends on Frontend
❌ NUNCA: Frontend define tipos que backend deveria definir
```

### Fundamento 2: Padronização de Código

Uma mesma coisa pode ser escrita de formas diferentes, mas **um padrão deve ser mantido**:

| Elemento | Padrão Único |
|----------|--------------|
| Formulários | TanStack Form + schema da SDK |
| Listagem de itens | Componente recebe array via props |
| Busca de dados | Hooks da SDK (`useList*`, `useGet*`) |
| Estado de URL | `Route.useSearch()` + `validateSearch` |
| Estado interativo | Zustand stores em `-stores/` |
| Navegação simples | `<Link>` component |
| Ícones | `@tabler/icons-react` |
| Loading states | `<Spinner />` + Skeleton components |

---

## Índice

1. [Arquitetura - Fundamentos](#arquitetura---fundamentos)
2. [Backend - Regras Gerais](#backend---regras-gerais)
3. [Backend - Controllers](#backend---controllers)
4. [Backend - Enums e Tipos](#backend---enums-e-tipos)
5. [Frontend - Direção de Dependências](#frontend---direção-de-dependências)
6. [Frontend - SDK e Tipagem](#frontend---sdk-e-tipagem)
7. [Frontend - Componentes (React)](#frontend---componentes-react)
8. [Frontend - Estado (Zustand + URL)](#frontend---estado-zustand--url)
9. [Frontend - Rotas (TanStack Router)](#frontend---rotas-tanstack-router)
10. [Frontend - Forms (TanStack Form)](#frontend---forms-tanstack-form)
11. [Cross-Cutting - Contratos, Fluxo e Convenções](#cross-cutting---contratos-fluxo-e-convenções)

---

## Arquitetura - Fundamentos

### BP-001: Orquestrar múltiplas chamadas de API no frontend

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO - Múltiplas chamadas para montar dashboard
const { data: dashboardData } = useListPatientAppointments({ params: todayRange })
const { data } = useListPatients({ params: queryParams })
const { data: totalData } = useListPatients({ params: { page: 1, limit: 1 } })

// Depois computa no frontend:
const appointmentsToday = appointments.filter(...)
```

**Por quê:** Frontend não deve orquestrar dados. Crie um endpoint único no backend.

```typescript
// ✅ CORRETO - Endpoint único que retorna tudo
const { data } = useListPatientsDashboard({ params: search })
// data contém: patients[], total, appointmentsToday[], stats
```

---

### BP-002: Falta endpoint dedicado para dashboard

**Severidade:** 🔴 Crítico

**Problema:** Frontend faz 3 chamadas separadas para montar uma única tela.

**Solução:** Criar endpoint único `GET /patients/dashboard` como query use case com acesso direto ao sqlc.

---

### BP-003: Nomes de campos inconsistentes entre endpoints

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Mesma entidade, nomes diferentes entre endpoints
// ListPatients retorna:
type ListPatientsItem struct {
    PatientName  string `json:"patientName"`
    PatientPhone string `json:"patientPhone"`
}

// GetPatientDetails retorna:
type PatientDetails struct {
    FullName string `json:"fullName"`
    Phone    string `json:"phone"`
}
```

**Por quê:** Mesma entidade deve ter mesmos nomes de campo em todos endpoints.

```go
// ✅ CORRETO - Padronizar nomes
type PatientItem struct {
    FullName string `json:"fullName"`
    Phone    string `json:"phone"`
}
// Todos endpoints usam os mesmos nomes para os mesmos campos
```

---

### BP-004: Naming de hook não reflete operação

**Severidade:** 🔵 Moderado

```typescript
// ❌ EVITAR - "List" implica múltiplos, mas retorna um
useListPatientDetails({ id: patientId })  // Retorna UM paciente
```

```typescript
// ✅ CORRETO - Nome reflete operação
useGetPatientDetails({ id: patientId })  // "Get" para singular
useListPatients({ params })              // "List" para múltiplos
```

---

### BP-005: Confusão entre Consultation e Appointment

**Severidade:** 🔴 Crítico

**Problema:** Backend armazena como `Consultation` com status em português, SDK expõe como `Appointment` com status em inglês.

**Solução:**
1. Decidir: `Consultation` ou `Appointment`?
2. Migrar status para inglês: `PENDING`, `SCHEDULED`, `COMPLETED`, `CANCELLED`
3. Remover mapeamentos duplicados

---

## Backend - Regras Gerais

### BP-006: ErrorCodes não definidos quando existem validações de domínio

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Contexto tem entidades com value objects que validam,
// mas errors/errors.go não define ErrorCodes correspondentes

// Patient tem Email, CPF, Phone, Address... mas errors.go está vazio ou incompleto
```

```go
// ✅ CORRETO - Definir todos os ErrorCodes do contexto
// internal/<context>/errors/errors.go
package errors

import sharedErrors "monorepo/api/internal/shared/errors"

const (
    PatientNotFound      sharedErrors.ErrorCode = "PATIENT_NOT_FOUND"
    InvalidPatientName   sharedErrors.ErrorCode = "INVALID_PATIENT_NAME"
    InvalidPatientEmail  sharedErrors.ErrorCode = "INVALID_PATIENT_EMAIL"
    InvalidPatientCPF    sharedErrors.ErrorCode = "INVALID_PATIENT_CPF"
    InvalidPatientPhone  sharedErrors.ErrorCode = "INVALID_PATIENT_PHONE"
    InvalidPatientAddress sharedErrors.ErrorCode = "INVALID_PATIENT_ADDRESS"
)

func init() {
    sharedErrors.RegisterErrorCodes(map[sharedErrors.ErrorCode]int{
        PatientNotFound:      404,
        InvalidPatientName:   422,
        InvalidPatientEmail:  422,
        InvalidPatientCPF:    422,
        InvalidPatientPhone:  422,
        InvalidPatientAddress: 422,
    })
}
```

---

### BP-007: Command use cases com acesso direto ao banco / Query use cases usando repository

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Command use case acessando sqlc queries diretamente
type CreatePatientHandler struct {
    queries *db.Queries  // ❌ Acesso direto ao sqlc no command use case!
}

// ❌ PROIBIDO - Query use case usando repository ao invés de sqlc direto
type ListPatientsHandler struct {
    repo patientrepo.PatientRepository  // ❌ Repository no query use case!
}
```

**Por quê:**
1. **Command use cases** (escrita) devem usar **repositories** para persistência
2. **Query use cases** (leitura) devem usar **sqlc queries diretamente** para otimizar leitura
3. Query use cases podem fazer joins entre contextos diferentes
4. Endpoints de leitura não devem retornar shapes de entidades de domínio

```go
// ✅ CORRETO - Command use case usa repository
type CreatePatientHandler struct {
    repo patientrepo.PatientRepository
    uow  unitofwork.UnitOfWork
}

// ✅ CORRETO - Query use case usa sqlc diretamente
type ListPatientsDashboardHandler struct {
    queries *db.Queries
}

func (h *ListPatientsDashboardHandler) Execute(ctx context.Context, input ListPatientsDashboardInput) (ListPatientsDashboardOutput, error) {
    // Pode fazer joins, projections, agregações otimizadas para a UI
    rows, err := h.queries.ListPatientsDashboard(ctx, db.ListPatientsDashboardParams{
        TenantID: input.TenantID,
        Limit:    input.Limit,
        Offset:   input.Offset,
    })
    // ...
}
```

---

### BP-008: Duplicar lógica de query em command use cases E query use cases

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - MESMA QUERY SQL em dois arquivos!

// internal/patient/usecases/list_patient_appointments.go
rows, err := h.queries.ListPatientAppointments(ctx, params)

// internal/ui/usecases/list_patient_appointments.go
rows, err := h.queries.ListPatientAppointments(ctx, params)  // DUPLICADO!
```

**Por quê:** Se BP-007 for seguido, isso não acontece. Queries de leitura devem estar APENAS em query use cases.

---

### BP-009: Duplicar mapeamento de enums em múltiplos arquivos

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - MESMO MAPA em dois arquivos!

// internal/patient/usecases/list_appointments.go
var consultationToAppointment = map[string]enums.AppointmentStatus{
    "Aguardando": enums.AppointmentStatusPending,
    "Agendado":   enums.AppointmentStatusScheduled,
}

// internal/ui/usecases/list_appointments.go
var consultationToAppointment = map[string]enums.AppointmentStatus{
    "Aguardando": enums.AppointmentStatusPending,
    "Agendado":   enums.AppointmentStatusScheduled,
}  // DUPLICADO!
```

```go
// ✅ CORRETO - Centralizar em shared/enums ou shared/objects
// internal/shared/enums/appointment_status.go
var ConsultationToAppointmentStatus = map[string]AppointmentStatus{
    "Aguardando": AppointmentStatusPending,
    "Agendado":   AppointmentStatusScheduled,
    "Concluída":  AppointmentStatusCompleted,
    "Cancelada":  AppointmentStatusCancelled,
}
```

---

### BP-010: Filtrar dados em memória após buscar do banco

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Busca tudo do banco e filtra em Go!
rows, err := h.queries.ListAppointments(ctx, db.ListAppointmentsParams{
    TenantID: input.TenantID,
})

// Depois filtra em memória...
var filtered []Appointment
for _, row := range rows {
    if strings.Contains(strings.ToLower(row.PatientName), strings.ToLower(input.Search)) {
        filtered = append(filtered, row)
    }
}
```

**Por quê:** Filtragem deve ser feita no SQL para performance. O banco é otimizado para isso.

```go
// ✅ CORRETO - Filtro na query SQL (sqlc)
// queries/appointments.sql
-- name: ListAppointments :many
SELECT * FROM appointments
WHERE tenant_id = $1
  AND ($2::text = '' OR patient_name ILIKE '%' || $2 || '%')
ORDER BY scheduled_date DESC
LIMIT $3 OFFSET $4;
```

---

### BP-011: Usar bibliotecas externas de data/hora desnecessariamente no backend

**Severidade:** 🔵 Moderado

```go
// ❌ EVITAR - Biblioteca externa quando stdlib resolve
import "github.com/some/date-lib"

formatted := datelib.Format(t, "yyyy-MM-dd")
```

**Por quê:** Go tem `time` package nativo que é completo para formatação e manipulação de datas.

```go
// ✅ CORRETO - Usar time package nativo
formatted := t.Format("2006-01-02")           // ISO date
formatted := t.Format(time.RFC3339)            // Full ISO
formatted := t.Format("02/01/2006 15:04:05")   // Custom format
```

---

## Backend - Controllers

### BP-012: Validação manual redundante no controller

**Severidade:** 🔵 Moderado

```go
// ❌ EVITAR - Validação manual quando httputil.DecodeRequest já valida
func (c *CreatePatientController) Handle(w http.ResponseWriter, r *http.Request) {
    var input CreatePatientInput
    if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
        httputil.RespondError(w, err)
        return
    }
    // Validação manual redundante
    if input.Name == "" {
        httputil.RespondError(w, errors.NewAppError(errors.BadRequest, "name is required"))
        return
    }
}
```

**Por quê:** `httputil.DecodeRequest[T]` já decodifica e valida via `validate` tags automaticamente.

```go
// ✅ CORRETO - DecodeRequest faz decode + validação
func (c *CreatePatientController) Handle(w http.ResponseWriter, r *http.Request) {
    input, err := httputil.DecodeRequest[CreatePatientInput](r)
    if err != nil {
        httputil.RespondError(w, err)
        return
    }
    // input já está validado
}
```

---

### BP-013: Retornar resposta vazia ou ignorar erro silenciosamente

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Ignora erro e retorna vazio
result, err := h.Execute(ctx, input)
if err != nil {
    w.WriteHeader(http.StatusBadRequest)
    return  // Sem corpo de erro!
}
```

```go
// ✅ CORRETO - Usar RespondError que mapeia via GlobalErrorMapper
result, err := h.Execute(ctx, input)
if err != nil {
    httputil.RespondError(w, err)
    return
}
httputil.RespondJSON(w, http.StatusOK, result)
```

---

## Backend - Enums e Tipos

### BP-014: Valores de enum inline ou usando iota

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Valores inline como string literal
status := "PENDING"

// ❌ PROIBIDO - Usar iota para enums que viram JSON
type OrderStatus int
const (
    OrderStatusPending OrderStatus = iota
    OrderStatusCompleted
)
```

**Por quê:**
1. Enums devem ser typed string constants em `enums/` package
2. `iota` não serializa como string no JSON
3. Valores devem ser SCREAMING_SNAKE_CASE

```go
// ✅ CORRETO - Typed string constants
// internal/<context>/enums/order_status.go
package enums

type OrderStatus string

const (
    OrderStatusPending   OrderStatus = "PENDING"
    OrderStatusScheduled OrderStatus = "SCHEDULED"
    OrderStatusCompleted OrderStatus = "COMPLETED"
    OrderStatusCancelled OrderStatus = "CANCELLED"
)
```

**Regra:** Sem métodos `IsValid()`, `String()`, etc. Validação via `validate:"oneof=..."` tag nos DTOs.

---

### BP-015: Type assertion inseguro sem verificação

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Type assertion sem check
event := rawEvent.(events.DomainEvent[OrderCreatedPayload])
```

```go
// ✅ CORRETO - Type assertion com ok check
event, ok := rawEvent.(events.DomainEvent[OrderCreatedPayload])
if !ok {
    return nil // ou retornar erro
}
```

---

### BP-016: Magic strings como fallback

**Severidade:** 🔵 Moderado

```go
// ❌ EVITAR - String literal
specialty := row.Specialty
if specialty == "" {
    specialty = "GENERAL_PRACTICE"
}
```

```go
// ✅ CORRETO - Usar constante do enum
specialty := row.Specialty
if specialty == "" {
    specialty = string(enums.SpecialtyGeneralPractice)
}
```

---

## Frontend - Direção de Dependências

### BP-017: Usar `date-fns` para lógica de negócio no frontend

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO - Lógica de negócio com date-fns no frontend
import { isSameDay } from 'date-fns'

const todayList = appointments.filter(apt => isSameDay(new Date(apt.startDate), today))
const pendingList = appointments.filter(apt => apt.appointmentStatus === 'PENDING')
```

**Por quê:** Filtragem é lógica de negócio que deve estar no backend.

```typescript
// ✅ CORRETO - Backend retorna dados já filtrados
const { data } = useListPatientsDashboard({ params: { startDate, endDate } })
// data.appointmentsToday já vem filtrado do backend
```

**Nota:** `date-fns` PODE ser usado para **formatação de exibição**:
```typescript
// ✅ PERMITIDO - Formatação para exibição
import { format } from 'date-fns'
<span>{format(appointment.startDate, 'dd/MM/yyyy')}</span>
```

---

### BP-018: Componente busca dados ao invés de receber via props

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO - Componente fazendo fetch
export function PatientEditPage() {
  const { data: patient } = useListPatientDetails({ id: patientId })
}
```

**Por quê:** Per FRONTEND.md - apenas Pages fazem fetch. Componentes recebem dados via props.

```typescript
// ✅ CORRETO
interface PatientEditPageProps {
  patient: ListPatientDetails200
}

export function PatientEditPage({ patient }: PatientEditPageProps) {
  // Usa dados recebidos via props
}
```

---

## Frontend - SDK e Tipagem

### BP-019: Re-exportar schemas da SDK desnecessariamente

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO
export { listPatientsQueryParamsSchema }
```

```typescript
// ✅ CORRETO - Importar diretamente da SDK
import { listPatientsQueryParamsSchema } from '@monorepo/sdk/app'
```

---

### BP-020: Criar tipos locais que deveriam vir da SDK

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO - Tipo local duplicando SDK
export type PatientStatus = 'ativo' | 'inativo' | 'novo' | 'cancelado'
```

```typescript
// ✅ CORRETO - Importar da SDK
import { patientStatusEnumEnum, type PatientStatusEnum } from '@monorepo/sdk/app'
```

---

### BP-021: Criar interface local ao invés de inferir da SDK

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO
interface ConsultationItem {
  readonly scheduledDate: string
  readonly service: string
  readonly status: string
}
```

```typescript
// ✅ CORRETO - Inferir da SDK
import type { ListPatientDetails200 } from '@monorepo/sdk/app'

type ConsultationItem = ListPatientDetails200['consultations'][number]
```

---

### BP-022: Type assertion para acessar campos que não existem no tipo

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO
const updatedAt = (patient as { updatedAt?: string }).updatedAt
```

**Por quê:** Se o campo é necessário, deve estar no tipo da SDK.

---

### BP-023: Hardcodar tabs/options ao invés de usar enums da SDK

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO
const tabs = [
  { id: 'todos', label: 'Todos' },
  { id: 'recentes', label: 'Recentes' },
]
```

```typescript
// ✅ CORRETO - Usar enum da SDK
import { patientTabEnum } from '@monorepo/sdk/app'

const tabs = Object.entries(patientTabEnum).map(([key, value]) => ({
  id: value,
  label: tabLabels[value],
}))
```

---

### BP-024: Hardcodar STATUS_OPTIONS quando enum existe na SDK

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO
const STATUS_OPTIONS = [
  { value: 'Aguardando', label: 'Aguardando confirmação' },
] as const
```

```typescript
// ✅ CORRETO - Usar enum da SDK
import { appointmentStatusEnumEnum } from '@monorepo/sdk/app'

const STATUS_OPTIONS = Object.entries(appointmentStatusEnumEnum).map(([key, value]) => ({
  value,
  label: statusLabels[value],
}))
```

---

### BP-025: `Record<string, string>` ao invés de enum tipado

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO - Sem type safety
const statusLabels: Record<string, string> = {
  PENDING: 'Aguardando confirmação',
}
```

```typescript
// ✅ CORRETO - Tipado com enum
import { type AppointmentStatusEnum } from '@monorepo/sdk/app'

const statusLabels: Record<AppointmentStatusEnum, string> = {
  [appointmentStatusEnumEnum.PENDING]: 'Aguardando confirmação',
  // ...
}
```

---

### BP-026: Duplicar mapeamento de status em múltiplos arquivos

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO - Mesmo mapeamento em arquivos diferentes
// PatientsAppointmentsList.tsx
const statusLabels = { PENDING: '...', SCHEDULED: '...' }

// PatientConsultationHistory.tsx
const STATUS_LABELS = { Aguardando: '...', Agendado: '...' }  // Chaves diferentes!
```

```typescript
// ✅ CORRETO - Centralizar em @/lib/labels.ts
export const appointmentStatusLabels: Record<AppointmentStatusEnum, string> = { ... }
```

---

## Frontend - Componentes (React)

### BP-027: Falta de Skeleton components

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO - Apenas componente, sem skeleton
export function PatientsListSection({ ... }) { }
```

```typescript
// ✅ CORRETO - Exportar ambos
export function PatientsListSection({ ... }) { }
export function PatientsListSectionSkeleton() { }
```

---

### BP-028: Misturar bibliotecas de ícones

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO - Misturando lucide e tabler
import { Users } from 'lucide-react'        // Em um arquivo
import { IconPlus } from '@tabler/icons-react'    // Em outro arquivo
```

```typescript
// ✅ CORRETO - Usar apenas @tabler/icons-react (padrão do projeto)
import { IconUsers, IconPlus } from '@tabler/icons-react'
```

---

### BP-029: Usar index como parte da key em listas

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO
{patients.map((patient, index) => (
  <PatientCard key={`${patient.patientName}-${index}`} />
))}
```

```typescript
// ✅ CORRETO - Usar ID único
{patients.map(patient => (
  <PatientCard key={patient.id} patient={patient} />
))}
```

---

### BP-030: Duplicar funções utilitárias

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO - Mesma função em múltiplos arquivos
// PatientCard.tsx
function getAge(birthDate: string): number | null { ... }

// PatientEditPage.tsx
function getAge(birthDate: string): number | null { ... }  // Duplicada!
```

```typescript
// ✅ CORRETO - Centralizar em @/lib
export function getAge(birthDate: string): number | null { ... }
```

---

### BP-031: Duplicar `formatCpfForDisplay` que já existe em `@/lib`

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO
function formatCpfForDisplay(cpf: string): string { ... }
```

```typescript
// ✅ CORRETO
import { formatCpfForDisplay } from '@/lib'
```

---

### BP-032: Spinner customizado ao invés do componente padrão

**Severidade:** 🔵 Moderado

```typescript
// ❌ EVITAR
<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
```

```typescript
// ✅ CORRETO
import { Spinner } from '@/components/ui/spinner'
<Spinner className="size-8" />
```

---

### BP-033: Cores hardcoded ao invés de design tokens

**Severidade:** 🔵 Moderado

```typescript
// ❌ EVITAR
const colors = ['bg-blue-100', 'bg-purple-100', 'bg-pink-100', ...]
```

```typescript
// ✅ CORRETO - Usar tokens ou componentes do design system
import { Avatar } from '@/components/ui/avatar'
```

---

### BP-034: Duplicar componentes Footer em múltiplos arquivos

**Severidade:** 🔵 Moderado

```typescript
// ❌ EVITAR - Footer duplicado em cada form
// SignInForm.tsx
function SignInFooter() { ... }

// SignUpForm.tsx
function SignUpFooter() { ... }  // Praticamente idêntico!
```

```typescript
// ✅ CORRETO - Componente compartilhado
// @/components/auth/AuthFooter.tsx
export function AuthFooter() { ... }
```

---

### BP-066: Iterar enum inline no JSX ao invés de extrair constante no topo do módulo

**Severidade:** 🔵 Moderado

```typescript
// ❌ EVITAR - Iteração do enum inline no JSX com casting verboso
<TabsList>
  {(Object.keys(PatientListTabEnum) as Array<keyof typeof PatientListTabEnum>).map(key => {
    const value = PatientListTabEnum[key]
    return (
      <TabsTrigger key={value} value={value}>
        {patientListTabLabels[value as PatientListTab]}
      </TabsTrigger>
    )
  })}
</TabsList>
```

**Por quê:** Iteração inline polui o JSX com lógica de casting, é difícil de ler e repete a derivação a cada render. Extrair para uma constante no topo do módulo é mais limpo e performático.

```typescript
// ✅ CORRETO - Extrair constante no topo do módulo
const TABS = Object.values(PatientListTabEnum)

// No JSX, iteração limpa
<TabsList>
  {TABS.map(tab => (
    <TabsTrigger key={tab} value={tab}>
      {patientListTabLabels[tab]}
    </TabsTrigger>
  ))}
</TabsList>
```

**Regra:** Para qualquer iteração sobre enum da SDK, sempre extrair `const ITEMS = Object.values(Enum)` no topo do módulo (fora do componente).

---

### BP-067: Criar pasta centralizada de enums no frontend (`app/src/enums/`)

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO - Pasta centralizada de enums no frontend
app/src/enums/
├── CalendarView.ts
├── SomeOtherEnum.ts
└── index.ts
```

**Por quê:** Enums que pertencem ao **backend** devem vir da SDK (`@monorepo/sdk/app`). Enums que são **exclusivos do frontend** (ex: `CalendarView` para um widget de calendário) devem ser co-localizados com o componente que os utiliza primariamente.

```typescript
// ✅ CORRETO - Enum co-localizado no componente que o utiliza
// app/src/routes/(app)/dashboard/-components/.../ViewSelector/index.tsx
export enum CalendarView {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

// Outros componentes importam de lá
import { CalendarView } from './ViewSelector'
```

**Regra:**
- Enums de domínio → backend (`enums/` package) → consumidos via SDK
- Enums exclusivos de UI → co-localizados no componente que os define e utiliza primariamente

---

### BP-035: Componente sem pasta própria e index.tsx

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO - Componente como arquivo solto
-components/
├── PatientCard.tsx        // ❌ Arquivo solto
├── PatientList.tsx        // ❌ Arquivo solto
└── PatientForm.tsx        // ❌ Arquivo solto
```

**Por quê:** Per FRONTEND.md - cada componente tem sua própria pasta com `index.tsx` e subpasta `stories/`.

```typescript
// ✅ CORRETO - Cada componente em sua pasta
-components/
├── index.tsx              // Barrel export
├── PatientCard/
│   ├── index.tsx          // export function PatientCard() {...}
│   └── stories/
│       └── PatientCard.stories.tsx
├── PatientList/
│   ├── index.tsx
│   └── stories/
│       └── PatientList.stories.tsx
└── PatientForm/
    ├── index.tsx
    └── stories/
        └── PatientForm.stories.tsx
```

**Barrel export em `-components/index.tsx`:**
```typescript
export { PatientCard } from './PatientCard'
export { PatientList } from './PatientList'
export { PatientForm } from './PatientForm'
```

---

## Frontend - Estado (Zustand + URL)

### BP-036: Usar `useState` para estado que deve estar na URL

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO - Filtros em useState
const [page, setPage] = useState(1)
const [search, setSearch] = useState('')
```

**Por quê:** Filtros, paginação, ordenação devem estar na URL (search params).

```typescript
// ✅ CORRETO - Usar search params
const search = Route.useSearch()
const navigate = Route.useNavigate()

const updateFilters = (updates: Partial<typeof search>) => {
  navigate({ search: prev => ({ ...prev, ...updates }) })
}
```

---

### BP-037: Usar `useState` para estado interativo ao invés de Zustand

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO
const [createModalOpen, setCreateModalOpen] = useState(false)
```

```typescript
// ✅ CORRETO - Usar Zustand store
// -stores/usePatientsStore.ts
export const usePatientsStore = create<PatientsStore>((set) => ({
  createModalOpen: false,
  setCreateModalOpen: (open) => set({ createModalOpen: open }),
}))
```

---

### BP-038: `useEffect` complexo para sincronizar form com props

**Severidade:** 🔵 Moderado

```typescript
// ❌ EVITAR
useEffect(() => {
  if (patient) {
    form.setFieldValue('fullName', patient.fullName || '')
    // ... muitos campos
  }
}, [patient, form])
```

```typescript
// ✅ CORRETO - defaultValues computados
const form = useForm({
  defaultValues: patient ? mapPatientToFormValues(patient) : emptyFormValues,
})
```

---

## Frontend - Rotas (TanStack Router)

### BP-039: Criar searchSchema sem estender o schema da SDK

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO - Schema customizado sem base da SDK
const searchSchema = z.object({
  page: z.coerce.number().optional().default(1),
  search: z.string().optional(),
})
```

```typescript
// ✅ CORRETO - Estender schema da SDK
import { listPatientsQueryParamsSchema } from '@monorepo/sdk/app'

const searchSchema = z
  .object({
    tab: z.string().optional().default('todos'),
  })
  .and(listPatientsQueryParamsSchema)
```

---

### BP-040: Rota sem `errorComponent`

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO
export const Route = createFileRoute('/(app)/patients/$patientId/')({
  component: PatientEditPage,
})
```

```typescript
// ✅ CORRETO
export const Route = createFileRoute('/(app)/patients/$patientId/')({
  validateSearch: search => schema.parse(search),
  errorComponent: () => <ErrorMessage>Parâmetros inválidos</ErrorMessage>,
  component: PatientEditPage,
})
```

---

### BP-041: Construir queryParams manualmente

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO - Reconstrução manual
const queryParams = useMemo(() => ({
  page: search.page,
  limit: search.limit,
  sort: search.tab === 'recentes' ? ('recent' as const) : undefined,
}), [...])
```

```typescript
// ✅ CORRETO - Passar search diretamente
const { data } = useListPatients({ params: search })
```

---

### BP-042: Type hacks (`as const`, `as Type`)

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO
sort: search.tab === 'recentes' ? ('recent' as const) : undefined,
```

**Por quê:** Indica incompatibilidade entre tipos frontend e backend. Corrija na fonte.

---

### BP-043: Usar `useParams` em componentes ao invés de receber via props

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO
export function PatientEditPage() {
  const { patientId } = useParams({ from: '/(app)/patients/$patientId/' })
}
```

**Por quê:** Apenas Pages (index.tsx) devem acessar params. Componentes recebem via props.

---

### BP-044: Usar callback de navigate para navegação simples

**Severidade:** 🔵 Moderado

```typescript
// ❌ EVITAR
const handleEditPatient = useCallback((patient) => {
  navigate({ to: '/patients/$patientId', params: { patientId: patient.id } })
}, [navigate])
```

```typescript
// ✅ CORRETO - Link component
import { Link } from '@tanstack/react-router'

<Link to="/patients/$patientId" params={{ patientId: patient.id }}>
  Editar
</Link>
```

---

### BP-045: Usar `<a>` ao invés de `<Link>` para rotas internas

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO
<a href="/forgot-password">Esqueceu a senha?</a>
```

**Por quê:** `<a>` causa full page reload. `<Link>` usa client-side navigation.

```typescript
// ✅ CORRETO
import { Link } from '@tanstack/react-router'

<Link to="/forgot-password">Esqueceu a senha?</Link>
```

**Exceção:** Links externos (target="_blank") podem usar `<a>`.

---

## Frontend - Forms (TanStack Form)

### BP-046: Definir mask options inline ao invés de importar de `@/lib`

**Severidade:** 🔵 Moderado

```typescript
// ❌ EVITAR - Mask options definidos inline
const phoneMaskOptions: MaskitoOptions = {
  mask: ['(', /\d/, /\d/, ')', ' ', /\d/, /\d/, /\d/, /\d/, /\d/, '-', /\d/, /\d/, /\d/, /\d/],
}
```

```typescript
// ✅ CORRETO - Importar de @/lib
import { cpfMaskOptions, phoneMaskOptions } from '@/lib'

const phoneInputRef = useMaskito({ options: phoneMaskOptions })
```

---

### BP-047: Definir `getUnmaskedValue` inline

**Severidade:** 🔵 Moderado

```typescript
// ❌ EVITAR
const getUnmaskedValue = (value: string) => value.replace(/\D/g, '')
```

```typescript
// ✅ CORRETO
import { getUnmaskedValue } from '@/lib'
```

---

### BP-048: Confundir uso de `date-fns` para UI vs Negócio

**Severidade:** 🔴 Crítico

| Uso | Permitido? | Exemplo |
|-----|------------|---------|
| **Formatação para exibição** | ✅ Sim | `format(date, 'dd/MM/yyyy')` |
| **Cálculo de range para UI** | ✅ Sim | `startOfWeek(date)` para selecionar semana |
| **Filtrar dados do backend** | ❌ Não | `appointments.filter(...)` |
| **Computar estatísticas** | ❌ Não | `appointments.filter(...).length` |

**Regra:** Se afeta **quais dados são exibidos**, deve estar no backend.

---

### BP-049: Validators do form com lógica complexa de erro

**Severidade:** 🔵 Moderado

```typescript
// ❌ EVITAR - Lógica complexa
validators: {
  onSubmit: ({ value }) => {
    const result = schema.safeParse(value)
    if (!result.success) {
      const code = (first as any)?.params?.error ?? 'UNKNOWN'
      toast.error('Erro', { description: translateError(code) })
      return code
    }
  },
}
```

```typescript
// ✅ CORRETO - Schema direto
validators: {
  onSubmit: loginMutationRequestSchema,
}
```

---

## Cross-Cutting - Contratos, Fluxo e Convenções

### BP-050: DTOs sem tags `from:` para query/path params no Go backend

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Struct sem tags que indicam origem dos dados
type ListPatientsInput struct {
    Page   int    `json:"page"`
    Limit  int    `json:"limit"`
    Search string `json:"search"`
}
```

**Por quê:** `httputil.DecodeRequest[T]` usa tags `from:` para saber de onde decodificar cada campo.

```go
// ✅ CORRETO - Tags from: explícitas
type ListPatientsInput struct {
    TenantID string `from:"ctx" ctx:"tenantId"`
    Page     int    `from:"query" json:"page" validate:"min=1"`
    Limit    int    `from:"query" json:"limit" validate:"min=1,max=100"`
    Search   string `from:"query" json:"search"`
}

type GetPatientInput struct {
    ID string `from:"param" json:"id" validate:"required,uuid"`
}

type CreatePatientInput struct {
    Name  string `from:"body" json:"name" validate:"required"`
    Email string `from:"body" json:"email" validate:"required,email"`
}
```

---

### BP-051: Criar/chamar use case apenas para checar existência de entidade cross-context

**Severidade:** 🔴 Crítico

```go
// ❌ EVITAR - Overhead desnecessário para leitura simples
book, err := h.getBookHandler.Execute(ctx, GetBookInput{ID: input.BookID})
if err != nil {
    return output, err
}
```

```go
// ✅ CORRETO - Validação via repository read direto
book, err := h.bookRepo.FindByID(ctx, input.BookID)
if err != nil {
    return output, errors.NewAppError(bookErrors.BookNotFound, "book not found")
}
```

**Regra:** em `api`, para validações de negócio cross-context, prefira repository reads (`FindByID`, `FindBy*`). Não crie use cases pass-through apenas para checar existência.

---

### BP-052: Usar `fmt.Errorf` ou `errors.New` ao invés de `AppError`

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Erro sem código estruturado
return fmt.Errorf("patient not found")
return errors.New("invalid email format")
```

```go
// ✅ CORRETO - Usar AppError com ErrorCode
return sharedErrors.NewAppError(patientErrors.PatientNotFound, "patient not found")
return sharedErrors.NewAppError(patientErrors.InvalidPatientEmail, "invalid email format")
```

**Por quê:** `AppError` com `ErrorCode` permite mapeamento automático para HTTP status via `GlobalErrorMapper`. Erros sem código não são mapeáveis e resultam em 500 genérico.

---

### BP-053: Usar ErrorCode sem registrar no `GlobalErrorMapper`

**Severidade:** 🔴 Crítico

**Problema:** o ErrorCode existe no código, mas não possui mapeamento HTTP centralizado.

```go
// ❌ PROIBIDO - ErrorCode definida mas não registrada
const (
    OrderNotFound sharedErrors.ErrorCode = "ORDER_NOT_FOUND"
)
// Falta init() com RegisterErrorCodes!
```

```go
// ✅ CORRETO - Registrar na init()
func init() {
    sharedErrors.RegisterErrorCodes(map[sharedErrors.ErrorCode]int{
        OrderNotFound:      404,
        OrderAlreadyExists: 409,
        InvalidOrderStatus: 422,
    })
}
```

**Regra:** todo ErrorCode exposto por controller deve estar registrado via `init()` + `RegisterErrorCodes`.

---

### BP-054: Interface de repository com métodos genéricos desnecessários

**Severidade:** 🔵 Moderado

```go
// ❌ EVITAR - Métodos genéricos que não fazem sentido para o agregado
type OrderRepository interface {
    Save(ctx context.Context, order *entities.Order) error
    Delete(ctx context.Context, id string) error
    FindByID(ctx context.Context, id string) (*entities.Order, error)
    FindAll(ctx context.Context) ([]*entities.Order, error)        // ❌ Genérico demais
    Count(ctx context.Context) (int, error)                        // ❌ Genérico demais
    Update(ctx context.Context, order *entities.Order) error       // ❌ Save já cobre isso
}
```

```go
// ✅ CORRETO - Apenas métodos que o agregado realmente precisa
type OrderRepository interface {
    Save(ctx context.Context, order *entities.Order) error
    FindByID(ctx context.Context, id string) (*entities.Order, error)
    FindByTenantID(ctx context.Context, tenantID string, limit, offset int) ([]*entities.Order, error)
    Delete(ctx context.Context, id string) error
}
```

**Regra:** mantenha apenas métodos que o domínio realmente utiliza. Queries complexas ficam em query use cases com sqlc direto.

---

### BP-055: Reidratar entidade com `NewXxx()` factory ao invés de `Reconstruct()`

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - NewOrder() recria domain events e roda validações de criação
func (r *PgOrderRepository) FindByID(ctx context.Context, id string) (*entities.Order, error) {
    row, err := r.queries.GetOrder(ctx, id)
    // ...
    return entities.NewOrder(entities.NewOrderParams{  // ❌ Factory de criação!
        CustomerID: row.CustomerID,
        Amount:     row.Amount,
    })
}
```

```go
// ✅ CORRETO - Reconstruct preserva identidade/estado persistido sem domain events
func (r *PgOrderRepository) FindByID(ctx context.Context, id string) (*entities.Order, error) {
    row, err := r.queries.GetOrder(ctx, id)
    // ...
    return entities.ReconstructOrder(entities.ReconstructOrderParams{
        ID:        row.ID,
        CustomerID: row.CustomerID,
        Amount:    row.Amount,
        Status:    row.Status,
        CreatedAt: row.CreatedAt,
        UpdatedAt: row.UpdatedAt,
        Version:   row.Version,
    })
}
```

---

### BP-056: Publicar evento antes do commit da transação

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Evento publicado antes do commit
func (h *CreateOrderHandler) Execute(ctx context.Context, input CreateOrderInput) (CreateOrderOutput, error) {
    order, err := entities.NewOrder(...)
    h.mediator.Publish(ctx, order.PullDomainEvents()...)  // ❌ Antes do commit!

    err = h.uow.Execute(ctx, func(ctx context.Context) error {
        return h.repo.Save(ctx, order)
    })
}
```

```go
// ✅ CORRETO - Evento publicado APÓS uow.Execute (commit)
func (h *CreateOrderHandler) Execute(ctx context.Context, input CreateOrderInput) (CreateOrderOutput, error) {
    order, err := entities.NewOrder(...)

    events := order.PullDomainEvents()

    err = h.uow.Execute(ctx, func(ctx context.Context) error {
        return h.repo.Save(ctx, order)
    })
    if err != nil {
        return CreateOrderOutput{}, err
    }

    // Publicar APÓS commit
    for _, event := range events {
        h.mediator.Publish(ctx, event)
    }

    return CreateOrderOutput{ID: order.ID.String()}, nil
}
```

---

### BP-057: Criar contexto sem registrar fx.Module no bootstrap

**Severidade:** 🔴 Crítico

**Problema:** bounded context existe como pasta com controllers/usecases, mas fx.Module não está registrado em `cmd/api/main.go`. Controllers não entram no router e não aparecem na OpenAPI.

```go
// ❌ PROIBIDO - Module existe mas não está no main.go
// cmd/api/main.go
func main() {
    fx.New(
        shared.Module,
        // orders.Module,  // Esqueceu de adicionar!
    ).Run()
}
```

```go
// ✅ CORRETO - Todo novo contexto registrado no bootstrap
func main() {
    fx.New(
        shared.Module,
        orders.Module,
        customers.Module,
        fx.Invoke(startHTTPServer),
    ).Run()
}
```

---

### BP-058: Controller/handler criado mas não registrado no module.go

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Controller existe mas não está no fx.Module
// internal/orders/module.go
var Module = fx.Module("orders",
    fx.Provide(fx.Annotate(NewPgOrderRepo, fx.As(new(OrderRepository)))),
    // NewCreateOrderController não está registrado!
)
```

```go
// ✅ CORRETO - Todos controllers registrados com group:"controllers"
var Module = fx.Module("orders",
    fx.Provide(fx.Annotate(NewPgOrderRepo, fx.As(new(OrderRepository)))),
    fx.Provide(NewCreateOrderHandler),
    fx.Provide(fx.Annotate(NewCreateOrderController,
        fx.As(new(types.Controller)),
        fx.ResultTags(`group:"controllers"`),
    )),
    fx.Invoke(registerDomainEventHandlers),
)
```

**Regra:** sem registro no module.go, o controller/handler não participa do wiring e não funciona.

---

### BP-059: Usar SDK HTTP client dentro da própria API

**Severidade:** 🔴 Crítico

**Problema:** a API chama seus próprios endpoints via HTTP client, criando acoplamento circular e problemas de runtime.

**Regra:**
- Dentro da `api`, compor contextos via repositories, use cases e/ou eventos.
- SDK é para consumidores externos e frontend.

---

### BP-060: Validação de formatação no domínio/use case quando deveria estar no DTO

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Validação de formato no use case
func (h *CreatePatientHandler) Execute(ctx context.Context, input CreatePatientInput) (CreatePatientOutput, error) {
    if !emailRegex.MatchString(input.Email) {
        return CreatePatientOutput{}, errors.NewAppError(patientErrors.InvalidEmail, "invalid email")
    }
}
```

```go
// ✅ CORRETO - Validação de formato via validate tags no DTO
type CreatePatientInput struct {
    Email string `from:"body" json:"email" validate:"required,email"`
    Phone string `from:"body" json:"phone" validate:"required,e164"`
}
// httputil.DecodeRequest[T] valida automaticamente
```

**Regra:** validação de **formato** (email regex, UUID format, min/max length) fica nos DTOs via `validate` tags. Validação de **negócio** (saldo insuficiente, pedido já cancelado) fica no domínio.

---

### BP-061: Implementar domínio/use case antes de fechar contrato de controller

**Severidade:** 🔵 Moderado

**Problema:** frontend fica bloqueado e o contrato muda tardiamente.

**Regra:** feche primeiro contrato de entrada/saída no controller (Input/Output structs com swag annotations), gere SDK, depois evolua implementação interna.

---

### BP-062: Usar sufixo `UseCase` em nome de arquivo/struct

**Severidade:** 🟡 Baixo

```go
// ❌ EVITAR
// usecases/create_patient_use_case.go
type CreatePatientUseCase struct {}
```

```go
// ✅ CORRETO
// usecases/create_patient.go
type CreatePatientHandler struct {}
```

**Regra:** Use cases são handlers. Arquivo e struct seguem o padrão `<action>_<entity>.go` / `<Action><Entity>Handler`.

---

### BP-063: Usar tipo concreto ao invés de interface em consumers

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Depender do tipo concreto
type CreateOrderHandler struct {
    repo *PgOrderRepository           // ❌ Tipo concreto
    uow  *unitofwork.PgUnitOfWork     // ❌ Tipo concreto
    med  *mediator.ChannelMediator    // ❌ Tipo concreto
}
```

```go
// ✅ CORRETO - Depender de interfaces
type CreateOrderHandler struct {
    repo orderrepo.OrderRepository     // Interface
    uow  unitofwork.UnitOfWork         // Interface
    med  mediator.InternalMediator     // Interface
}
```

**Por quê:** interfaces permitem substituição em testes (mocks) e desacoplam implementação. fx.Annotate + fx.As cuida do binding.

---

### BP-064: Assumir assinatura de value object sem verificar construtor real

**Severidade:** 🔵 Moderado

**Problema:** instanciação incorreta gera bugs silenciosos e ids inválidos.

```go
// ❌ PROIBIDO - Assumir que ID aceita qualquer string
id := objects.ID(someString)  // Bypass do construtor!
```

```go
// ✅ CORRETO - Usar construtor validado
id, err := objects.IDFromUUID(someString)
if err != nil {
    return err
}
// ou
id := objects.NewID()  // Gera novo UUID
```

**Regra:** antes de instanciar VO compartilhado (ex.: `ID`, `Email`, `CPF`), verifique assinatura real no código-fonte e use o construtor correto.

---

### BP-068: Colocar write controllers (create/update/delete) no contexto `ui`

**Severidade:** 🔴 Crítico

**Problema:** controllers que mutam entidades de domínio (Create, Update, Delete) foram colocados no contexto `ui` ao invés do contexto que é dono da entidade.

O contexto `ui` é exclusivamente para queries de leitura (BFF) e estado exclusivo de UI (ex: onboarding). Write controllers devem viver no bounded context que é dono da entidade.

```go
// ❌ ERRADO - write controller no contexto ui
// internal/ui/controllers/create_service.go
type CreateServiceController struct { ... }
func (c *CreateServiceController) Metadata() types.ControllerMetadata {
    return types.ControllerMetadata{Path: "/services", Method: "POST"}
}
```

```go
// ✅ CORRETO - write controller no contexto que é dono da entidade
// internal/service/controllers/create_service.go
type CreateServiceController struct { ... }
func (c *CreateServiceController) Metadata() types.ControllerMetadata {
    return types.ControllerMetadata{Path: "/services", Method: "POST"}
}
```

**Regra:** write controllers (POST, PATCH, PUT, DELETE) sempre vivem no bounded context dono da entidade. O contexto `ui` só contém GET controllers para leitura/visualização.

---

### BP-069: Usar try/catch com handleApiError em mutations

**Severidade:** 🟡 Moderado

**Problema:** `MutationCache.onError` no QueryClient (`app/src/main.tsx`) já chama `handleApiError` globalmente para toda mutation que falha. Usar `try/catch` + `handleApiError` dentro de `onSubmit` duplica o tratamento de erro (toast aparece 2x) e adiciona código desnecessário.

**Regra:**
- **Form dialogs** (TanStack Form `onSubmit`): não usar try/catch. TanStack Form captura a exceção e `MutationCache.onError` exibe o toast de erro automaticamente.
- **Handlers sem form** (ex: delete dialogs): usar `tryCatchAsync` para evitar promise rejection, mas **nunca** chamar `handleApiError` manualmente — o MutationCache já faz isso.

```typescript
// ❌ ERRADO — Form dialog
onSubmit: async ({ value }) => {
  try {
    await mutateAsync({ data: value })
    toast.success(...)
  } catch (error) {
    handleApiError(error) // Duplicado! MutationCache já faz isso
  }
}

// ✅ CORRETO — Form dialog
onSubmit: async ({ value }) => {
  await mutateAsync({ data: value })
  toast.success(...)
  onOpenChange(false)
}

// ✅ CORRETO — Delete dialog (sem form)
const handleDelete = async () => {
  const result = await tryCatchAsync(() => mutateAsync({ id }))
  if (!result.success) return
  toast.success(...)
  onOpenChange(false)
}
```

---

### BP-070: Usar elementos HTML nativos quando existem primitivos no projeto

**Severidade:** 🟡 Moderado

**Problema:** usar `<select>`, `<input type="date">`, ou outros elementos nativos quando o projeto tem primitivos estilizados correspondentes (`Select`, `DatePicker`, `Calendar`, `Combobox`). Elementos nativos quebram a consistência visual e não seguem o design system.

**Regra:** sempre verificar `app/src/components/ui/` antes de usar elementos nativos. Primitivos disponíveis incluem:
- `Select` → substitui `<select>`
- `DatePicker` → substitui `<input type="date">`
- `Combobox` → substitui `<select>` com busca
- `Calendar` → substitui date pickers nativos

```typescript
// ❌ ERRADO
<select className="..." value={...} onChange={...}>
  <option value="">Selecione...</option>
</select>

// ✅ CORRETO
<Select items={items} value={value} onValueChange={onChange}>
  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
  <SelectContent>
    <SelectGroup>
      {items.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
    </SelectGroup>
  </SelectContent>
</Select>
```

---

### BP-071: Campos de formulário sem máscara quando aplicável

**Severidade:** 🟡 Moderado

**Problema:** campos como CPF, RG, telefone, CNPJ, CEP sem máscara de entrada. O usuário precisa digitar formatado manualmente, gerando erros de validação e UX ruim.

**Regra:** usar Maskito (`@maskito/react`) com máscaras definidas em `app/src/lib/masks.ts`. Padrões:
- `cpfMaskOptions` → CPF (XXX.XXX.XXX-XX)
- `rgMaskOptions` → RG (XX.XXX.XXX-X)
- `phoneMaskOptions` → Telefone ((XX) XXXXX-XXXX)
- `documentMaskOptions` → CPF/CNPJ dinâmico
- `cnpjMaskOptions` → CNPJ
- `zipCodeMaskOptions` → CEP

**Integração com TanStack Form:**
- Usar `defaultValue` (não `value`) com `onInput` (não `onChange`)
- Armazenar valor sem máscara no estado: `unmask(e.currentTarget.value)`

---

### BP-072: Section recebe props decompostos ao invés do objeto `data`

**Severidade:** 🟡 Moderado

**Problema:** page decompõe a resposta da API e passa campos individuais para sections (`services={data.items}`, `total={data.total}`, `stats={data.stats}`). Isso gera interfaces infladas, orquestração redundante na page, e dificulta manutenção.

**Regra:** sections DEVEM receber o objeto `data` completo (resposta da query), e opcionalmente `search` + `onSearchParamsChange` para sections interativas. A section faz a decomposição internamente.

```tsx
// ❌ Errado — page decomponha e orquestra handlers
<LeftColumn
  services={data.items}
  stats={data.stats}
  total={data.total}
  totalPages={data.totalPages}
  selectedServiceId={search.selectedServiceId}
  onSelectService={id => updateSearchParams({ selectedServiceId: id })}
  search={search}
  onSearchParamsChange={updateSearchParams}
/>

// ✅ Correto — section recebe data + search + onSearchParamsChange
<LeftColumn data={data} search={search} onSearchParamsChange={updateSearchParams} />
```

**Interface padrão:**
- `data: QueryResponse` — sempre presente
- `search: SearchParams` + `onSearchParamsChange` — apenas se a section tem interatividade (paginação, filtros, seleção)
- `className` — layout opcional
- Route params (e.g. `patientId`) — apenas se necessário para mutations

**Responsabilidade:** sections orquestram event handlers internamente. Ex: `onSelectService = (id) => onSearchParamsChange({ selectedServiceId: id })` é definido dentro da section, não na page.

---

### BP-073: Validação manual com `if` em value objects/entities ao invés de struct tags

**Severidade:** 🔵 Moderado

```go
// ❌ EVITAR - Cadeia de if's para validação simples
func NewAddress(street, number, ... string) (Address, error) {
    if street == "" {
        return Address{}, errors.NewBaseError(errors.CodeInvalidAddress, "street is required")
    }
    if number == "" {
        return Address{}, errors.NewBaseError(errors.CodeInvalidAddress, "number is required")
    }
    if len(state) != 2 {
        return Address{}, errors.NewBaseError(errors.CodeInvalidAddress, "state must be 2 characters")
    }
    // ...
}
```

**Por quê:** `validator/v10` struct tags são declarativas, mais concisas, e retornam todos os erros de uma vez (não apenas o primeiro). Use `validation.ValidateWithCode()` para manter o error code de domínio.

```go
// ✅ CORRETO - Struct tags + ValidateWithCode
type Address struct {
    Street string `validate:"required"`
    State  string `validate:"required,len=2"`
}

func NewAddress(street, ... string) (Address, error) {
    a := Address{Street: street, State: state}
    if err := validation.ValidateWithCode(&a, errors.CodeInvalidAddress); err != nil {
        return Address{}, err
    }
    return a, nil
}
```

**Exceções:** Custom validation logic (check digits em CPF/CNPJ, email parsing, regex) continua manual — struct tags são para constraints simples (`required`, `min`, `max`, `len`, `oneof`).

---

### BP-074: Campo de enum sem tag `oneof` em DTOs, inputs ou value objects

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Campo aceita enum mas não valida os valores permitidos
type CreateOrderInput struct {
    Status enums.OrderStatus `validate:"required"`
}

type Money struct {
    Amount   int64
    Currency string `validate:"required"`
}
```

**Por quê:** Go não tem `z.enum()` como TypeScript/Zod. Sem `oneof`, qualquer string passa na validação. O `oneof` tag é o equivalente Go de validação de enum — duplica os valores, mas é a única forma de garantir que apenas valores válidos sejam aceitos na boundary. Além disso, o campo DEVE usar o typed enum (`enums.Currency`), não `string`.

```go
// ✅ CORRETO - typed enum + oneof com todos os valores
type CreateOrderInput struct {
    Status enums.OrderStatus `validate:"required,oneof=PENDING SCHEDULED COMPLETED CANCELLED"`
}

type Money struct {
    Amount   int64
    Currency enums.Currency `validate:"required,oneof=BRL USD EUR"`
}
```

**Regra:** Todo campo que aceita um enum (typed string constant) em DTOs, use case inputs, value objects e controllers DEVE ter `validate:"oneof=..."` com todos os valores do enum. O enum correspondente DEVE ter um comentário `// Values: X Y Z` para facilitar a sincronização.

---

### BP-075: Usar `string` ao invés do typed enum em Output DTOs

**Severidade:** 🔵 Moderado

```go
// ❌ EVITAR - perde enum no OpenAPI spec (swag gera apenas "type": "string")
type CreateOrderOutput struct {
    ID     string `json:"id" example:"..."`
    Status string `json:"status" example:"PENDING"`
}

// atribuição precisa de cast
return CreateOrderOutput{
    Status: string(order.Status),
}
```

**Por quê:** Quando o campo é `string`, swag gera `"type": "string"` sem `enum` nem `$ref`. O SDK gerado perde a tipagem do enum. Usando o typed enum, swag gera `$ref` + `enum` array automaticamente, igual ao TypeScript.

```go
// ✅ CORRETO - typed enum gera $ref + enum no OpenAPI
type CreateOrderOutput struct {
    ID     string            `json:"id" example:"..."`
    Status enums.OrderStatus `json:"status" example:"PENDING"`
}

// atribuição direta sem cast
return CreateOrderOutput{
    Status: order.Status,
}
```

**Regra:** Todo campo de Output DTO (e TodoItem, ListOutput, etc.) que representa um enum DEVE usar o typed enum diretamente (`enums.XxxStatus`), não `string`. Isso garante `$ref` + `enum` no OpenAPI spec e tipagem no SDK. Requer `--parseInternal` no comando swag.

---

### BP-076: Campos de data/hora como `string` sem tags `format` e `datetime` em DTOs

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Campo de data sem format nem datetime
type CreateOrderOutput struct {
    CreatedAt string `json:"createdAt" example:"2026-02-19T10:30:00Z"`
}

type ScheduleAppointmentInput struct {
    StartDate string `from:"body" json:"startDate" validate:"required" example:"2026-02-19T10:30:00Z"`
}
```

**Por quê:** Sem `format:"date-time"`, swag gera apenas `"type": "string"` no OpenAPI — o SDK perde a semântica de data. Sem `validate:"datetime=..."`, qualquer string passa na validação em runtime.

```go
// ✅ CORRETO - format para OpenAPI + datetime para validação runtime
type CreateOrderOutput struct {
    CreatedAt string `json:"createdAt" format:"date-time" validate:"datetime=2006-01-02T15:04:05Z" example:"2026-02-19T10:30:00Z"`
}

type ScheduleAppointmentInput struct {
    StartDate string `from:"body" json:"startDate" format:"date-time" validate:"required,datetime=2006-01-02T15:04:05Z" example:"2026-02-19T10:30:00Z"`
}
```

**Duas tags com papéis distintos:**
- `format:"date-time"` — swag gera `"format": "date-time"` no OpenAPI spec (SDK tipado)
- `validate:"datetime=2006-01-02T15:04:05Z"` — runtime validation via `go-playground/validator` com layout Go

**Formatos comuns:**
- `format:"date-time"` + `datetime=2006-01-02T15:04:05Z` — ISO 8601 UTC (padrão do projeto)
- `format:"date"` + `datetime=2006-01-02` — apenas data

**Regra:** Todo campo `string` que representa data/hora em Input ou Output DTOs DEVE ter ambas as tags: `format` (para OpenAPI) e `validate:"datetime=..."` (para runtime).

---

### BP-077: `.and()` redundante que re-declara campos já presentes no schema da SDK

**Severidade:** 🔴 Crítico

```typescript
// ❌ PROIBIDO - SDK já tem z.email() e z.string().min(8), .and() apenas re-declara
const signInSchema = signInRequestSchema.and(
  z.object({
    email: z.email('E-mail invalido'),
    password: z.string().min(1, 'Senha obrigatoria'),
  }),
)
```

**Por quê:** O schema da SDK já contém as validações corretas (geradas do backend via `format:`, `validate:` tags). Usar `.and()` para re-declarar os mesmos campos é redundante e pode até **enfraquecer** validações (ex: `min(1)` overriding SDK's `min(8)`). Se o SDK schema cobre tudo, use-o direto.

```typescript
// ✅ CORRETO - SDK schema usado diretamente, sem wrapper
type SignInFormValues = z.infer<typeof signInRequestSchema>

const form = useForm({
  defaultValues,
  validators: { onSubmit: signInRequestSchema },
  onSubmit: async form => {
    await signIn.mutateAsync({ data: form.value })
  },
})
```

**Quando `.and()` é correto:** apenas para adicionar campos **exclusivos do frontend** que não existem no backend (ex: `termsAndConditions`, `confirmPassword` visual feedback).

```typescript
// ✅ CORRETO - .and() apenas para campo frontend-only
const signUpSchema = signUpRequestSchema.and(
  z.object({
    termsAndConditions: z.boolean().refine(val => val === true, {
      message: 'Voce deve aceitar os termos para continuar',
    }),
  }),
)
```

**Regra:** Se todos os campos do form já existem no SDK schema, use o SDK schema diretamente. `.and()` é apenas para campos que o backend não conhece.

---

### BP-078: Campo de validação do frontend que deveria estar no backend

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Backend não tem confirmPassword, frontend define sozinho
type SignUpRequest struct {
    Email    string `from:"body" json:"email"    validate:"required,email"`
    Password string `from:"body" json:"password" validate:"required,min=8"`
    // Falta ConfirmPassword!
}
```

```typescript
// ❌ Frontend forçado a definir confirmPassword por conta própria
const signUpSchema = signUpRequestSchema
  .pick({ email: true, password: true })
  .and(z.object({
    confirmPassword: z.string().min(1, 'Required'), // Deveria vir da SDK
  }))
```

**Por quê:** Se o campo é enviado ao servidor e requer validação server-side (ex: `confirmPassword` com `eqfield=Password`), ele deve existir no backend. Isso garante que: (1) o SDK schema inclui o campo automaticamente, (2) a validação server-side não é bypassável, (3) o frontend não precisa de `.pick()` + `.and()` hacks.

```go
// ✅ CORRETO - Backend inclui confirmPassword com validação eqfield
type SignUpRequest struct {
    Email           string `from:"body" json:"email"           validate:"required,email"`
    Password        string `from:"body" json:"password"        validate:"required,min=8"`
    ConfirmPassword string `from:"body" json:"confirmPassword" validate:"required,eqfield=Password"`
}
```

```typescript
// ✅ Frontend usa SDK schema direto — confirmPassword já está incluído
const signUpSchema = signUpRequestSchema.and(
  z.object({
    termsAndConditions: z.boolean().refine(val => val === true, { ... }),
  }),
)
```

**Regra:** Se um campo é submetido ao servidor e precisa de validação (especialmente cross-field como `eqfield`), ele DEVE estar no backend DTO. O frontend não define campos de request — o backend define, o SDK gera, o frontend consome.

---

### BP-079: Campos com `format:"email"` ausente em DTOs com campos de email

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Campo de email sem format tag
type SignInRequest struct {
    Email string `from:"body" json:"email" validate:"required,email" example:"john@example.com"`
}
// swag gera "type": "string" sem "format": "email"
// SDK gera z.string() ao invés de z.email()
```

**Por quê:** Sem `format:"email"`, swag gera apenas `"type": "string"` no OpenAPI. O SDK (Kubb/Zod) gera `z.string()` ao invés de `z.email()`, perdendo a validação de email no frontend. Padrão análogo ao `format:"date-time"` (BP-076).

```go
// ✅ CORRETO - format:"email" para OpenAPI + validate:"email" para runtime
type SignInRequest struct {
    Email string `from:"body" json:"email" format:"email" validate:"required,email" example:"john@example.com"`
}
// swag gera "format": "email" → SDK gera z.email()
```

**Duas tags com papéis distintos:**
- `format:"email"` — swag gera `"format": "email"` no OpenAPI spec (SDK gera `z.email()`)
- `validate:"email"` — runtime validation via `go-playground/validator`

**Regra:** Todo campo `string` que representa email em Input ou Output DTOs DEVE ter `format:"email"` (para OpenAPI) + `validate:"email"` (para runtime). Inclui campos em response DTOs (ex: `SessionUser.Email`).

---

### BP-080: Criar arquivo separado para Input/Output schemas

**Severidade:** 🔴 Crítico

```go
// ❌ PROIBIDO - Arquivo separado apenas para DTOs
// internal/auth/controllers/session_output.go
package controllers

type SessionOutput struct { ... }
type SessionUser struct { ... }

// ❌ PROIBIDO - DTOs em usecases/ sem handler correspondente
// internal/auth/usecases/session_output.go
package usecases

type SessionOutput struct { ... }
```

**Por quê:** Schemas (Input/Output structs) devem ser definidos no mesmo arquivo que os utiliza — no controller ou no use case handler. Nunca criar um arquivo avulso só para schemas. Se um DTO é compartilhado entre múltiplos controllers do mesmo package, defina-o no controller que é o "dono" primário (ex: `SessionOutput` pertence a `get_session.go`). Os demais controllers do mesmo package referenciam diretamente.

```go
// ✅ CORRETO - Output definido no controller que é dono primário
// internal/auth/controllers/get_session.go
package controllers

type SessionOutput struct {
    Token string      `json:"token" example:"..."`
    User  SessionUser `json:"user"`
}

type SessionUser struct { ... }

type GetSessionRequest struct { ... }
type GetSessionController struct{}
// ... Handle() usa SessionOutput
```

```go
// ✅ CORRETO - Outro controller no mesmo package referencia diretamente
// internal/auth/controllers/sign_in.go
package controllers

type SignInRequest struct { ... }
type SignInController struct{}
// ... Handle() usa SessionOutput (mesmo package, sem import)
```

```go
// ✅ CORRETO - Use case com Input/Output no mesmo arquivo do handler
// internal/auth/usecases/sign_in.go
package usecases

type SignInInput struct { ... }
type SignInOutput struct { ... }
type SignInHandler struct { ... }
func (h *SignInHandler) Execute(...) (SignInOutput, error) { ... }
```

**Regra:** Schemas vivem no arquivo que os utiliza. Sem arquivos avulsos de schemas, sem pastas `usecases/` vazias de handlers.

---

### BP-065: Criar rota e não regenerar `routeTree.gen.ts`

**Severidade:** 🔴 Crítico

**Problema:** rota existe em arquivo, mas árvore de rotas/tipos não reflete mudança.

**Regra:** após criar/renomear/mover rotas no app, regenerar route tree (`bun tsr generate` ou fluxo equivalente do projeto).

---

## Checklist de Review

### Arquitetura
- [ ] Endpoint único para telas complexas (não múltiplas chamadas)
- [ ] Nomes de campos consistentes entre endpoints
- [ ] Terminologia consistente (Consultation vs Appointment)
- [ ] Em `api`, validações cross-context usam repository reads quando aplicável (sem use case pass-through)
- [ ] Contratos definidos antes da implementação detalhada
- [ ] Write controllers (POST/PATCH/PUT/DELETE) vivem no contexto dono da entidade, nunca em `ui` (BP-068)

### Backend
- [ ] Filtragem feita no SQL/sqlc (não em memória)
- [ ] ErrorCodes definidos em `errors/errors.go` para todas validações do contexto
- [ ] ErrorCodes registrados via `init()` + `RegisterErrorCodes` no GlobalErrorMapper
- [ ] Erros usam `errors.NewAppError(code, msg)`, não `fmt.Errorf` ou `errors.New`
- [ ] Enums como typed string constants em `enums/` (não `iota`, não inline strings)
- [ ] Command use cases usam repositories, query use cases usam sqlc direto
- [ ] DTOs com tags `from:` (body/param/query/ctx) + `validate` tags
- [ ] DTOs com `example:""` tags para swag OpenAPI spec
- [ ] Reidratação usa `Reconstruct()`, não `NewXxx()` factory
- [ ] Eventos publicados somente após `uow.Execute()` (commit)
- [ ] fx.Module registrado em `cmd/api/main.go`
- [ ] Controllers registrados em `module.go` com `group:"controllers"` tag
- [ ] Consumers dependem de interfaces, não tipos concretos
- [ ] API não importa SDK HTTP client internamente
- [ ] Type assertions com `ok` check
- [ ] Value objects instanciados via construtores validados
- [ ] Value objects/entities usam `validate` struct tags para constraints simples, não `if` chains (BP-073)
- [ ] Campos de enum em DTOs/inputs/value objects têm `oneof` tag com todos os valores (BP-074)
- [ ] Output DTOs usam typed enum (`enums.X`), não `string`, para gerar `$ref` no OpenAPI (BP-075)
- [ ] Campos de data/hora string em DTOs têm `format:"date-time"` + `validate:"datetime=..."` (BP-076)
- [ ] Campos de email em DTOs têm `format:"email"` + `validate:"email"` (BP-079)
- [ ] Pasta `usecases/` não contém arquivos de schema/DTO avulsos sem handler (BP-080)
- [ ] Campos de validação cross-field (ex: `confirmPassword`) existem no backend DTO, não apenas no frontend (BP-078)

### Frontend - Tipagem
- [ ] Tipos inferidos da SDK (não interfaces locais)
- [ ] Enums importados da SDK (não hardcoded)
- [ ] Sem type assertions desnecessários
- [ ] Imports da SDK usam pontos canônicos (`/app`)

### Frontend - Componentes
- [ ] Componentes recebem dados via props (não fazem fetch)
- [ ] Skeleton components exportados
- [ ] Única biblioteca de ícones (@tabler/icons-react)
- [ ] Keys de lista usam ID único (não index)
- [ ] Iteração de enum extraída para constante no topo do módulo (não inline no JSX)
- [ ] Utilitários importados de @/lib (não duplicados)

### Frontend - Estado
- [ ] Search params para filtros/paginação (não useState)
- [ ] Zustand store para estado interativo (quando necessário)

### Frontend - Router
- [ ] Route tem errorComponent
- [ ] searchSchema estende SDK
- [ ] `<Link>` para rotas internas (não `<a>`)
- [ ] route tree foi regenerada após mudanças de rota
- [ ] Sections recebem `data` completo, não props decompostos (BP-072)

### Frontend - Forms
- [ ] `date-fns` apenas para formatação (não filtragem)
- [ ] Mask options importados de @/lib
- [ ] Campos CPF, RG, telefone, CNPJ, CEP usam máscara Maskito (BP-071)
- [ ] Usa primitivos do projeto (Select, DatePicker) em vez de elementos nativos (BP-070)
- [ ] Mutations em forms não usam try/catch — MutationCache trata erros (BP-069)
- [ ] Delete handlers usam `tryCatchAsync` sem `handleApiError` (BP-069)
- [ ] Form schemas usam SDK schema direto quando não há campos extras — sem `.and()` redundante (BP-077)
- [ ] `.and()` usado apenas para campos frontend-only (ex: `termsAndConditions`) (BP-077)

---

## Referências

- `docs/FRONTEND.md` - Padrões de frontend
- `docs/BACKEND.md` - Padrões de backend
- `docs/DEVELOPMENT.md` - Guia de desenvolvimento
- `.claude/skills/` - Skills de implementação
