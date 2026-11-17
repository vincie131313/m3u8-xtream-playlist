'use strict';

/**
 * Spec for plaintext Xtream subscriber credentials committed in this repo.
 *
 * These tests describe the secure state. They fail while usernames and
 * passwords are still embedded in the playlist manifest or in filenames
 * under streams/, and they pass once those values are gone.
 *
 * Failure messages intentionally omit credential values, URLs, and filenames.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const scriptPath = path.join(root, 'script.js');
const streamsDir = path.join(root, 'streams');

const URL_RE = /https?:\/\/[^\s"'`<>\\]+/g;

// Longest prefix first so a catalog action is not trimmed to a shorter one.
const CATALOG_ACTIONS = [
  'get_series_categories',
  'get_live_categories',
  'get_vod_categories',
  'get_simple_data_table',
  'get_series_info',
  'get_vod_info',
  'get_short_epg',
  'get_live_streams',
  'get_vod_streams',
  'get_account_info',
  'get_series',
];

function walkFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'tests') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, acc);
    else if (entry.isFile()) acc.push(full);
  }
  return acc;
}

function urlsIn(text) {
  return text.match(URL_RE) || [];
}

function credentialQuery(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  const username = parsed.searchParams.get('username');
  const password = parsed.searchParams.get('password');
  if (username === null && password === null) return null;
  return {
    username,
    password,
    pathname: parsed.pathname,
  };
}

function committedCredentialUrls() {
  const found = [];
  for (const file of walkFiles(root)) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const raw of urlsIn(text)) {
      const cred = credentialQuery(raw);
      if (cred) found.push(cred);
    }
  }
  return found;
}

function catalogCredentialSuffix(filename) {
  const base = filename.replace(/\.json$/i, '');
  const action = CATALOG_ACTIONS.find(
    (name) => base === name || base.startsWith(`${name}_`),
  );
  if (!action) return null;
  const rest = base.slice(action.length).replace(/^_/, '');
  if (!rest) return null;
  const tokens = rest.split('_').filter(Boolean);
  // Catalog dumps in this repo append subscriber username and password
  // as the final two underscore-separated tokens.
  if (tokens.length < 2) return null;
  return tokens;
}

test('committed playlist URLs do not include subscriber username or password', () => {
  const hits = committedCredentialUrls();
  assert.equal(
    hits.length,
    0,
    `found ${hits.length} committed playlist URL(s) with username or password query parameters`,
  );
});

test('running script.js does not print subscriber username or password', () => {
  if (!fs.existsSync(scriptPath)) return;

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH || '',
      HOME: process.env.HOME || '',
    },
  });

  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const hits = [];
  for (const raw of urlsIn(output)) {
    const cred = credentialQuery(raw);
    if (cred) hits.push(cred);
  }
  const playerOrGet = hits.filter(
    (cred) => cred.pathname === '/player_api.php' || cred.pathname === '/get.php',
  );

  assert.equal(
    playerOrGet.length,
    0,
    `script.js printed ${playerOrGet.length} player_api.php or get.php URL(s) with subscriber credentials`,
  );
  assert.equal(
    hits.length,
    0,
    `script.js printed ${hits.length} playlist URL(s) with username or password query parameters`,
  );
  assert.equal(
    result.status,
    0,
    'script.js must exit successfully once subscriber credentials are not printed',
  );
});

test('streams filenames do not contain a subscriber password committed in the manifest', () => {
  if (!fs.existsSync(streamsDir)) return;

  const passwords = committedCredentialUrls()
    .map((cred) => cred.password)
    .filter((value) => typeof value === 'string' && value.length > 0);

  const names = fs.readdirSync(streamsDir);
  let embedded = 0;
  for (const name of names) {
    for (const password of passwords) {
      if (name.includes(password)) embedded += 1;
    }
  }

  assert.equal(
    embedded,
    0,
    `found ${embedded} streams filename(s) that repeat a subscriber password from a committed playlist URL`,
  );
});

test('streams catalog filenames do not append subscriber username and password', () => {
  if (!fs.existsSync(streamsDir)) return;

  const names = fs.readdirSync(streamsDir);
  const offending = names.filter((name) => catalogCredentialSuffix(name));

  assert.equal(
    offending.length,
    0,
    `found ${offending.length} streams catalog filename(s) with a subscriber username and password suffix`,
  );
});
