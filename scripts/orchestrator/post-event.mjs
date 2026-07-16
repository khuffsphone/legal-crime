#!/usr/bin/env node

import fs from 'node:fs';

const [issueNumber, eventFile] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
if (!issueNumber || !eventFile || !token || !repository) {
  throw new Error('Usage: post-event.mjs ISSUE_NUMBER EVENT_FILE with GITHUB_TOKEN and GITHUB_REPOSITORY.');
}

const event = JSON.parse(fs.readFileSync(eventFile, 'utf8'));
const response = await fetch(`https://api.github.com/repos/${repository}/issues/${issueNumber}/comments`, {
  method: 'POST',
  headers: {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    body: `<!-- brassmere-event:v1 -->\n\`\`\`json\n${JSON.stringify(event, null, 2)}\n\`\`\``
  })
});
if (!response.ok) throw new Error(`Failed to post event: ${response.status} ${await response.text()}`);
console.log(`EVENT_POSTED: ${event.event} for ${event.task_id}`);
