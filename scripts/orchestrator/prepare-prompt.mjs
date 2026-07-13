#!/usr/bin/env node

import fs from 'node:fs';

const [taskB64, templateFile, outputFile] = process.argv.slice(2);
if (!taskB64 || !templateFile || !outputFile) throw new Error('Usage: prepare-prompt.mjs TASK_B64 TEMPLATE OUTPUT');
const task = JSON.parse(Buffer.from(taskB64, 'base64url').toString('utf8'));
const template = fs.readFileSync(templateFile, 'utf8');
const prompt = template
  .replace('{{TASK_ENVELOPE}}', JSON.stringify(task, null, 2))
  .replace('{{BASE_COMMIT}}', task.base_commit)
  .replace('{{SCOPED_BRAIN_CONTEXT}}', 'Brain inputs are identified in the task envelope. Stop as BLOCKED if their verified contents are not present in the runner context.')
  .replace('{{RELEVANT_FILES}}', task.scope.allowed_paths.join('\n'));
fs.writeFileSync(outputFile, prompt);
console.log(`PROMPT_READY: ${task.task_id}`);
