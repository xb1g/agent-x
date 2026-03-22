# Fullauto Skill Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a global `fullauto` skill for Codex and Claude that interprets explicit `/fullauto` and fuzzy green-light phrasing as permission to execute aggressively with maximum safe autonomy.

**Architecture:** Create one shared skill concept with two installs: a Codex global skill in `~/.codex/skills/fullauto` and a Claude global skill in `~/.claude/skills/fullauto`. Keep the instructions concise and execution-focused, and include Codex UI metadata in `agents/openai.yaml`.

**Tech Stack:** Markdown skill manifests, YAML UI metadata

---

### Task 1: Create the plan and skill directories

**Files:**
- Create: `/Users/bunyasit/dev/agent-x/docs/plans/2026-03-21-fullauto-skill.md`
- Create: `/Users/bunyasit/.codex/skills/fullauto/SKILL.md`
- Create: `/Users/bunyasit/.codex/skills/fullauto/agents/openai.yaml`
- Create: `/Users/bunyasit/.claude/skills/fullauto/SKILL.md`

**Step 1: Create the target directories**

Run: `mkdir -p /Users/bunyasit/dev/agent-x/docs/plans /Users/bunyasit/.codex/skills/fullauto/agents /Users/bunyasit/.claude/skills/fullauto`
Expected: directories exist with no errors

**Step 2: Write the skill manifests**

Create concise manifests that define fuzzy trigger phrases, aggressive execution defaults, and the boundary that safety, sandboxing, and explicit user constraints still apply.

**Step 3: Write Codex UI metadata**

Add `agents/openai.yaml` with a direct `default_prompt` that invokes `$fullauto`.

**Step 4: Verify file presence**

Run: `find /Users/bunyasit/.codex/skills/fullauto /Users/bunyasit/.claude/skills/fullauto -maxdepth 2 -type f | sort`
Expected: all three created files appear
