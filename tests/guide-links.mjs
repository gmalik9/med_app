import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { join, posix } from 'node:path';

// Include tracked working-tree edits and eligible new files, never ignored-only
// local artifacts. NUL delimiters preserve spaces and avoid Git path quoting.
export function publishableInventory(root, env = process.env) {
  return new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: root, env, encoding: 'utf8',
  }).split('\0').filter(Boolean));
}

// Pure lexical resolution: relative ../ navigation inside the repository is
// valid; absolute paths, alternate schemes, malformed encoding and escapes are
// not. Fragments are not anchor-validated. No network requests are made.
export function resolveGuideLink(document, href) {
  if (/^(?:https?:|#)/i.test(href)) return null;
  let path;
  try { path = decodeURIComponent(href.split('#')[0]); }
  catch { throw new Error('malformed local link encoding'); }
  if (!path || /[\u0000-\u001f\u007f\\:?]/.test(path) || posix.isAbsolute(path)) {
    throw new Error('invalid local link path');
  }
  const target = posix.normalize(posix.join(posix.dirname(document), path));
  if (target === '..' || target.startsWith('../')) throw new Error('local link escapes repository');
  // POSIX normalization retains a trailing slash; inventory keys do not.
  return target.replace(/\/$/, '');
}

function regularPath(root, target) {
  let path = root;
  let info;
  // lstat each component BEFORE descending: never follow a link to a private
  // file/directory, even when its apparent path is in the candidate inventory.
  for (const part of target.split('/')) {
    path = join(path, part);
    info = lstatSync(path);
    if (info.isSymbolicLink()) throw new Error('symlink local link target');
  }
  return info;
}

export function assertPublishableTarget(root, target, inventory) {
  if (!target || posix.isAbsolute(target) ||
      /[\u0000-\u001f\u007f\\]/.test(target) || target.split('/').includes('..')) {
    throw new Error('invalid resolved local link path');
  }
  // Validate before normalizing so absolute paths and traversal stay rejected.
  target = posix.normalize(target).replace(/\/$/, '');
  // '.' (including './') denotes the repository, subject to the same existing
  // regular candidate-descendant requirement as every other directory.
  const prefix = target === '.' ? '' : `${target}/`;
  const descendants = [...inventory].filter(file => file.startsWith(prefix));
  if (!inventory.has(target) && !descendants.length) throw new Error('target absent from publishable inventory');
  const info = regularPath(root, target);
  if (info.isFile() && inventory.has(target)) return;
  // Git lists files rather than directories. A source-directory link needs at
  // least one eligible, existing regular descendant (not an empty/private dir).
  if (info.isDirectory() && descendants.some(file => {
    try { return regularPath(root, file).isFile(); }
    catch { return false; }
  })) return;
  throw new Error('target is not a publishable file or source directory');
}
