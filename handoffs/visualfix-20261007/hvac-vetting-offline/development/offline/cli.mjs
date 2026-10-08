import {readFile, lstat} from 'node:fs/promises';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {deliverOffline} from './lib/delivery.mjs';

export async function main(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--input','--sources','--store','--simulate-interruption'].includes(args[i]) || !args[i+1] || options[args[i]]) throw new Error('Use --input JSON --sources SYNTHETIC_DIR --store LOCAL_DIR [--simulate-interruption after-prepared]');
    options[args[i]] = args[i+1];
  }
  if (!options['--input'] || !options['--sources'] || !options['--store']) throw new Error('Missing --input, --sources or --store');
  const inputPath = resolve(options['--input']), stat = await lstat(inputPath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1048576) throw new Error('Input must be a regular JSON file <= 1 MiB');
  return deliverOffline({input: JSON.parse(await readFile(inputPath, 'utf8')), sourceRoot: resolve(options['--sources']), storeRoot: resolve(options['--store']), failAt: options['--simulate-interruption'] ?? null});
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await main(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(JSON.stringify({status: 'FAIL_OR_PAUSED', code: error.code ?? 'INVALID_REQUEST', message: error.message})); process.exitCode = 1; }
}
