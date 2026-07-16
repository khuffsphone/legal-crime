#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(`TASK_INVALID: ${message}`);
  process.exitCode = 1;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pathMatches(candidate, rule) {
  const normalized = candidate.replaceAll('\\', '/');
  const pattern = rule.replaceAll('\\', '/');
  if (pattern.endsWith('/**')) return normalized.startsWith(pattern.slice(0, -3));
  if (pattern.endsWith('*')) return normalized.startsWith(pattern.slice(0, -1));
  if (pattern.endsWith('/')) return normalized.startsWith(pattern);
  return normalized === pattern;
}

const [taskFile, policyFile, changedFile] = process.argv.slice(2);
if (!taskFile || !policyFile) {
  console.error('Usage: validate-task.mjs TASK.json POLICY.json [CHANGED_PATHS.txt]');
  process.exit(2);
}

const task = readJson(taskFile);
const policy = readJson(policyFile);
const errors = [];
const requireValue = (condition, message) => { if (!condition) errors.push(message); };

requireValue(task.schema_version === '1.0.0', 'schema_version must be 1.0.0');
requireValue(/^BM-[0-9]{8}-[0-9]{3,}$/.test(task.task_id ?? ''), 'task_id is invalid');
requireValue(typeof task.objective === 'string' && task.objective.length >= 12, 'objective is too short');
requireValue(task.base_branch === policy.canonical_branch, `base_branch must be ${policy.canonical_branch}`);
requireValue(/^[0-9a-f]{40}$/.test(task.base_commit ?? ''), 'base_commit must be a full commit SHA');
requireValue(typeof task.idempotency_key === 'string' && task.idempotency_key.length >= 16, 'idempotency_key is missing');
requireValue(asArray(task.brain_inputs).length <= 12, 'too many Brain inputs');
requireValue(asArray(task.scope?.allowed_paths).length > 0, 'scope.allowed_paths is required');
requireValue(asArray(task.acceptance).length > 0, 'acceptance criteria are required');
requireValue(['gpt', 'codex', 'claude', 'gemini'].includes(task.routing?.primary), 'primary route is invalid');
requireValue(['codex', 'claude', 'gemini'].includes(task.routing?.reviewer), 'reviewer route is invalid');
requireValue(task.routing?.primary !== task.routing?.reviewer, 'primary and reviewer must be different providers');
requireValue(['low', 'medium', 'high'].includes(task.risk), 'risk is invalid');
requireValue(['draft_only', 'open_pr', 'auto_merge_if_green', 'human_approval'].includes(task.autonomy), 'autonomy is invalid');

const budget = task.budget ?? {};
requireValue(Number.isInteger(budget.max_agent_calls) && budget.max_agent_calls <= policy.budgets.maximum_agent_calls_per_task, 'agent-call budget exceeds policy');
requireValue(Number.isInteger(budget.max_runtime_minutes) && budget.max_runtime_minutes <= policy.budgets.maximum_runtime_minutes, 'runtime budget exceeds policy');
requireValue(Number(budget.max_estimated_usd) <= policy.budgets.maximum_estimated_usd_per_task, 'cost budget exceeds policy');
requireValue(Number.isInteger(budget.max_rework_cycles) && budget.max_rework_cycles <= policy.queue.maximum_rework_cycles, 'rework budget exceeds policy');

const allowed = asArray(task.scope?.allowed_paths);
const forbidden = asArray(task.scope?.forbidden_paths);
for (const locked of policy.always_human_review) {
  if (allowed.some((rule) => pathMatches(locked, rule) || pathMatches(rule.replace('/**', ''), locked))) {
    requireValue(task.autonomy !== 'auto_merge_if_green', `automatic merge cannot include protected path ${locked}`);
  }
}
for (const magnet of policy.collision_magnets) {
  if (allowed.some((rule) => pathMatches(magnet, rule))) {
    requireValue(task.autonomy === 'human_approval' || task.risk === 'high', `collision magnet ${magnet} requires high risk or human approval`);
  }
}

if (changedFile) {
  const changed = fs.readFileSync(path.resolve(changedFile), 'utf8').split(/\r?\n/).filter(Boolean);
  for (const changedPath of changed) {
    requireValue(allowed.some((rule) => pathMatches(changedPath, rule)), `changed path is outside allowed scope: ${changedPath}`);
    requireValue(!forbidden.some((rule) => pathMatches(changedPath, rule)), `changed path is forbidden: ${changedPath}`);
  }
}

if (errors.length) {
  errors.forEach(fail);
} else {
  console.log(`TASK_VALID: ${task.task_id}`);
}
