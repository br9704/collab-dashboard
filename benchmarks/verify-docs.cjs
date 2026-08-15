#!/usr/bin/env node
//
// Sprint D gate — the documentation is checkable or it is not published.
//
// Asserts that PROJECT.json validates and that every path it cites exists, that every local
// link and image in the README resolves, and that each number the README publishes still
// matches the artifact that produced it. Numbers go stale within a sprint: the README once
// said shape recognition was 447 lines a week after the file grew to 588.
//
//   node benchmarks/verify-docs.cjs
//
// Exits non-zero on the first thing that cannot be backed. No network access, no browser —
// unlike the other harnesses here, this one needs nothing running.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let fails = 0;
const check = (ok, label, detail = '') => {
  if (!ok) fails++;
  console.log(`${ok ? '  ok ' : 'FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
};
const exists = (p) => fs.existsSync(path.join(ROOT, p));

// ── PROJECT.json ────────────────────────────────────────────────────────────
const raw = fs.readFileSync(path.join(ROOT, 'PROJECT.json'), 'utf8');
let p;
try { p = JSON.parse(raw); check(true, 'PROJECT.json parses'); }
catch (e) { check(false, 'PROJECT.json parses', e.message); process.exit(1); }

const required = ['schema', 'slug', 'name', 'oneLiner', 'status', 'role', 'year', 'updated',
  'links', 'stack', 'metrics', 'headline', 'honest', 'media', 'built', 'ownerGated', 'masterplan'];
for (const k of required) check(k in p, `has "${k}"`);

check(p.oneLiner.length <= 90, 'oneLiner <= 90 chars', `${p.oneLiner.length}`);
check(['shipped', 'live', 'published', 'in-development', 'archived'].includes(p.status),
  'status is a legal value', p.status);
check(typeof p.honest === 'string' && p.honest.trim().length > 0, 'honest is non-empty');
for (const k of ['github', 'live', 'npm', 'huggingface', 'appstore'])
  check(k in p.links, `links.${k} present`);

for (const m of p.metrics)
  check(exists(m.source), `metric source exists: ${m.source}`, `${m.value} ${m.label}`);

const hs = p.headline.source.split('#')[0];
check(exists(hs), `headline source exists: ${hs}`);

for (const [k, v] of Object.entries(p.media))
  check(v === null || exists(v), `media.${k}`, v === null ? 'null (declared absent)' : v);

check(exists(p.masterplan), `masterplan path exists: ${p.masterplan}`);
check(Array.isArray(p.built.repaired) && p.built.repaired.length > 0, 'built.repaired non-empty');
check(Array.isArray(p.built.decisions) && p.built.decisions.every((d) => d.what && d.why),
  'every built.decision has what + why');

// ── README local links and images ───────────────────────────────────────────
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const links = [...readme.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
const local = links.filter((l) => !/^https?:|^#/.test(l));
for (const l of new Set(local)) check(exists(l.split('#')[0]), `README link resolves: ${l}`);

const imgs = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
check(imgs.length > 0, 'README has at least one image');
for (const i of imgs.filter((x) => !/^https?:/.test(x)))
  check(exists(i), `README image resolves: ${i}`);

check(/```mermaid/.test(readme), 'README contains a mermaid diagram');
check(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(readme), 'README contains no emoji');
for (const word of ['blazing', 'seamless', 'powerful', 'robust'])
  check(!new RegExp(word, 'i').test(readme), `README avoids "${word}"`);

// ── numbers trace to their artifacts ────────────────────────────────────────
const bench = fs.readFileSync(path.join(ROOT, 'benchmarks/README.md'), 'utf8');
// The masterplan hard-wraps at 90 columns, so claims must be matched on normalised whitespace.
const plan = fs.readFileSync(path.join(ROOT, 'masterplan.md'), 'utf8').replace(/\s+/g, ' ');
check(/\*\*8 ms\*\*/.test(bench) && /\*\*7 ms\*\*/.test(bench),
  'latency p50 figures match benchmarks/README.md');
check(/16 ms/.test(bench) && /17 ms/.test(bench), 'p95/p99 figures match benchmarks/README.md');
check(/30 samples each/.test(bench), 'sample size n=30 stated in benchmarks/README.md');
check(/1,670 px/.test(plan), '1,670 px restored is recorded in masterplan.md');
check(/46 corners/.test(plan) && /48-point rectangle/.test(plan),
  '46 corners on a 48-point rectangle is recorded in masterplan.md');
// "seven bugs" = the six the masterplan enumerates, plus the seventh that fixing (6) exposed.
check(/SIX REAL BUGS/.test(plan) && /exposed a seventh/.test(plan),
  'seven bugs (six enumerated + a seventh) is recorded in masterplan.md');
check(/ORPHANED: 0/.test(plan), 'zero orphaned events is recorded in masterplan.md');

// Line count the way wc -l counts it: newlines, not split segments.
const shape = fs.readFileSync(path.join(ROOT, 'collab-frontend/src/utils/shapeRecognition.js'), 'utf8');
const shapeLines = (shape.match(/\n/g) || []).length;
check(shapeLines === 588, 'shapeRecognition.js is 588 lines', `${shapeLines}`);

const server = fs.readFileSync(path.join(ROOT, 'collab-backend/server.js'), 'utf8');
check((server.match(/socket\.on\(/g) || []).length === 8, 'server.js has 8 socket handlers',
  `${(server.match(/socket\.on\(/g) || []).length}`);

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
