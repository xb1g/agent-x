---
name: fullstack-worker
description: Full-stack worker for Agent-X — handles UI, API routes, pipeline logic, and database changes
---

# Fullstack Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Any feature touching the Agent-X codebase: UI changes (page.tsx, globals.css, components), API routes, pipeline logic (lib/), database schema, or new integrations.

## Required Skills

- `agent-browser` — For manual verification of UI changes. Invoke after implementing any user-facing feature to visually verify the result in the browser. Start the dev server (`PORT=3100 pnpm dev`), navigate to http://localhost:3100, and take screenshots.

## Work Procedure

### 1. Understand the Feature
- Read the feature description, preconditions, expectedBehavior, and verificationSteps thoroughly
- Read `AGENTS.md` for coding conventions and boundaries
- Read relevant `.factory/library/` files for context
- Identify which files need changes (check `architecture.md` for key file locations)

### 2. Read Existing Code
- Read the specific sections of code you'll be modifying
- For `app/page.tsx` (44KB): read only the relevant sections, not the whole file
- For `lib/xpoz.ts` (30KB): read only the relevant functions
- Understand existing patterns before writing new code

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

### 5. Manual Verification with agent-browser
- Start dev server: `PORT=3100 pnpm dev &` (background)
- Wait for server to be ready: check with `curl -sf http://localhost:3100`
- Invoke the `agent-browser` skill
- Navigate to http://localhost:3100
- Test the specific feature:
  - For UI changes: take screenshots, verify visual appearance
  - For wizard changes: walk through the wizard flow
  - For board changes: inspect segment cards, open inspect modal
  - For interview changes: send messages, check responses
- Record each check as an `interactiveChecks` entry
- Stop dev server: `lsof -ti :3100 | xargs kill 2>/dev/null`

### 6. Final Verification
- Run full test suite: `pnpm tsx --test lib/*.test.ts`
- Run typecheck: `npx tsc --noEmit`
- Run build: `pnpm build`
- Fix any issues found

### 7. Commit
- `git add` changed files
- Commit with descriptive message

## Example Handoff

```json
{
  "salientSummary": "Added 4th confirmation step to wizard with segment/problem/ICP preview. Fixed stale state bug by passing ICP directly to handleDiscover instead of reading from memo. Added rapid-click guard with isDiscovering flag. Verified with agent-browser: walked through all 4 wizard steps, confirmed only 1 /api/discover call fires.",
  "whatWasImplemented": "Wizard confirmation step (step 4) showing selected segment, problem, and computed ICP description. Back navigation from confirm to problem step. Start Research button with disabled state during discovery. Fixed handleStartResearch to pass computed ICP directly as parameter to handleDiscover, bypassing stale useMemo. Added isDiscovering guard to prevent double-clicks.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "pnpm tsx --test lib/*.test.ts", "exitCode": 0, "observation": "All 24 tests passing including 3 new wizard state tests" },
      { "command": "npx tsc --noEmit", "exitCode": 0, "observation": "No type errors, WizardStep type includes 'confirm'" },
      { "command": "pnpm build", "exitCode": 0, "observation": "Build successful" }
    ],
    "interactiveChecks": [
      { "action": "Navigated to http://localhost:3100, completed wizard steps 1-3 with custom segment 'Remote managers' and problem 'async communication'", "observed": "Confirmation step displayed showing 'Remote managers', 'async communication', and ICP preview 'Remote managers — async communication'" },
      { "action": "Clicked Start Research on confirmation step", "observed": "Button disabled with 'Starting...' text. Single /api/discover POST in network tab with correct ICP. Auto-switched to Board tab with new segment card." },
      { "action": "Clicked Back from confirmation step", "observed": "Returned to problem step with 'async communication' still selected. Navigated back through all steps — all values preserved." },
      { "action": "Completed wizard again and rapid-clicked Start Research 5 times", "observed": "Only 1 /api/discover request in network tab. Only 1 segment card on board." }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "lib/wizard.test.ts",
        "cases": [
          { "name": "buildIcpDescription returns formatted string", "verifies": "ICP description format" },
          { "name": "confirmation step preserves wizard selections", "verifies": "State preservation across steps" },
          { "name": "handleDiscover receives direct ICP parameter", "verifies": "No stale memo dependency" }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Feature depends on a DB table or API endpoint that doesn't exist yet and isn't in scope for this feature
- The dev server won't start (port conflict, missing env vars, build error)
- Existing tests fail before you've made any changes (pre-existing issue)
- Requirements are ambiguous — multiple valid interpretations that significantly affect implementation
- The feature scope is too large for a single session (estimate > 45 min of active coding)
