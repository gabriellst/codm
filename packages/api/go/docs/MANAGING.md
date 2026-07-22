# Gestão de Projeto - Metodologia Ágil

> **Processo de Gerenciamento de Tarefas e Desenvolvimento**

Este documento descreve o fluxo completo de trabalho desde a criação de um card até sua conclusão, incluindo responsabilidades, status e boas práticas.

---

## 📋 Índice

- [Papéis e Responsabilidades](#papéis-e-responsabilidades)
- [Status de Cards](#status-de-cards)
- [Fluxo Completo de Trabalho](#fluxo-completo-de-trabalho)
- [Detalhamento do Fluxo](#detalhamento-do-fluxo)
- [Hierarquia de Trabalho](#hierarquia-de-trabalho)
- [Boas Práticas](#boas-práticas)
- [Comunicação e Cerimônias](#comunicação-e-cerimônias)
- [Métricas e KPIs](#métricas-e-kpis)

---

## 🎭 Papéis e Responsabilidades

### **Product Owner (PO) / Tech Lead**

- Criar épicos e histórias de usuário
- Escrever cards no BACKLOG
- Priorizar e mover cards para PLANEJADO durante o planning
- Dar assign de tasks para desenvolvedores
- Validar requisitos finais
- Participar ativamente das dailys para desbloquear impedimentos

### **Desenvolvedor (Dev)**

- Ler e entender cards em PLANEJADO
- Criar branches e implementar features
- Mover cards entre status conforme progresso
- Abrir pull requests
- Responder e implementar feedback de revisão
- Comunicar bloqueios imediatamente

### **Revisor (Reviewer)**

- Fazer code review
- Testar comportamento da feature
- Aprovar ou solicitar alterações
- Mover cards para CONCLUÍDO ou ALTERAÇÃO PENDENTE
- Dar feedback construtivo e específico

---

## 📋 Status de Cards

Os cards podem estar em um dos seguintes status:

| Status | Descrição | Responsável |
|--------|-----------|-------------|
| **BACKLOG** | Card criado, aguardando priorização | PO |
| **PLANEJADO** | Card selecionado para a sprint atual | PO |
| **EM ANDAMENTO** | Desenvolvimento ativo, branch criada | Dev |
| **REVISÃO PENDENTE** | Desenvolvimento concluído, PR aberto | Dev |
| **EM REVISÃO** | Code review e testes em andamento | Reviewer |
| **ALTERAÇÃO PENDENTE** | Ajustes solicitados pelo revisor | Reviewer |
| **BLOQUEADO** | Impedimento técnico ou de requisitos | Dev/PO |
| **CONCLUÍDO** | Aprovado e pronto para deploy | Reviewer |

---

## 🔄 Fluxo Completo de Trabalho

```
┌─────────────────────────────────────────────────────────────────┐
│                     CICLO DE VIDA DE UMA TASK                   │
└─────────────────────────────────────────────────────────────────┘

   ┌──────────┐
   │ BACKLOG  │ ◄─── PO escreve card com requisitos
   └────┬─────┘
        │
        │ Sprint Planning
        │ (PO prioriza + assign Dev)
        ▼
   ┌──────────┐
   │PLANEJADO │
   └────┬─────┘
        │
        │ Dev lê card, cria branch
        ▼
   ┌──────────┐
   │    EM    │ ◄─────────────────┐
   │ANDAMENTO │                   │
   └────┬─────┘                   │
        │                         │
        │ Dev finaliza,           │
        │ abre PR                 │
        ▼                         │
   ┌──────────┐                   │
   │ REVISÃO  │                   │
   │ PENDENTE │                   │
   └────┬─────┘                   │
        │                         │
        │ Reviewer pega task      │
        ▼                         │
   ┌──────────┐                   │
   │    EM    │                   │
   │ REVISÃO  │                   │
   └────┬─────┘                   │
        │                         │
        ├─── Aprovado ───────┐    │
        │                    │    │
        │                    ▼    │
        │              ┌──────────┐│
        │              │CONCLUÍDO ││
        │              └──────────┘│
        │                         │
        └─── Reprovado ─────────► │
                              ┌────┴────┐
                              │ALTERAÇÃO│
                              │PENDENTE │
                              └─────────┘
                                   │
                    Dev lê comentários,
                    faz ajustes ─────────┘

        BLOQUEIO EM QUALQUER ETAPA
                ▼
         ┌──────────┐
         │BLOQUEADO │
         └──────────┘
                │
         Resolvido o impedimento
                │
                ▼
         Volta para PLANEJADO
```

---

## 📝 Detalhamento do Fluxo

### **1️⃣ BACKLOG → PLANEJADO**

**Ação:** Sprint Planning

**Responsável:** Product Owner / Tech Lead

**Checklist:**
- [ ] Card foi escrito com requisitos claros
- [ ] Critérios de aceite definidos
- [ ] Prioridade avaliada
- [ ] Card entra na sprint da semana
- [ ] Assign dado para desenvolvedor específico

**Exemplo de Card:**
```markdown
# [FEATURE] Implementar Cadastro de Livros

## Descrição
Como bibliotecário, quero cadastrar novos livros no sistema para 
que eles fiquem disponíveis para empréstimo.

## Requisitos
- Endpoint POST /books
- Validar ISBN único
- Campos obrigatórios: título, autor, ISBN, total de cópias
- Publicar evento BookCreated

## Critérios de Aceite
- [ ] API retorna 201 com ID do livro criado
- [ ] Validação de ISBN duplicado
- [ ] Evento publicado corretamente

## Documentação
- Protótipo: [link]
- Especificação técnica: [link]
```

---

### **2️⃣ PLANEJADO → EM ANDAMENTO**

**Ação:** Desenvolvedor inicia trabalho

**Responsável:** Desenvolvedor

**Checklist:**
- [ ] Ler card completamente
- [ ] Ler documentações e protótipos referenciados
- [ ] Entender todos os requisitos
- [ ] Tirar dúvidas na daily (se necessário)
- [ ] Criar branch a partir de `main` ou `develop`
- [ ] Mover card para EM ANDAMENTO

**Padrão de Nome de Branch:**
```bash
# Feature
git checkout -b feat/add-book-registration

# Bugfix
git checkout -b fix/book-isbn-validation

# Refactor
git checkout -b refactor/book-repository

# Hotfix
git checkout -b hotfix/book-creation-error
```

**Durante o Desenvolvimento:**
- Fazer commits atômicos e descritivos
- Seguir padrões do projeto (ver [DEVELOPMENT.md](./DEVELOPMENT.md))
- Implementar testes unitários
- Testar localmente

---

### **3️⃣ EM ANDAMENTO → REVISÃO PENDENTE**

**Ação:** Desenvolvedor finaliza implementação

**Responsável:** Desenvolvedor

**Checklist:**
- [ ] Código implementado e testado
- [ ] Linting e build passando (`bun run lint` + `bun run build`)
- [ ] Testes unitários escritos e passando
- [ ] Documentação atualizada (se necessário)
- [ ] SDK gerada (se criou/modificou controllers: `bun run dev` + `bun sdk`)
- [ ] Criar pull request para branch principal
- [ ] Preencher template do PR com detalhes das alterações
- [ ] Mover card para REVISÃO PENDENTE

**Template de Pull Request:**
```markdown
## Descrição
Implementação do cadastro de livros conforme card #123

## Mudanças Realizadas
- ✅ Criado contexto `book`
- ✅ Implementado entidade `Book` com validações
- ✅ Criado use case `CreateBook`
- ✅ Criado controller `CreateBookController`
- ✅ Evento `BookCreated` publicado
- ✅ Testes unitários adicionados

## Checklist Técnico
- [x] Código segue padrões do DEVELOPMENT.md
- [x] Linting e build passando
- [x] Testes unitários escritos
- [x] SDK gerada e funcionando
- [x] Documentação atualizada

## Como Testar
1. Rodar servidor: `bun run dev`
2. Fazer request POST /books com payload de exemplo
3. Verificar retorno 201 com ID do livro

## Screenshots/Exemplos (opcional)
[Adicionar se aplicável]

## Card Relacionado
Closes #123
```

---

### **4️⃣ REVISÃO PENDENTE → EM REVISÃO**

**Ação:** Revisor pega a task

**Responsável:** Revisor

**Checklist:**
- [ ] Dar assign do card para si mesmo
- [ ] Mover card para EM REVISÃO
- [ ] Abrir o PR no GitHub/GitLab
- [ ] Iniciar processo de revisão

---

### **5️⃣ EM REVISÃO → CONCLUÍDO ou ALTERAÇÃO PENDENTE**

**Ação:** Code Review + Testes

**Responsável:** Revisor

**Checklist de Revisão:**

**📋 Code Review**
- [ ] Código segue padrões do DEVELOPMENT.md
- [ ] Arquitetura respeitada (estrutura flattened sem camadas domain/application/interface/infra)
- [ ] Em `api`, validações cross-context usam repository reads quando necessário (sem SDK interna)
- [ ] Erros documentados em controllers
- [ ] Schemas com examples
- [ ] Testes unitários adequados
- [ ] Nomenclatura clara e consistente

**🧪 Testes de Comportamento**
- [ ] Checkout da branch localmente
- [ ] Rodar `bun install` (se necessário)
- [ ] Rodar `bun run lint` (deve passar)
- [ ] Rodar `bun run build` (deve passar)
- [ ] Rodar `bun run test` (deve passar)
- [ ] Testar endpoints manualmente (Postman/Insomnia)
- [ ] Validar responses esperados
- [ ] Testar cenários de erro

**Decisão:**

✅ **APROVADO** → Mover para **CONCLUÍDO**
- Aprovar PR
- Fazer merge para branch principal
- Deletar branch de feature
- Mover card para CONCLUÍDO

❌ **REPROVADO** → Mover para **ALTERAÇÃO PENDENTE**
- Adicionar comentários específicos no PR
- Referenciar linhas de código problemáticas
- Explicar o que precisa ser ajustado
- Mover card para ALTERAÇÃO PENDENTE

**Exemplo de Feedback:**
```markdown
## Feedback - Alterações Necessárias

### ❌ Problemas Críticos
1. **Validação de ISBN**
   - Arquivo: `book/entities/Book.ts:45`
   - Problema: ISBN não está sendo validado com regex correto
   - Solução: Usar regex `/^\d{3}-\d{10}$/` para ISBN-13

2. **Erro não registrado**
   - Arquivo: `api/src/shared/utils/GlobalErrorMapper.ts`
   - Problema: `DUPLICATE_ISBN` não está no `GlobalErrorMapper`
   - Solução: Registrar o erro no GlobalErrorMapper com o status HTTP apropriado

### ⚠️ Sugestões
1. Adicionar teste de caso de ISBN duplicado
2. Melhorar mensagem de erro para usuário

### 📝 Observações
Boa implementação no geral! Apenas alguns ajustes pontuais.
```

---

### **6️⃣ ALTERAÇÃO PENDENTE → EM ANDAMENTO**

**Ação:** Desenvolvedor implementa feedback

**Responsável:** Desenvolvedor

**Checklist:**
- [ ] Ler todos os comentários do revisor
- [ ] Entender cada ponto levantado
- [ ] Tirar dúvidas (se necessário)
- [ ] Mover card para EM ANDAMENTO
- [ ] Fazer as alterações na mesma branch
- [ ] Commitar mudanças com mensagens claras
- [ ] Responder comentários no PR indicando correções
- [ ] Push das alterações
- [ ] Mover card de volta para REVISÃO PENDENTE

**Padrão de Commit para Ajustes:**
```bash
git commit -m "fix: corrige validação de ISBN conforme code review"
git commit -m "docs: adiciona erro DUPLICATE_ISBN no controller"
git commit -m "test: adiciona teste para ISBN duplicado"
```

**O ciclo 5️⃣ → 6️⃣ se repete até aprovação**

---

### **7️⃣ BLOQUEADO**

**Ação:** Card não pode progredir

**Responsável:** Desenvolvedor ou PO

**Motivos Comuns:**
- Dependência de outra task não finalizada
- Requisito técnico indisponível (API externa, serviço)
- Dúvida de negócio não resolvida
- Problema de ambiente/infraestrutura

**Checklist:**
- [ ] Mover card para BLOQUEADO
- [ ] Adicionar comentário explicando o bloqueio
- [ ] Marcar pessoa responsável por desbloquear (@mention)
- [ ] Criar task/subtask para resolver impedimento (se necessário)

**Exemplo de Comentário:**
```markdown
## ⛔ BLOQUEIO

**Motivo:** Aguardando API de validação de CPF ser disponibilizada.

**Dependência:** Task #456 (Implementar API de Validação de CPF)

**Ação Necessária:** @tech-lead precisa priorizar task #456

**Previsão:** Semana 23/11

---
Enquanto isso, posso trabalhar em outras tasks.
```

**Desbloqueio:**
- [ ] Resolver impedimento
- [ ] Adicionar comentário indicando desbloqueio
- [ ] Mover card de volta para PLANEJADO
- [ ] Card entra novamente no fluxo normal

---

## 🏗️ Hierarquia de Trabalho

### Épicos → Histórias → Tasks → Subtasks

```
Epic (8-12 sprints)
  │
  ├─ Story 1 (1-2 sprints)
  │    ├─ Task 1.1 (Backend) [Status: PLANEJADO]
  │    │    ├─ Subtask 1.1.1: Criar entidade
  │    │    ├─ Subtask 1.1.2: Criar use case
  │    │    └─ Subtask 1.1.3: Criar controller
  │    │
  │    └─ Task 1.2 (Frontend) [Status: EM ANDAMENTO]
  │         ├─ Subtask 1.2.1: Criar formulário
  │         └─ Subtask 1.2.2: Integrar com API
  │
  ├─ Story 2 (1 sprint)
  │    └─ Task 2.1 (Backend)
  │
  └─ Story 3 (2 sprints)
       ├─ Task 3.1 (Backend)
       └─ Task 3.2 (Frontend)
```

---

### **📚 Épico (Epic)**

**O que é?** Iniciativa grande de negócio que agrupa múltiplas funcionalidades.

**Quando criar?** Para features complexas que levam várias sprints.

**Exemplo:**
```markdown
# Epic: Sistema de Gestão de Biblioteca

## Objetivo
Implementar sistema completo para gerenciar livros, membros e empréstimos.

## Escopo
- Cadastro de livros
- Cadastro de membros
- Registro de empréstimos
- Controle de devoluções
- Relatórios

## Estimativa
8-12 sprints

## Valor de Negócio
Automatizar gestão manual da biblioteca, reduzindo erros e tempo.
```

**No Gerenciador de Cards:**
- Criar Epic no ClickUp/Jira
- Adicionar label `epic`
- Deixar em BACKLOG até priorização

---

### **📖 História de Usuário (User Story)**

**O que é?** Fluxo end-to-end do ponto de vista do usuário.

**Quando criar?** Para cada funcionalidade completa dentro de um épico.

**Template:**
```markdown
Como [tipo de usuário]
Quero [ação/funcionalidade]
Para que [benefício/objetivo]

## Critérios de Aceite
- [ ] Critério 1
- [ ] Critério 2

## Definição de Pronto (DoD)
- [ ] Código revisado
- [ ] Testes passando
- [ ] Documentação atualizada
```

**Exemplo:**
```markdown
# História: Cadastro de Livros

Como bibliotecário
Quero cadastrar novos livros no sistema
Para que eles fiquem disponíveis para empréstimo

## Critérios de Aceite
- [ ] Sistema valida ISBN único
- [ ] Campos obrigatórios: título, autor, ISBN
- [ ] Sistema notifica sucesso do cadastro
- [ ] Livro aparece na lista de disponíveis

## Definição de Pronto
- [ ] Backend implementado
- [ ] Frontend implementado
- [ ] Testes e2e passando
- [ ] Deploy em staging
```

**No Gerenciador de Cards:**
- Criar Story vinculada ao Epic
- Adicionar label `story`
- Deixar em BACKLOG

---

### **✅ Task (Tarefa)**

**O que é?** Unidade técnica de trabalho que implementa parte da história.

**Quando criar?** Quando história precisa ser quebrada em partes menores.

**Exemplo:**
```markdown
# Task: Implementar Endpoint POST /books

## História Pai
#789 - Cadastro de Livros

## Descrição Técnica
Criar endpoint para cadastrar livros no sistema.

## Escopo Técnico
- Criar contexto `book`
- Implementar entidade `Book` com validações
- Criar use case `CreateBook`
- Criar controller `CreateBookController`
- Publicar evento `BookCreated`

## Arquivos Afetados
- `api/src/book/entities/Book.ts`
- `api/src/book/usecases/CreateBook.ts`
- `api/src/book/controllers/CreateBook.ts`

## Estimativa
3-5 horas

## Dependências
Nenhuma
```

**No Gerenciador de Cards:**
- Criar Task vinculada à Story
- Adicionar label `backend` ou `frontend`
- Deixar em BACKLOG
- Mover para PLANEJADO na sprint

**Relação com Status:**
- Tasks seguem o fluxo completo de status (BACKLOG → CONCLUÍDO)

---

### **🔧 Subtask (Subtarefa)**

**O que é?** Passo específico dentro de uma task.

**Quando criar?** Para quebrar task complexa em etapas menores.

**Exemplo:**
```markdown
# Subtask: Criar Entidade Book

## Task Pai
#791 - Implementar Endpoint POST /books

## Descrição
Criar entidade de domínio `Book` com validações.

## Checklist
- [ ] Criar arquivo `Book.ts`
- [ ] Adicionar propriedades (title, author, ISBN, totalCopies)
- [ ] Implementar método `create()`
- [ ] Adicionar validações de invariantes
- [ ] Escrever testes unitários

## Estimativa
1 hora
```

**No Gerenciador de Cards:**
- Criar Subtask dentro da Task
- Subtasks não têm status separado
- São marcadas como concluídas via checkbox

---

## 📌 Boas Práticas

### **Para Product Owners**
1. ✅ Escrever cards com requisitos claros e objetivos
2. ✅ Incluir critérios de aceite mensuráveis
3. ✅ Anexar protótipos e documentações relevantes
4. ✅ Priorizar tasks com base em valor de negócio
5. ✅ Manter épicos e stories atualizados
6. ✅ Participar ativamente das dailys para desbloquear impedimentos

### **Para Desenvolvedores**
1. ✅ Ler o card COMPLETAMENTE antes de começar
2. ✅ Tirar dúvidas ANTES de implementar
3. ✅ Seguir padrões do projeto ([DEVELOPMENT.md](./DEVELOPMENT.md))
4. ✅ Commitar frequentemente com mensagens descritivas
5. ✅ Testar localmente antes de abrir PR
6. ✅ Preencher template de PR completamente
7. ✅ Responder feedback de code review rapidamente
8. ✅ Atualizar status do card conforme progresso
9. ✅ Marcar card como BLOQUEADO imediatamente se houver impedimento

### **Para Revisores**
1. ✅ Priorizar revisões (não deixar PRs parados)
2. ✅ Fazer code review completo (código + testes + comportamento)
3. ✅ Dar feedback construtivo e específico
4. ✅ Referenciar linhas de código nos comentários
5. ✅ Testar comportamento localmente
6. ✅ Aprovar apenas se todos os requisitos forem atendidos
7. ✅ Comunicar aprovação ou reprovação claramente

---

## 🔔 Comunicação e Cerimônias

### **Daily (Diária)**

**Quando:** Todo dia útil, mesma hora

**Formato:** 15 minutos máximo

**Cada dev responde:**
1. O que fiz ontem?
2. O que vou fazer hoje?
3. Há algum impedimento?

**Usos:**
- Tirar dúvidas de cards
- Comunicar bloqueios
- Sincronizar time

---

### **Sprint Planning (Planejamento)**

**Quando:** Início da sprint (semanal ou quinzenal)

**Formato:** 1-2 horas

**Objetivos:**
1. Revisar backlog
2. Priorizar tasks para sprint
3. Mover cards para PLANEJADO
4. Dar assign para desenvolvedores
5. Estimar esforço

**Fluxo:**
1. PO apresenta épicos e stories priorizados
2. Time discute requisitos técnicos
3. PO e Time quebram stories em tasks
4. Time estima tasks
5. PO seleciona tasks para sprint baseado em capacidade
6. Assign de tasks para desenvolvedores

---

### **Sprint Review (Revisão)**

**Quando:** Final da sprint

**Formato:** 30-60 minutos

**Objetivos:**
1. Apresentar features concluídas
2. Demonstrar funcionalidades
3. Coletar feedback
4. Atualizar backlog

**Fluxo:**
1. Cada dev apresenta o que foi concluído
2. Demonstração das features
3. Stakeholders dão feedback
4. PO atualiza backlog baseado no feedback

---

### **Sprint Retrospective (Retrospectiva)**

**Quando:** Final da sprint (após review)

**Formato:** 30-45 minutos

**Objetivos:**
1. O que funcionou bem?
2. O que pode melhorar?
3. Ações de melhoria para próxima sprint

**Fluxo:**
1. Time reflete sobre a sprint
2. Levantamento de pontos positivos
3. Levantamento de pontos a melhorar
4. Definir ações concretas de melhoria
5. Assign de responsáveis por cada ação

---

## 📈 Métricas e KPIs

### **Indicadores de Saúde do Projeto:**

1. **Cycle Time** - Tempo médio de PLANEJADO → CONCLUÍDO
2. **Lead Time** - Tempo médio de BACKLOG → CONCLUÍDO
3. **Taxa de Revisão** - % de PRs aprovados na 1ª revisão
4. **Taxa de Bloqueio** - % de cards que vão para BLOQUEADO
5. **Velocity** - Quantidade de tasks concluídas por sprint

### **Metas Recomendadas:**

- Cycle Time: < 3 dias úteis
- Taxa de Revisão 1ª vez: > 70%
- Taxa de Bloqueio: < 10%
- Velocity: Estável e previsível

### **Como Medir:**

**Cycle Time:**
```
Data de CONCLUÍDO - Data de PLANEJADO = Cycle Time
```

**Lead Time:**
```
Data de CONCLUÍDO - Data de BACKLOG = Lead Time
```

**Taxa de Revisão 1ª vez:**
```
(PRs aprovados na 1ª revisão / Total de PRs) * 100 = Taxa de Revisão
```

**Taxa de Bloqueio:**
```
(Cards que foram BLOQUEADOS / Total de cards) * 100 = Taxa de Bloqueio
```

**Velocity:**
```
Soma de story points ou tasks concluídas na sprint = Velocity
```

---

## 🎯 Relação entre Gestão Ágil e Desenvolvimento

### Do Épico ao Código

**Epic** → Define grande iniciativa de negócio
- Ex: "Sistema de Gestão de Biblioteca"

**Story** → Define funcionalidade completa do usuário
- Ex: "Cadastrar livros no sistema"

**Task** → Define trabalho técnico específico
- Ex: "Implementar endpoint POST /books"
- **Aqui entra o DEVELOPMENT.md**: Task é transformada em código

**Subtask** → Define etapas dentro da task
- Ex: "Criar entidade Book", "Criar use case"

### Fluxo Integrado

```
1. PO cria Epic e Stories no gerenciador de cards
2. Sprint Planning: PO e Time quebram Stories em Tasks
3. Dev pega Task PLANEJADA → move para EM ANDAMENTO
4. Dev usa DEVELOPMENT.md para transformar Task em código
5. Dev segue COMPONENTS.md para implementar componentes
6. Dev abre PR → move card para REVISÃO PENDENTE
7. Reviewer faz review → move para CONCLUÍDO ou ALTERAÇÃO PENDENTE
8. Loop até CONCLUÍDO
9. Sprint Review: PO valida que Story está completa
10. Story marcada como CONCLUÍDA
11. Quando todas Stories do Epic completadas → Epic CONCLUÍDO
```

---

## ✨ Resumo Visual do Processo

```
═══════════════════════════════════════════════════════════
NÍVEL ESTRATÉGICO (PO)
═══════════════════════════════════════════════════════════

Epic: Sistema de Gestão de Biblioteca
  ↓
Story: Cadastro de Livros
  ↓
Tasks: [Backend] POST /books, [Frontend] Tela de cadastro

═══════════════════════════════════════════════════════════
NÍVEL TÁTICO (Time)
═══════════════════════════════════════════════════════════

Sprint Planning → Tasks vão para PLANEJADO
  ↓
Dev recebe assign → Task em EM ANDAMENTO
  ↓
Dev usa DEVELOPMENT.md → Implementa
  ↓
Dev abre PR → Task em REVISÃO PENDENTE
  ↓
Reviewer revisa → Task em EM REVISÃO
  ↓
    ┌─ Aprovado → CONCLUÍDO
    └─ Reprovado → ALTERAÇÃO PENDENTE → EM ANDAMENTO

═══════════════════════════════════════════════════════════
NÍVEL OPERACIONAL (Dev)
═══════════════════════════════════════════════════════════

1. Ler card (requisitos, critérios)
2. Seguir DEVELOPMENT.md (classificar task, usar CLI)
3. Implementar (seguir COMPONENTS.md)
4. Testar (linting, build, testes)
5. Abrir PR (template completo)
6. Responder review (implementar feedback)
7. Repeat até aprovação
```

---

## 🤝 Integração com Outras Documentações

- **[DEVELOPMENT.md](./DEVELOPMENT.md)** - Como transformar tasks em código
- **[backend/BACKEND.md](./backend/BACKEND.md)** - Como implementar componentes backend
- **[frontend/FRONTEND.md](./frontend/FRONTEND.md)** - Como implementar componentes frontend
- **[ui/COMPONENTS.md](./ui/COMPONENTS.md)** - Como implementar componentes primitivos
- **[README.md](./README.md)** - Visão geral da arquitetura

**Este documento (MANAGING.md)** foca em:
- Como organizar trabalho ágil
- Como gerenciar cards e status
- Como estruturar épicos, stories, tasks
- Como conduzir cerimônias ágeis

---

**Desenvolvido com metodologia ágil para máxima eficiência e qualidade** 🚀
