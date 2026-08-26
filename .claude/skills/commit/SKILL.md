---
name: commit
description: Create a well-formatted git commit. Use when ready to commit changes with proper message and co-author attribution. Use this skill for conventional commit formatting, smart staging, and proper Co-Authored-By tagging.
---

# Create Git Commit

Creates a well-formatted git commit following project conventions.

## Prerequisites

- Changes ready to commit
- Working directory has modifications

## Process

### Step 1: Check Status

```bash
git status
```

Review:
- Staged changes
- Unstaged changes
- Untracked files

### Step 2: Review Changes

```bash
# See all changes
git diff

# See staged changes
git diff --staged

# See recent commits for style reference
git log --oneline -5
```

### Step 3: Stage Files

```bash
# Stage specific files by name (preferred — avoids accidentally staging secrets or generated files)
git add <file1> <file2>

# Stage all files in a specific directory
git add packages/api/typescript/src/product/

# AVOID: git add . or git add -A (can stage sensitive files like .env or large binaries)
# AVOID: git add -p (requires interactive input, not supported in agent mode)
```

**Don't commit:**
- `.env` files with secrets
- `node_modules/`
- Build artifacts
- Generated files (unless intentional)

### Step 4: Write Commit Message

**Format:**
```
<type>: <short description>

<optional body explaining why>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `docs`: Documentation
- `style`: Formatting (no code change)
- `test`: Adding tests
- `chore`: Maintenance tasks

**Examples:**
```bash
# Simple feature
git commit -m "$(cat <<'EOF'
feat: add product creation endpoint

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

# Bug fix with explanation
git commit -m "$(cat <<'EOF'
fix: correct query param parsing in ListProducts

Query params were not being converted from strings,
causing type errors when filtering by page number.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

# Refactoring
git commit -m "$(cat <<'EOF'
refactor: extract ProductCard component

Reduces duplication in product listing pages
and improves maintainability.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

### Step 5: Verify Commit

```bash
# Check commit was created
git log -1

# Verify files included
git show --stat HEAD
```

## Commit Message Guidelines

### Subject Line

- **Max 50 characters** (hard limit: 72)
- **Imperative mood**: "add feature" not "added feature"
- **No period at end**
- **Lowercase** (except proper nouns)

### Body (when needed)

- **Wrap at 72 characters**
- **Explain why**, not what (code shows what)
- **Separate from subject** with blank line

### Good vs Bad Messages

```bash
# Good ✓
feat: add user authentication with JWT
fix: handle null case in product lookup
refactor: simplify order state machine

# Bad ✗
update code                    # Too vague
Fixed bug                      # Past tense, no details
Add new feature for users.     # Period, vague
FEAT: ADD AUTHENTICATION       # Caps, shouty
```

## Multi-File Commits

When committing related changes across multiple files:

```bash
# Stage related files
git add packages/api/typescript/src/product/controllers/CreateProduct.ts
git add packages/api/typescript/src/product/controllers/index.ts
git add packages/api/typescript/src/product/errors/index.ts

# Commit with descriptive message
git commit -m "$(cat <<'EOF'
feat: add CreateProduct controller

- Define InputSchema with validation
- Define OutputSchema with examples
- Register errors in GlobalErrorMapper

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

## Commit Separation

**Separate commits for:**
- Different features
- Backend vs frontend changes (sometimes)
- Refactoring vs new features

**Single commit for:**
- Related changes that make sense together
- Feature + its tests
- Controller + error registration

## Pre-Commit Checks

Before committing, ensure:

```bash
# Type check
bun tsc

# Lint
bun lint

# Tests (if available)
bun test
```

## Amending Commits

**Only amend if:**
1. Commit was just made (not pushed)
2. Need to add forgotten files
3. Need to fix typo in message

```bash
# Add more changes to last commit
git add <forgotten-file>
git commit --amend --no-edit

# Fix commit message
git commit --amend -m "$(cat <<'EOF'
feat: corrected message

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

**Never amend if:**
- Commit was pushed to remote
- Others might have pulled

## Commit Checklist

- [ ] Changes reviewed with `git diff`
- [ ] Only relevant files staged
- [ ] No secrets or sensitive data
- [ ] No generated files (unless intentional)
- [ ] Message follows format
- [ ] Type is appropriate
- [ ] Subject is clear and concise
- [ ] Co-author line included
- [ ] Commit verified with `git log -1`

## Example Workflow

```bash
# 1. Check what changed
git status
git diff

# 2. Stage files
git add packages/api/typescript/src/product/

# 3. Create commit
git commit -m "$(cat <<'EOF'
feat: implement product CRUD endpoints

- CreateProduct: POST /product
- UpdateProduct: PUT /product/:id
- DeleteProduct: DELETE /product/:id
- GetProduct: GET /product/:id
- ListProducts: GET /product

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

# 4. Verify
git log -1 --stat
```

## References

- Conventional Commits: https://www.conventionalcommits.org/
- Git Documentation: https://git-scm.com/docs
