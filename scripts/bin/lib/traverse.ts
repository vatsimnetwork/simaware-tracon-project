import {lstatSync, readdirSync} from 'node:fs';
import {dirname, extname, join} from 'node:path';

export function findJsonFiles(rootDir: string): string[] {
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      if (lstatSync(fullPath).isDirectory()) {
        walk(fullPath);
      } else if (
        !dirname(fullPath).toLowerCase().includes('node_modules') &&
        extname(fullPath).toLowerCase() === '.json'
      ) {
        files.push(fullPath);
      }
    }
  }
  walk(rootDir);
  return files;
}
