import { build } from 'esbuild';
await build({ entryPoints: ['scripts/garden-renderer-entry.js'], outfile: 'src/garden-renderer.js',
  bundle: true, format: 'esm', minify: true, legalComments: 'eof' });
