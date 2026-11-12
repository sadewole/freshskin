import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * `freshskin_system` has BYPASSRLS. The only modules allowed to reach it are the worker entry
 * points and the test-only pool closer. This test turns that sentence into a failing test.
 */

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const SERVER_ENTRY = 'app/server.ts';
const SYSTEM_MODULE = 'src/db/system.ts';
const ALLOWED_IMPORTERS = new Set(['src/db/close.ts', 'src/retention/purge.ts']);

const normalise = (path: string): string => relative(ROOT, path).split(sep).join('/');

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(path)));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}

function specifiers(source: string): string[] {
  const found: string[] = [];
  const pattern = /(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    if (match[1] !== undefined) found.push(match[1]);
  }
  return found;
}

function resolveImport(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const base = resolve(dirname(from), specifier);
  const candidates = [base.replace(/\.js$/, '.ts'), `${base}.ts`, join(base, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

async function importGraph(entry: string): Promise<Set<string>> {
  const visited = new Set<string>();
  const pending = [resolve(ROOT, entry)];
  while (pending.length > 0) {
    const file = pending.pop();
    if (file === undefined) continue;
    const name = normalise(file);
    if (visited.has(name)) continue;
    visited.add(name);
    const source = await readFile(file, 'utf8');
    for (const specifier of specifiers(source)) {
      const target = resolveImport(file, specifier);
      if (target !== null) pending.push(target);
    }
  }
  return visited;
}

describe('module boundaries', () => {
  it('the request path cannot reach the BYPASSRLS pool', async () => {
    const reachable = await importGraph(SERVER_ENTRY);
    assert.equal(
      reachable.has(SYSTEM_MODULE),
      false,
      `${SERVER_ENTRY} must not import ${SYSTEM_MODULE}; use src/db/client.ts instead`,
    );
  });

  it('only workers and the pool closer import the system pool', async () => {
    const files = [...(await sourceFiles(resolve(ROOT, 'src'))), ...(await sourceFiles(resolve(ROOT, 'app')))];
    for (const file of files) {
      const name = normalise(file);
      if (ALLOWED_IMPORTERS.has(name)) continue;
      const source = await readFile(file, 'utf8');
      const reachesSystem = specifiers(source).some((specifier) => {
        const target = resolveImport(file, specifier);
        return target !== null && normalise(target) === SYSTEM_MODULE;
      });
      assert.equal(reachesSystem, false, `${name} must not import ${SYSTEM_MODULE}`);
    }
  });
});
