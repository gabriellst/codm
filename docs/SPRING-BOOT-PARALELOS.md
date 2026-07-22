# Roteiro de Paralelos — API TypeScript ↔ Java Spring Boot

> Guia de tradução mental para quem vem de **Spring Boot** e vai trabalhar em `packages/api/typescript`.
> Cada conceito daqui tem um análogo direto no Spring. A diferença é **filosófica**: o Spring esconde via anotações + AOP + reflection o que aqui é **explícito e tipado** (transação passada à mão, eventos persistidos no outbox, DI declarada por ambiente).
>
> Escopo: **somente o backend TypeScript** (Bun + Drizzle + tsyringe). O worker Go e a camada `contracts` ficam de fora.

---

## 1. A diferença de filosofia (leia primeiro)

| Eixo | Spring Boot | API TypeScript (aqui) |
|---|---|---|
| **DI** | Classpath scan + reflection. Beans "aparecem". | `tsyringe-neo`. Bindings **declarados** num `registry.ts` por ambiente (`mock`/`integration`/`real`). |
| **Transação** | `@Transactional` (proxy AOP, invisível). | `withTransaction(tx, fn)` — o `tx` é **passado à mão** para cada repositório. |
| **Eventos** | `ApplicationEventPublisher` em memória, fire-after-commit. | Persistidos no **outbox** na mesma transação; `OutboxDispatcher` faz fan-out depois. |
| **Validação** | `@Valid` + Bean Validation (anotações). | Schema **Zod** — mesma fonte de verdade que gera o contrato da SDK e os tipos TS. |
| **Mapeamento ORM** | JPA/Hibernate (`@Entity` reflete no banco). | Drizzle + `toDomain()`/`toPersistence()` **explícitos**. O schema Zod da entidade é a fonte; a migração é derivada. |
| **Ambientes** | `@Profile` / `application-{env}.yml`. | Chaves `mock` / `integration` / `real` no `INSTANCE_REGISTRY`. |

**Regra de ouro:** se no Spring "é mágica", aqui é uma linha de código que você consegue ler. Nada acontece por reflection escondida.

---

## 2. Mapa mestre de equivalências

| Citizen (aqui) | Spring Boot | Arquivo / símbolo |
|---|---|---|
| **BoundedContext** | módulo `@Configuration` + pacote | `src/<ctx>/` + `index.ts` (`BoundedContext.create(...)`) |
| **Controller** | `@RestController` | `class X extends Controller<In, Out>` + `@injectable()` |
| **Use Case (command)** | `@Service` (command handler) | `class X extends Handler<In, Out>` |
| **Query Use Case** | `@Service` de leitura / BFF | vive em `ui/` — Drizzle direto, sem entidade |
| **Entity / AggregateRoot** | `@Entity` | `class X extends AggregateRoot<Schema>` |
| **Value Object** | `@Embeddable` | `class X extends ValueObject` em `objects/` |
| **Enum** | `enum` + `@Enumerated` | `enum` + `pgEnum` |
| **Schema (Zod)** | Bean Validation / `@Column` | `z.object({...})` |
| **Repository** | `JpaRepository<T,ID>` | `abstract class XRepository extends Repository<T>` + `DrizzleXRepository` |
| **Service** | `@Service` | `class X extends Service` |
| **Domain Event** | `extends ApplicationEvent` | `class X extends BaseDomainEvent<Schema>` |
| **Integration Event** | mensagem Kafka/AMQP | `class X extends BaseIntegrationEvent` |
| **Handler interno** | `@EventListener` | `class X extends EventHandler<E>` em `handlers/internal.ts` |
| **Handler externo** | `@KafkaListener` | `class X extends EventHandler<E>` em `handlers/external.ts` |
| **Projection** | tabela read-model / `@Entity` de leitura | `class X` (free record) em `projections/` |
| **Projector** | `@EventListener` que só escreve read-model | `class X extends Projector<E>` |
| **Middleware** | `Filter` / `HandlerInterceptor` | `class X extends Middleware` |
| **UnitOfWork** | `PlatformTransactionManager` | `UnitOfWorkFactory` / `withTransaction()` |
| **Outbox + Dispatcher** | `@TransactionalEventListener` + `@Scheduled` | `OutboxDispatcher` |
| **Error (Domain/App)** | `@ResponseStatus RuntimeException` | `BaseError<Codes>` + `GlobalErrorMapper` |
| **registry.ts** | `@Configuration` + `@Bean`/`@Profile` | `INSTANCE_REGISTRY = { mock, integration, real }` |
| **Container tsyringe** | `ApplicationContext` | child container por bounded context / suíte de teste |

---

## 3. Estrutura de um bounded context

```
src/sales/
├── controllers/      # @RestController
├── usecases/         # @Service (commands)
├── entities/         # @Entity (aggregate roots)
├── objects/          # @Embeddable (value objects)
├── enums/            # enum + pgEnum
├── schemas/          # Zod (Bean Validation)
├── errors/           # RuntimeException nomeadas
├── events/           # ApplicationEvent / mensagens
├── handlers/
│   ├── internal.ts   # @EventListener (mesmo contexto)
│   └── external.ts   # @KafkaListener (cross-contexto)
├── projections/      # read-models + projectors/
├── repositories/     # interface + Drizzle impl + Mock
├── services/         # @Service
├── middlewares/      # Filter / Interceptor
├── registry.ts       # @Configuration (bindings por ambiente)
└── index.ts          # BoundedContext.create(...)
```

**Paralelo Spring:** um pacote `com.app.sales` com `@ComponentScan` apontando para ele. A diferença é que aqui o `index.ts` **lista explicitamente** o que entra no contexto (controllers, handlers, registry) em vez de varrer o classpath.

---

## 4. Camada por camada (lado a lado)

### 4.1 Controller

```ts
@injectable()
export class UpdateOrderOverrideController extends Controller<
  typeof InputSchema, typeof OutputSchema
> {
  readonly path = '/orders/override'
  readonly method = 'patch'
  override middlewares = [AuthAccountMiddleware, RequireStoreMember]

  constructor(private cmd: UpdateOrderOverride) { super() }

  async handle(request): Promise<this['output']> {
    return this.cmd.execute({
      storeId: request.ctx.session.storeId,
      orderIds: request.body.orderIds,
      patch: request.body.patch,
    })
  }
}
```

```java
@RestController
@RequestMapping("/sales/orders")
class UpdateOrderOverrideController {
  private final UpdateOrderOverride cmd;

  @PatchMapping("/override")
  @PreAuthorize("@storeMember.check(authentication)")   // ↔ middlewares
  ResponseEntity<Output> handle(@Valid @RequestBody Input body, HttpSession s) {
    return ResponseEntity.ok(cmd.execute(new Cmd(
      (String) s.getAttribute("storeId"), body.orderIds(), body.patch())));
  }
}
```

- `path` + `method` ↔ `@PatchMapping`. **Não há roteamento separado** — a rota é metadado do controller.
- `override middlewares = [...]` ↔ `@PreAuthorize` / `addInterceptors()`. Pilha resolvida antes do `handle`.
- O controller **não pensa**: valida com Zod e chama um use case. Nunca toca repositório (igual à regra "controller fino" do Spring).

### 4.2 Use Case — onde mora a transação

```ts
@injectable()
export class UpdateOrderOverride extends Handler<typeof InputSchema, typeof OutputSchema> {
  readonly inputSchema = InputSchema
  readonly outputSchema = OutputSchema

  constructor(private overrides: OrderOverrideRepository) { super() }

  protected async handle(input, tx?): Promise<this['output']> {
    return this.withTransaction(tx, async tx => {
      const existing = await this.overrides.findByPin(input.orderId, input.externalId, tx)
      existing.mergeFields(input.patch)                       // entidade valida
      await this.overrides.save(existing, tx)                 // mesma TX
      await this.domainEventRepository.save(new OrderOverriddenEvent({...}), tx)
      return { orderOverrideIds: [existing.id] }
    })
  }
}
```

```java
@Service
class UpdateOrderOverride {
  private final OrderOverrideRepository overrides;
  private final DomainEventRepository events;

  @Transactional                                       // ↔ withTransaction
  Output execute(Cmd c) {
    var e = overrides.findByPin(c.orderId(), c.externalId());
    e.mergeFields(c.patch());                           // entidade valida
    overrides.save(e);
    events.save(new OrderOverriddenEvent(...));         // mesma TX → outbox
    return new Output(List.of(e.getId()));
  }
}
```

> **⚠ A diferença que mais confunde quem vem de Spring — Service gordo vs Use Case + Entidade rica.**
> No Java o padrão dominante é um **`@Service` gordo** (`ProductService` com `create/update/delete` e a regra de negócio toda nele) sobre uma **`@Entity` anêmica** (só getters/setters). Aqui é o oposto:
> - A **lógica de negócio mora na Entidade** (rich domain model): `Product.create()`, `product.activate()`, `product.rename()` — a entidade decide se a mudança é válida e levanta `DomainError`.
> - O **Use Case só orquestra** a transação (carrega via repo → chama o método da entidade → salva → persiste evento), e há **um por intenção** (`CreateProduct`, `ActivateProduct`, `DeleteProduct` — uma classe cada), não um service com N métodos.
> - **`Service` aqui** existe **só** para lógica cross-entity que não cabe em nenhuma entidade — nunca como o lugar default da regra.
>
> | Aspecto | Java · Service gordo | API TS · Use Case + Entidade rica |
> |---|---|---|
> | Onde mora a regra | no `@Service` | na **entidade** |
> | Granularidade | 1 service, N métodos | **1 classe por intenção** |
> | Camada de aplicação | contém a lógica | **só orquestra** |
> | Invariante violada | `if` no service | `DomainError` da entidade |

**A grande diferença (transação):** no Spring o `@Transactional` é um proxy invisível e o `tx` está num `ThreadLocal`. Aqui o `tx` é **um parâmetro real** que você repassa a cada repositório. Isso torna a fronteira transacional impossível de errar por engano (sem "self-invocation bypass" do Spring) — e torna `tx?` opcional para permitir composição aninhada de use cases na mesma transação.

> **Regra:** o evento é salvo via `domainEventRepository.save(event, tx)` **na mesma transação** que a entidade. É o padrão Outbox — equivalente a um `@TransactionalEventListener(phase = AFTER_COMMIT)`, mas com garantia de atomicidade no banco em vez de em memória.

### 4.3 Entity / AggregateRoot

```ts
export const OrderOverrideSchema = z.object({
  storeId: z.instance(Id),               // z.instance(Id) só em entity/VO
  orderId: z.instance(Id),
  fields: OrderOverrideFieldsSchema,
})

export class OrderOverride extends AggregateRoot<typeof OrderOverrideSchema> {
  static override schema = OrderOverrideSchema

  static create(data): OrderOverride {                  // factory + validação
    const parsed = OrderOverrideFieldsSchema.safeParse(data.fields)
    if (!parsed.success) throw new BaseError<SalesDomainErrors>('INVALID_FIELDS')
    return new OrderOverride({ id: orderOverrideId(...), ...data })
  }

  mergeFields(patch): void {                            // comportamento
    this.fields = { ...this.fields, ...validate(patch) }
  }
}
```

```java
@Entity
class OrderOverride {
  @Id String id;
  @Embedded OrderOverrideFields fields;
  @Version Long version;                                // ↔ incrementVersion()

  static OrderOverride create(...) { /* valida invariantes */ }
  void mergeFields(OrderOverrideFields patch) { this.fields = fields.merge(patch); }
}
```

- O **schema Zod é a fonte de verdade**; a migração Drizzle é **derivada** dele (oposto do JPA, onde o `@Entity` dita o schema).
- `static create()` ↔ factory method validando invariantes. Construtor é privado.
- `addDomainEvent()` (na base) ↔ entidade acumula eventos; `pullDomainEvents()` os drena no save. Igual ao padrão DDD que se faz "à mão" no Spring (a base class faz por você).
- `@Version` ↔ `incrementVersion()` (optimistic lock).

### 4.4 Repository

```ts
// Interface (contrato de domínio)
export abstract class OrderOverrideRepository extends Repository<OrderOverride> {
  abstract findByPin(orderId: string, externalId: string, tx?: Transaction): Promise<OrderOverride | undefined>
}

// Impl Drizzle
@injectable()
export class DrizzleOrderOverrideRepository extends OrderOverrideRepository {
  constructor(private db: DrizzleClient) { super() }

  async findByPin(orderId, externalId, tx?) {
    const client = tx ?? this.db                         // TX-aware
    const rows = await client.select().from(orderOverrides).where(...)
    return rows[0] ? this.toDomain(rows[0]) : undefined  // hidrata entidade
  }

  async save(entity, tx?) {
    entity.incrementVersion()
    await (tx ?? this.db).insert(orderOverrides)
      .values(this.toPersistence(entity))
      .onConflictDoUpdate({ ... })
    return entity
  }
}
```

```java
interface OrderOverrideRepository extends JpaRepository<OrderOverride, String> {
  Optional<OrderOverride> findByOrderIdAndStoreIntegrationExternalId(String o, String e);
}
```

- A **interface é abstrata** (contrato de domínio), igual ao `Repository<T,ID>` do Spring Data. Mas a impl é manual — você escreve `toDomain()`/`toPersistence()` em vez de o Hibernate refletir.
- `client = tx ?? this.db` ↔ no Spring o `EntityManager` thread-local já é o da transação corrente. Aqui é explícito.
- `MockOrderOverrideRepository` (Map em memória) ↔ usar H2/Testcontainers nos testes. Aqui o mock é registrado via `registry.ts` ambiente `mock`.

### 4.5 registry.ts — o `@Configuration` por ambiente

```ts
export const INSTANCE_REGISTRY: InstanceRegistry = {
  mock:        [{ token: OrderOverrideRepository, instance: MockOrderOverrideRepository }],
  integration: [{ token: OrderOverrideRepository, instance: DrizzleOrderOverrideRepository }],
  real:        [{ token: OrderOverrideRepository, instance: DrizzleOrderOverrideRepository }],
}
```

```java
@Configuration
class SalesConfig {
  @Bean @Profile("test")  OrderOverrideRepository mock() { return new MockOrderOverrideRepository(); }
  @Bean @Profile("!test") OrderOverrideRepository real(DrizzleClient db) { return new DrizzleOrderOverrideRepository(db); }
}
```

- `token` (a classe abstrata) ↔ o tipo da interface no `@Bean`.
- `mock`/`integration`/`real` ↔ `@Profile`. A suíte de teste resolve via **child container** isolado — equivalente a um `ApplicationContext` por teste, mas barato.

### 4.6 Wiring do contexto — `BoundedContext.create()`

```ts
// sales/index.ts
const ctx = await BoundedContext.create({
  name: 'sales',
  controllers,
  internalHandlers,
  externalHandlers,
  projectors,
  registry: INSTANCE_REGISTRY,
})
export default ctx.router
```

Isso faz, na ordem:
1. Cria um **child container** tsyringe (≈ `ApplicationContext` filho).
2. Registra os bindings de `INSTANCE_REGISTRY[env]`.
3. Resolve cada controller (`container.resolve(X)`) e monta as rotas.
4. Registra handlers no `InternalMediator` / `ExternalMediator`.
5. Registra projectors.

```java
@SpringBootApplication
@ComponentScan("com.app.sales")     // varredura faz os passos 2–5 implicitamente
class ApiApplication { }
```

A diferença: aqui o wiring é **uma lista explícita**, não classpath scan. Você vê exatamente o que o contexto expõe.

---

## 5. Infraestrutura de eventos (o "Spring escondido")

### Fluxo write-side completo

```
Controller.handle
  └─ UseCase.execute
       └─ withTransaction (UnitOfWorkFactory.create)
            ├─ Repository.save(entity, tx)
            └─ DomainEventRepository.save(event, tx)   ← grava no OUTBOX, mesma TX
       (commit)
  ─────────────────────────────────────────────────
  OutboxDispatcher (poll)                              ↔ @Scheduled
    └─ InternalMediator.dispatch(event)                ↔ ApplicationEventPublisher
         ├─ EventHandler interno                       ↔ @EventListener
         │    └─ ExternalMediator.publish(intEvent)    ↔ KafkaTemplate.send
         └─ Projector                                  ↔ @EventListener (só read-model)
              └─ ProjectionRepository.save
```

| Peça | Spring | Aqui |
|---|---|---|
| Transação | `PlatformTransactionManager` | `UnitOfWorkFactory` / `withTransaction` |
| Publicar evento de domínio | `ApplicationEventPublisher` | `domainEventRepository.save(event, tx)` (outbox) |
| Fan-out pós-commit | `@TransactionalEventListener(AFTER_COMMIT)` | `OutboxDispatcher` + `InternalMediator` |
| Handler mesmo contexto | `@EventListener @Async` | `EventHandler` em `handlers/internal.ts` |
| Handler cross-serviço | `@KafkaListener` | `EventHandler` em `handlers/external.ts` |
| Retry / durabilidade | `@Retryable` / DLQ | linha do outbox fica não-processada e é re-tentada |

**Por que outbox e não eventos em memória?** Garantia transacional: ou a entidade **e** o evento são gravados, ou nenhum. O `@TransactionalEventListener` do Spring não dá isso por padrão — se o processo cai entre o commit e o listener, o evento se perde. Aqui o evento já está no banco.

### Handler (internal) — exemplo

```ts
@injectable()
export class OrderOverriddenPublisher extends EventHandler<typeof OrderOverriddenEvent> {
  readonly event = OrderOverriddenEvent
  constructor(private mediator: ExternalMediator, private repo: OrderOverrideRepository) { super() }

  async handle(event): Promise<void> {
    await this.mediator.publish(new OrderOverriddenIntegrationEvent({ ... }))
  }
}
```

```java
@Component
class OrderOverriddenPublisher {
  @EventListener @Async
  void on(OrderOverriddenEvent e) { kafka.send("shared.events", toIntegration(e)); }
}
```

> Regra dura: **integration events só são publicados por handlers**, nunca por use cases. (No Spring você poderia publicar de qualquer `@Service`; aqui a fronteira é arquitetural.)

---

## 6. Projection / Projector (read-side, CQRS)

O lado de leitura é separado. No Spring você costuma fazer com `@EventListener` escrevendo numa tabela materializada; aqui é formalizado:

| | Spring | Aqui |
|---|---|---|
| Read-model | `@Entity` de leitura / view | `class XProjection` (free record, sem base class, sem invariante) |
| Quem escreve | `@EventListener` | `class XProjector extends Projector<E>` (1 por projection) |
| Fluxo de mutação | find → set → save | `find → projection.applyEvent(event) → save` |
| Op atômica (hot row, bulk) | `@Modifying @Query` UPDATE | método atômico no `ProjectionRepository` (`upsertMany`, `setIfGreater`) |

`Query Use Case` (BFF) ↔ um `@Service`/`@Repository` de leitura que monta o DTO da tela com Drizzle direto — **não passa por entidade**. Vive em `ui/`. É o equivalente a um read-side projection query no Spring, mas sem repositório JPA: SQL direto montando o shape que a UI quer.

---

## 7. Erros — vocabulário tipado

```ts
throw new BaseError<SalesDomainErrors>('APPOINTMENT_ALREADY_CONFIRMED')
```

```java
@ResponseStatus(HttpStatus.CONFLICT)
class AppointmentAlreadyConfirmedException extends RuntimeException { }
```

- Cada erro carrega **código + status HTTP + chave i18n**, mapeados centralmente no `GlobalErrorMapper` ↔ `@ControllerAdvice` + `@ExceptionHandler`.
- **DomainError** (levantado por entidade/VO) ↔ exceção de invariante de negócio.
- **ApplicationError** (levantado por use case/handler) ↔ `EntityNotFoundException`, `AccessDeniedException`.
- O teste asserta no **código**, nunca na mensagem (igual à boa prática Spring de não testar `getMessage()`).

---

## 8. Schema (Zod) — onde o Spring usa 3 ferramentas, aqui usa 1

No Spring você tem Bean Validation (`@NotNull`), o `@Entity` JPA e o DTO do controller — três descrições da mesma forma. Aqui o **mesmo schema Zod** serve:

- Entidade descreve sua forma (`OrderOverrideSchema`) → `create()` valida contra ele.
- Migração Drizzle é **derivada** do schema.
- Use case declara `inputSchema`/`outputSchema` → vira o contrato chamável.
- Controller declara schemas expressivos (regex, `.refine()`) → viram a **SDK** via OpenAPI.
- O **form no frontend consome o mesmo schema** — validação simétrica, zero sincronização manual.

> Heurística: precisa validar entrada ou definir estrutura em runtime? **Escreva um schema.** Duplicar schema entre camadas é bandeira vermelha — extraia para `shared/` ou componha (`.pick()`, `.extend()`).
>
> Regra de fronteira: `z.instance(Id)` **só** em schema de entity/value-object; eventos, use cases, controllers e DTOs de query usam `z.uuid()`/`z.string()`.

---

## 9. Testes — as 4 camadas vs Spring Test

| Tipo (aqui) | Modo DI | Spring | Quando |
|---|---|---|---|
| **Unit** | nenhum (new direto) | `@Test` puro | invariantes de entity/VO |
| **Repository** | `integration` (PGlite) | `@DataJpaTest` | `save/findById` + queries |
| **Use case / Handler** | `integration` | `@SpringBootTest` | comportamento end-to-end de uma operação |
| **Flow** | `mock` | `@SpringBootTest` com mocks | coreografia entre use cases (sagas) |

- **PGlite** = Postgres em-processo ↔ H2/Testcontainers, mas **com as mesmas migrations de produção** (o que passa no teste passa no Postgres real).
- `TestBed.create('integration', { testContainer })` ↔ `@SpringBootTest` montando um `ApplicationContext` por suíte — aqui é um **child container** isolado, barato de criar/destruir.
- **Given helpers** (`givenAppointment(testBed, {...})`) criam estado **via repositório, nunca via use case** ↔ test data builders. Garante que o teste de `Cancel` não dependa de `Create` estar correto.
- Regra de ouro: **use case não repete casos de `VALIDATION_ERROR`** — isso é coberto pelo teste de entidade. Use case testa orquestração.

---

## 10. SDK — o que o Spring não tem

O frontend **nunca** faz `fetch` direto. O controller (schema Zod) → emite `openapi.json` → Kubb gera hooks React Query + schemas + tipos + query keys. É o equivalente a gerar um cliente Feign/OpenAPI a partir do `springdoc`, mas integrado: mudou o schema do controller → `bun sdk` → o `tsc` do app reclama nos pontos exatos a adaptar.

Regra interna: **dentro da API nunca use o cliente HTTP da SDK** (cria ciclo). Para ler outro contexto, importe o `Repository` dele — ↔ injetar o `@Repository`/`@Service` do outro módulo em vez de fazer chamada HTTP a si mesmo.

---

## 11. Roteiro de leitura para um dev Spring entrando no projeto

1. **`docs/BACKEND.md`** — a arquitetura completa (dependency direction, event architecture, DI & registries). É o `README` arquitetural.
2. Abra **um** bounded context (`src/sales/`) e leia, nesta ordem:
   - `index.ts` → como o contexto se monta (≈ sua `@Configuration` + `@ComponentScan`).
   - `registry.ts` → os bindings por ambiente (≈ seus `@Bean`/`@Profile`).
   - um controller → um use case → uma entity → um repository (o caminho de um request).
   - `handlers/internal.ts` + um projector → o lado assíncrono (≈ seus `@EventListener`).
3. Rode **um teste de use case** e siga o `TestBed` — é onde a DI por ambiente fica óbvia.
4. Quando for criar algo novo, **use o scaffolder** (`bun cli` / skills) — ele escreve o boilerplate canônico, equivalente a um arquétipo Maven só que por citizen.

---

## 12. Cola rápida (imprima isto)

```
@RestController          → class extends Controller<In,Out>  + @injectable()
@Service (command)       → class extends Handler<In,Out>
@Service (read/BFF)      → Query use case em ui/ (Drizzle direto)
@Entity                  → class extends AggregateRoot<Schema>
@Embeddable              → class extends ValueObject (objects/)
@Repository / JpaRepo    → abstract XRepository + DrizzleXRepository + MockXRepository
@Configuration + @Bean   → registry.ts (INSTANCE_REGISTRY)
@Profile(test|prod)      → chaves mock | integration | real
ApplicationContext       → tsyringe child container
@Transactional           → withTransaction(tx, fn) — tx passado à mão
ApplicationEventPublisher→ domainEventRepository.save(event, tx) (outbox)
@TransactionalEventListener→ OutboxDispatcher + InternalMediator
@EventListener           → EventHandler (handlers/internal.ts)
@KafkaListener           → EventHandler (handlers/external.ts)
@ControllerAdvice        → GlobalErrorMapper
@ResponseStatus Exception→ BaseError<Codes>
@Valid + Bean Validation → schema Zod (mesma fonte da SDK e do form)
read-model @Entity       → Projection (free record) + Projector
springdoc + Feign client → bun sdk (Kubb) → hooks React Query tipados
```
