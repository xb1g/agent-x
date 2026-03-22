---
name: fullstack-worker
description: Full-stack worker for Agent-X — handles UI, API routes, pipeline logic, and database changes
---

# Fullstack Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Any feature touching the Agent-X codebase: UI changes (page.tsx, globals.css, components), API routes, pipeline logic (lib/), database schema, or new integrations.

## Required Skills

None. Agent-browser is used only during milestone validation, not during feature implementation.

## Work Procedure

### 1. Understand the Feature
- Read the feature description, preconditions, expectedBehavior, and verificationSteps
- Read `AGENTS.md` for coding conventions and boundaries
- Read relevant `.factory/library/` files for context

### 2. Read ONLY the Relevant Code
- **CRITICAL: Do NOT read entire large files.** app/page.tsx is 44KB, globals.css is 41KB, lib/xpoz.ts is 30KB.
- Use Grep to find the specific sections you need to modify
- Read only the relevant 50-100 lines of context around your changes
- Read the full file ONLY for small files (< 5KB)

### 3. Write Tests First (TDD)
- Write failing tests in `lib/{module}.test.ts` using Node.js built-in test runner:
  ```typescript
  import { describe, it } from 'node:test'
  import assert from 'node:assert/strict'
  ```
- Cover the expectedBehavior items from the feature spec
- Run tests to confirm they fail: `pnpm tsx --test lib/*.test.ts`
- For UI-only changes without testable logic, skip to step 4

### 4. Implement
- Write the implementation to make tests pass
- Follow existing patterns:
  - CSS: Use CSS custom properties from globals.css (--bg, --text, --primary, etc.)
  - API routes: Zod validation, try/catch, proper HTTP status codes
  - DB: Use lib/db.ts patterns, add migrations to supabase/migrations/
  - AI: Use @ai-sdk/google with generateText/streamText patterns from lib/gemini.ts
- Run tests: `pnpm tsx --test lib/*.test.ts`
- Run typecheck: `npx tsc --noEmit`

### 5. Final Verification
- Run full test suite: `pnpm tsx --test lib/*.test.ts`
- Run typecheck: `npx tsc --noEmit`
- Fix any issues found
- Do NOT start a dev server or use agent-browser — that happens during milestone validation

### 6. Commit
- `git add` changed files
- Commit with descriptive message

## Example Handoff

```json
{
  "salientSummary": "Added 4th confirmation step to wizard with segment/problem/ICP preview. Fixed stale state bug by passing ICP directly instead of reading from memo. Added rapid-click guard. All 32 tests pass, typecheck clean.",
  "whatWasImplemented": "Wizard confirmation step (step 4) showing selected segment, problem, and ICP description. Back navigation preserving state. Start Research with disabled state during discovery. Fixed stale ICP by passing as direct parameter.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "pnpm tsx --test lib/*.test.ts", "exitCode": 0, "observation": "All 32 tests passing including 3 new tests" },
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "No type errors" }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "lib/wizard.test.ts",
        "cases": [
          { "name": "buildIcpDescription returns formatted string", "verifies": "ICP format" },
          { "name": "confirmation preserves wizard selections", "verifies": "State preservation" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Feature depends on a DB table or API endpoint that doesn't exist yet
- The feature scope is too large (estimate > 30 min of active coding)
- Existing tests fail before your changes (pre-existing issue)
- Requirements are ambiguous with multiple valid interpretations
