# Processo de Prototipação e Implementação de UI

Este documento descreve o fluxo completo de implementação de UI, desde a inspiração inicial até a criação de componentes primitivos reutilizáveis.

---

## 📋 Índice

- [Fluxo Completo de Implementação](#fluxo-completo-de-implementação)
- [Etapas Detalhadas](#etapas-detalhadas)
- [Estrutura do SYSTEM.md](#estrutura-do-systemmd)
- [Criação de Componentes Primitivos](#criação-de-componentes-primitivos)
- [Processo Iterativo](#processo-iterativo)
- [Referências](#referências)

---

## Fluxo Completo de Implementação

O processo de implementação de UI segue este fluxo sequencial:

```
1. Foto ou HTML de System Design Inspirado
           ↓
2. Implementar a Página Igual à Informada
           ↓
3. Entender Melhor os Componentes e Criar Outra Página de Outro Nicho
           ↓
4. Criar um Aplicativo TODO com Esse Entendimento
           ↓
5. Analisar Profundamente a Implementação e Criar o Design System (SYSTEM.md)
           ↓
6. Baseado no Design System Criar os Componentes Primitivos
           ↓
7. Replicar o Aplicativo TODO com os Componentes Primitivos
```

---

## Etapas Detalhadas

### 1. Foto ou HTML de System Design Inspirado

**Objetivo**: Encontrar uma referência visual de design que servirá como base para a implementação.

**Atividades**:
- Buscar designs inspiradores (Dribbble, Behance, etc.)
- Identificar um design que se alinha com o objetivo do projeto
- Capturar screenshot ou obter HTML/CSS da referência
- Analisar a estrutura visual e componentes presentes

**Entregas**:
- Referência visual (foto ou HTML)
- Análise inicial dos componentes identificados

**Referências**:
- Este é um passo de pesquisa e inspiração, não possui documentação técnica específica

---

### 2. Implementar a Página Igual à Informada

**Objetivo**: Replicar fielmente a referência visual escolhida, implementando pixel-perfect.

**Atividades**:
- Analisar a estrutura HTML da referência
- Extrair todos os estilos CSS
- Implementar a página HTML/CSS completa
- Garantir fidelidade visual à referência
- Testar em diferentes dispositivos (se aplicável)

**Entregas**:
- Página HTML/CSS implementada
- Fidelidade visual à referência

**Referências**:
- **[../frontend/FRONTEND.md](../frontend/FRONTEND.md)** - Estrutura de componentes e organização
- Use ferramentas de inspeção do navegador para extrair estilos

---

### 3. Entender Melhor os Componentes e Criar Outra Página de Outro Nicho

**Objetivo**: Expandir o entendimento dos componentes criando uma segunda página em um nicho diferente, identificando padrões e variações.

**Atividades**:
- Escolher um segundo design de nicho diferente
- Implementar a segunda página
- Identificar componentes similares e variações
- Documentar padrões encontrados
- Comparar estilos entre as duas páginas

**Entregas**:
- Segunda página implementada
- Lista de componentes identificados
- Padrões e variações documentados

**Referências**:
- **[../frontend/FRONTEND.md](../frontend/FRONTEND.md)** - Padrões de componentes
- Análise comparativa entre as implementações

---

### 4. Criar um Aplicativo TODO com Esse Entendimento

**Objetivo**: Consolidar o aprendizado criando um aplicativo completo (TODO) usando os padrões identificados nas etapas anteriores.

**Atividades**:
- Definir funcionalidades do aplicativo TODO
- Implementar todas as telas necessárias
- Reutilizar padrões identificados nas etapas anteriores
- Garantir consistência visual em todas as telas
- Implementar interações e estados

**Entregas**:
- Aplicativo TODO completo e funcional
- Todas as telas implementadas
- Padrões consolidados

**Referências**:
- **[FRONTEND.md](./FRONTEND.md)** - Estrutura de rotas e páginas
- Exemplo prático: `todo.html` no projeto

---

### 5. Analisar Profundamente a Implementação e Criar o Design System

**Objetivo**: Extrair e documentar todos os aspectos visuais e de design do aplicativo implementado, criando o `SYSTEM.md` (Design System) completo.

**Atividades**:
- Analisar todo o código HTML/CSS do aplicativo
- Definir Intent (quem, o que, como deve parecer) e Direction (domínio, mundo de cores, assinatura)
- Extrair paleta de cores completa em OKLCH
- Documentar tipografia e hierarquia
- Identificar sistema de espaçamentos e unidade base
- Documentar depth (bordas, sombras, elevação)
- Definir radius base e escala
- Mapear layout patterns (container, grid, breakpoints)
- Documentar interação (timing, hover, focus, selected)
- Identificar biblioteca de ícones e padrões
- Catalogar todos os componentes primitivos
- Definir tokens de dark mode
- Listar patterns to preserve

**Entregas**:
- `SYSTEM.md` na raiz do projeto
- `app/src/index.css` atualizado com CSS variables

**Referências**:
- **[Estrutura do SYSTEM.md](#estrutura-do-systemmd)** - Seção abaixo com estrutura completa
- **[/design-system](../.claude/skills/design-system/SKILL.md)** - Skill para gerar o Design System
- **Localização**: O Design System deve ser salvo como `SYSTEM.md` na raiz do projeto

---

### 6. Baseado no Design System Criar os Componentes Primitivos

**Objetivo**: Transformar os tokens e padrões documentados no `SYSTEM.md` em componentes primitivos reutilizáveis e composáveis.

**Atividades**:
- Identificar componentes primitivos necessários (seção Components do SYSTEM.md)
- Implementar cada componente seguindo os tokens do SYSTEM.md
- Criar variantes e estados
- Garantir acessibilidade
- Documentar API de cada componente

**Entregas**:
- Biblioteca de componentes primitivos implementada
- Componentes documentados e testados

**Referências**:
- **[COMPONENTS.md](./COMPONENTS.md)** - Guia completo de criação de componentes primitivos
- **[FRONTEND.md](./FRONTEND.md)** - Seção sobre componentes primitivos

---

### 7. Replicar o Aplicativo TODO com os Componentes Primitivos

**Objetivo**: Refatorar o aplicativo TODO para usar os componentes primitivos criados, validando a reutilização e composição.

**Atividades**:
- Substituir implementações customizadas por componentes primitivos
- Validar que todos os componentes funcionam corretamente
- Ajustar componentes primitivos se necessário
- Garantir que o resultado visual seja idêntico
- Otimizar e refatorar código

**Entregas**:
- Aplicativo TODO refatorado com componentes primitivos
- Biblioteca de componentes validada
- Código mais limpo e reutilizável

**Referências**:
- **[COMPONENTS.md](./COMPONENTS.md)** - Padrões de uso de componentes
- **[FRONTEND.md](./FRONTEND.md)** - Hierarquia de componentes

---

## Estrutura do SYSTEM.md

O `SYSTEM.md` é o Design System do projeto. Ele documenta todas as decisões visuais e serve como referência para componentes primitivos e páginas.

### Estrutura Obrigatória

| # | Seção | O que documenta |
|---|-------|-----------------|
| 1 | **Intent** | Quem usa, o que faz, como deve parecer |
| 2 | **Direction** | Conceitos do domínio, mundo de cores, assinatura visual |
| 3 | **Palette** | Foundation (bg, fg), Accent (primary, accent), Semantic (destructive, muted), Charts |
| 4 | **Typography** | Família, tamanho base, pesos, escala |
| 5 | **Spacing** | Unidade base, multiplicadores, padrões comuns |
| 6 | **Depth** | Filosofia (shadows vs borders), bordas, sombras, elevação |
| 7 | **Radius** | Valor base, escala (sm a 2xl), uso por componente |
| 8 | **Layout** | Container, grid, breakpoints responsivos |
| 9 | **Interaction** | Timing, easing, hover, active/selected, focus |
| 10 | **Icons** | Biblioteca, tamanho padrão, cor, stroke width |
| 11 | **Components** | Referência breve de cada primitivo (Cards, Buttons, Badges, Avatars, etc.) |
| 12 | **Dark Mode** | Ajustes de tokens para tema escuro |
| 13 | **Patterns to Preserve** | Lista numerada de decisões visuais distintivas |

### Regras de Escrita

1. **Cores em OKLCH**: Todas as cores devem usar `oklch()` para uniformidade perceptual
2. **Rationale obrigatório**: Todo token inclui explicação após `—` (ex: `oklch(1 0 0) — clinical cleanliness`)
3. **Tailwind classes**: Exemplos de componentes usam classes Tailwind, nunca CSS raw
4. **Sem valores órfãos**: Toda cor no SYSTEM.md deve ter um CSS variable correspondente em `app/src/index.css`

### Relação com CSS Variables

O `SYSTEM.md` e o `app/src/index.css` devem estar sincronizados:

```
SYSTEM.md (Palette)          →  index.css (:root)           →  Tailwind (classes)
────────────────────────────────────────────────────────────────────────────────
Primary: oklch(0.56 0.1 182) →  --primary: oklch(0.56 0.1 182) →  bg-primary
Background: oklch(1 0 0)     →  --background: oklch(1 0 0)     →  bg-background
```

### Como Gerar

Use a skill `/design-system` passando uma referência visual:

```
/design-system [screenshot, HTML/CSS, ou descrição]
```

A skill analisa a referência, gera o `SYSTEM.md` e atualiza `app/src/index.css`.

---

## Criação de Componentes Primitivos

Após ter o `SYSTEM.md` completo, use-o como base para criar os componentes primitivos.

### Processo

1. **Identifique componentes primitivos** no SYSTEM.md (seção Components)
2. **Siga o guia de criação** de componentes primitivos
3. **Implemente cada componente** seguindo os tokens do SYSTEM.md
4. **Crie variantes e estados** conforme documentado
5. **Valide acessibilidade** e funcionalidade

### Referências

- **[COMPONENTS.md](./COMPONENTS.md)** - Arquitetura de componentes
- **[FRONTEND.md](./FRONTEND.md)** - Seção sobre componentes primitivos e hierarquia
- **[/primitive](../.claude/skills/primitive/SKILL.md)** - Skill para criar primitivos

---

## Processo Iterativo

O processo de prototipação é **iterativo** em todas as etapas:

### Iteração em Implementação
1. Implementar página/componente
2. Revisar e validar
3. Ajustar com base no feedback
4. Repetir até aprovação

### Iteração em Design System
1. Gerar SYSTEM.md inicial (usar `/design-system`)
2. Revisar completude das seções
3. Adicionar tokens e componentes faltantes
4. Refinar especificações e sincronizar com `index.css`

### Iteração em Componentes Primitivos
1. Implementar componente
2. Testar em contexto real
3. Ajustar conforme necessário
4. Validar reutilização

**Ciclo contínuo**: Todas as etapas podem ser revisitadas e melhoradas continuamente com base em novos aprendizados e necessidades.

---

## Resumo do Fluxo Visual

```
┌─────────────────────────────────────────────────────────┐
│  1. Foto/HTML de System Design Inspirado               │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  2. Implementar Página Igual à Referência              │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  3. Criar Outra Página de Outro Nicho                  │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  4. Criar Aplicativo TODO Completo                     │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  5. Analisar e Criar Design System (SYSTEM.md)          │
│     (usar /design-system)                               │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  6. Criar Componentes Primitivos                       │
│     (baseado no SYSTEM.md)                              │
└────────────────────┬────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────┐
│  7. Replicar TODO com Componentes Primitivos           │
└─────────────────────────────────────────────────────────┘
```

---

## Princípios-Chave

- ✅ **Fidelidade visual**: Implementar pixel-perfect na etapa inicial
- ✅ **Documentação completa**: SYSTEM.md deve documentar todas as decisões visuais
- ✅ **Componentes explícitos**: Todos os componentes primitivos devem ser documentados
- ✅ **Reutilização**: Componentes primitivos devem ser reutilizáveis
- ✅ **Composição**: Componentes primitivos devem ser composáveis
- ✅ **Iteração contínua**: Processo iterativo em todas as etapas
- ✅ **Validação prática**: Validar componentes em contexto real

---

## Referências

- **[COMPONENTS.md](./COMPONENTS.md)** - Guia completo de criação de componentes primitivos
- **[FRONTEND.md](./FRONTEND.md)** - Estrutura de componentes e hierarquia
- **[FRONTEND.md](./FRONTEND.md)** - Seção sobre organização de componentes

---

**Última atualização**: Este documento reflete o fluxo atual de prototipação e implementação de UI do projeto.
