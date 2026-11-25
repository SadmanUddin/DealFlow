import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const directory = process.argv[2];
if (!directory)
  throw new Error(
    'Pass the Vite build directory containing .vite/manifest.json.'
  );
const manifest = JSON.parse(
  await readFile(join(directory, '.vite/manifest.json'), 'utf8')
);
const files = await readdir(directory, {
  recursive: true,
  withFileTypes: true,
});
const javascript = files.filter(
  file => file.isFile() && file.name.endsWith('.js')
);
const size = data => ({
  bytes: data.length,
  gzipBytes: gzipSync(data).length,
  brotliBytes: brotliCompressSync(data).length,
});
const combine = sizes =>
  sizes.reduce(
    (total, current) => ({
      bytes: total.bytes + current.bytes,
      gzipBytes: total.gzipBytes + current.gzipBytes,
      brotliBytes: total.brotliBytes + current.brotliBytes,
    }),
    { bytes: 0, gzipBytes: 0, brotliBytes: 0 }
  );
const chunks = new Map(
  await Promise.all(
    javascript.map(async file => {
      const path = join(file.parentPath, file.name);
      return [path, size(await readFile(path))];
    })
  )
);
const closure = root => {
  const paths = new Set();
  function visit(key) {
    if (paths.has(key)) return;
    paths.add(key);
    for (const dependency of manifest[key].imports ?? []) visit(dependency);
  }
  visit(root);
  return paths;
};
const entry = closure('index.html');
const chunkSize = key => chunks.get(join(directory, manifest[key].file));
const routeFiles = Object.keys(manifest).filter(
  key => manifest[key].isDynamicEntry && /Page\.(tsx|jsx)$/.test(key)
);
const routes = Object.fromEntries(
  routeFiles.map(key => [
    key,
    {
      own: chunkSize(key),
      additional: combine(
        [...closure(key)].filter(part => !entry.has(part)).map(chunkSize)
      ),
    },
  ])
);
console.log(
  JSON.stringify(
    {
      initialJavaScript: combine([...entry].map(chunkSize)),
      allJavaScript: combine([...chunks.values()]),
      totalBuildBytes: (
        await Promise.all(
          files
            .filter(file => file.isFile() && file.name !== 'manifest.json')
            .map(
              async file =>
                (await readFile(join(file.parentPath, file.name))).length
            )
        )
      ).reduce((total, bytes) => total + bytes, 0),
      routes,
    },
    null,
    2
  )
);
