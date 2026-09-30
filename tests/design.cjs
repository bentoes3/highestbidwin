const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dist = path.join(__dirname, '..', 'dist');
for (const page of ['index.html', 'football/index.html', 'basketball/index.html']) {
  const html = fs.readFileSync(path.join(dist, page), 'utf8');
  assert.match(html, /<html lang="en" class="glass-design">/, `${page}: permanent design class`);
  assert.match(html, /href="\/design\.css"/, `${page}: permanent design stylesheet`);
  assert.doesNotMatch(html, /glass-preview|Local design preview|Classic design/, `${page}: no preview picker`);
}
for (const page of ['football/index.html', 'basketball/index.html']) {
  const html = fs.readFileSync(path.join(dist, page), 'utf8');
  assert.match(html, /href="\/roster-polish\.css"/, `${page}: readable roster styling`);
}
assert(!fs.existsSync(path.join(dist, 'glass-preview.js')));
assert(!fs.existsSync(path.join(dist, 'glass-preview.css')));
console.log('PASS permanent glass design on all pages, no design picker, and readable rosters.');
