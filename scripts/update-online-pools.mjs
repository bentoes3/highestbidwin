import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(root, 'functions/_shared/player-pools.mjs');
const check = process.argv.slice(2).includes('--check');
if (process.argv.slice(2).some(argument => argument !== '--check')) {
  throw Error('Usage: node scripts/update-online-pools.mjs [--check]');
}

function readPools(file, globalName) {
  const source = readFileSync(resolve(root, file), 'utf8');
  const assignment = source.match(new RegExp(`\\bwindow\\.${globalName}\\s*=\\s*([\\s\\S]*);\\s*$`));
  if (!assignment) throw Error(`Cannot read ${globalName} from ${file}`);
  const data = JSON.parse(assignment[1]);
  if (!data.pools || !Array.isArray(data.pools.current) || !Array.isArray(data.pools.prime)) {
    throw Error(`Missing current or prime players in ${file}`);
  }
  return { current: data.pools.current, prime: data.pools.prime };
}

const pools = {
  football: readPools('dist/players.js', 'HBW_DATA'),
  basketball: readPools('dist/basketball/players.js', 'HBW_BASKETBALL_DATA'),
};
const generated = `// Generated from the site's football and basketball player data.\n` +
  `// Keep this server copy in sync when either browser player pool changes.\n` +
  `export const PLAYER_POOLS = ${JSON.stringify(pools)};\n`;

if (check) {
  if (readFileSync(outputPath, 'utf8') !== generated) {
    console.error('Online player pools differ from the site data. Run npm run sync:online-pools.');
    process.exitCode = 1;
  } else console.log('Online player pools match football and basketball site data.');
} else {
  writeFileSync(outputPath, generated);
  console.log('Updated online player pools from football and basketball site data.');
}
