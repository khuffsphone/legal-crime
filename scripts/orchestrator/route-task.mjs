#!/usr/bin/env node

import fs from 'node:fs';

const task = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const recommended = {
  design: ['gpt', 'claude'],
  research: ['gpt', 'claude'],
  brain_reconciliation: ['gpt', 'claude'],
  architecture: ['claude', 'codex'],
  recon: ['claude', 'codex'],
  implementation: ['codex', 'claude'],
  test: ['codex', 'claude'],
  refactor: ['codex', 'claude'],
  visual: ['gemini', 'codex'],
  ui: ['gemini', 'codex']
};

const [defaultPrimary, defaultReviewer] = recommended[task.task_type] ?? ['codex', 'claude'];
const primary = task.routing?.primary ?? defaultPrimary;
const reviewer = task.routing?.reviewer ?? defaultReviewer;
if (primary === reviewer) throw new Error('Primary and reviewer must be different providers.');

const result = { task_id: task.task_id, primary, reviewer, recommended_primary: defaultPrimary, recommended_reviewer: defaultReviewer };
console.log(JSON.stringify(result));
