#!/usr/bin/env node
/**
 * seo-check.js
 * Audits every page for the on-page basics: title and description length, canonical,
 * a single h1, Open Graph, structured data, and sitemap/robots consistency.
 *
 * Run before pushing: node seo-check.js
 */
const fs = require('fs');
const path = require('path');

const SITE = 'https://aevon.ca/';
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.html') && !f.startsWith('google'));

const meta = (s, name) => {
  const re = new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([\\s\\S]*?)["']\\s*/?>`, 'i');
  const m = s.match(re);
  return m ? m[1].trim() : null;
};
const tag = (s, re) => { const m = s.match(re); return m ? m[1].trim() : null; };

const rows = [];
const issues = [];

for (const f of files) {
  const s = fs.readFileSync(path.join(__dirname, f), 'utf8');
  const title = tag(s, /<title>([\s\S]*?)<\/title>/i);
  const desc = meta(s, 'description');
  const robots = meta(s, 'robots') || '';
  const canonical = tag(s, /rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  // Count only headings in real markup. index.html renders part of its hero from JSX inside
  // a <script type="text/babel"> block, and an h1 in there is not a second page heading.
  const markup = s.replace(/<script[\s\S]*?<\/script>/gi, '');
  const h1 = (markup.match(/<h1[\s>]/gi) || []).length;
  const og = /property=["']og:title["']/i.test(s);
  const ld = /application\/ld\+json/i.test(s);
  const noindex = /noindex/i.test(robots);

  rows.push({ f, title: title ? title.length : 0, desc: desc ? desc.length : 0, canonical: !!canonical, h1, og, ld, noindex });

  if (noindex) continue; // the rest only matters for pages meant to rank

  if (!title) issues.push(`${f}: no title`);
  else if (title.length > 60) issues.push(`${f}: title ${title.length} chars, Google truncates near 60`);
  if (!desc) issues.push(`${f}: no meta description`);
  else if (desc.length > 160) issues.push(`${f}: description ${desc.length} chars, truncated in results`);
  else if (desc.length < 70) issues.push(`${f}: description only ${desc.length} chars, wasted space`);
  if (!canonical) issues.push(`${f}: no canonical (outreach links add ?ref= so every click can look like a separate page)`);
  if (h1 !== 1) issues.push(`${f}: ${h1} h1 tags, should be exactly 1`);
  if (!og) issues.push(`${f}: no Open Graph tags, link previews will be bare`);
  // Only the pages that describe an actual offering benefit from schema. Forcing it onto
  // a demo index or a proof page produces markup nobody consumes.
  const SELLS = ['index.html', 'tempo.html', 'frontdesk.html'];
  if (!ld && SELLS.includes(f)) issues.push(`${f}: no structured data`);
}

// sitemap should list every indexable page and nothing that is noindex
const sm = fs.existsSync(path.join(__dirname, 'sitemap.xml')) ? fs.readFileSync(path.join(__dirname, 'sitemap.xml'), 'utf8') : '';
const listed = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(SITE, '') || 'index.html');
for (const r of rows) {
  const slug = r.f === 'index.html' ? 'index.html' : r.f;
  const inMap = listed.includes(slug);
  if (r.noindex && inMap) issues.push(`sitemap: lists ${r.f}, which is noindex. Contradictory signal.`);
  if (!r.noindex && !inMap) issues.push(`sitemap: missing ${r.f}`);
}

console.log('page'.padEnd(19) + 'title  desc  canon  h1  og  ld  robots');
rows.forEach(r => console.log(
  r.f.padEnd(19) + String(r.title).padStart(5) + String(r.desc).padStart(6) +
  (r.canonical ? '    Y ' : '    N ') + String(r.h1).padStart(4) +
  (r.og ? '   Y' : '   N') + (r.ld ? '   Y' : '   N') + (r.noindex ? '   noindex' : '   index')
));

console.log(`\n${issues.length} issue(s)`);
issues.forEach(i => console.log('  - ' + i));
process.exitCode = issues.length ? 1 : 0;
