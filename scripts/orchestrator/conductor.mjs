#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const outputPath = process.env.GITHUB_OUTPUT;
const policyPath = process.env.BRASSMERE_POLICY ?? 'orchestration/policy.json';
const policy = JSON.parse(fs.readFileSync(path.resolve(policyPath), 'utf8'));

function output(name, value) {
  if (outputPath) fs.appendFileSync(outputPath, `${name}=${value}\n`);
  else console.log(`${name}=${value}`);
}

function extractTask(body) {
  const match = body?.match(/<!--\s*brassmere-task:v1\s*-->([\s\S]*?)<!--\s*\/brassmere-task:v1\s*-->/i);
  if (!match) return null;
  const json = match[1].replace(/^\s*```json\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return JSON.parse(json);
}

async function api(route, options = {}) {
  const response = await fetch(`https://api.github.com${route}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${route}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

if (!policy.enabled) {
  output('found', 'false');
  output('status', 'disabled-by-policy');
  process.exit(0);
}
if (!token || !repository) throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required.');

const [owner, repo] = repository.split('/');
const issues = await api(`/repos/${owner}/${repo}/issues?state=open&sort=created&direction=asc&per_page=100`);
const allowedAssociations = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
let selected = null;

for (const issue of issues) {
  if (issue.pull_request || !allowedAssociations.has(issue.author_association)) continue;
  let task;
  try { task = extractTask(issue.body); } catch { continue; }
  if (!task) continue;

  const comments = await api(`/repos/${owner}/${repo}/issues/${issue.number}/comments?per_page=100`);
  const activeLease = comments
    .filter((comment) => comment.body?.includes('<!-- brassmere-lease:v1 -->'))
    .map((comment) => comment.body.match(/expires_at:\s*([^\s]+)/)?.[1])
    .filter(Boolean)
    .some((date) => Date.parse(date) > Date.now());
  if (activeLease) continue;
  selected = { issue, task };
  break;
}

if (!selected) {
  output('found', 'false');
  output('status', 'queue-empty');
  process.exit(0);
}

const leaseExpires = new Date(Date.now() + policy.queue.lease_minutes * 60_000).toISOString();
await api(`/repos/${owner}/${repo}/issues/${selected.issue.number}/comments`, {
  method: 'POST',
  body: JSON.stringify({ body: `<!-- brassmere-lease:v1 -->\nstate: claimed\nrun_id: ${process.env.GITHUB_RUN_ID ?? 'local'}\nexpires_at: ${leaseExpires}` })
});

output('found', 'true');
output('status', 'claimed');
output('issue_number', String(selected.issue.number));
output('task_id', selected.task.task_id);
output('primary', selected.task.routing.primary);
output('reviewer', selected.task.routing.reviewer);
output('base_commit', selected.task.base_commit);
output('autonomy', selected.task.autonomy);
output('task_b64', Buffer.from(JSON.stringify(selected.task)).toString('base64url'));
