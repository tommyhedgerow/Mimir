/**
 * Tools/lib/anki-python.mjs — run Anki's own Python, so a test can ask Anki what
 * it thinks of a file this vault produced.
 *
 * WHY THIS EXISTS
 *   `Tools/lib/anki-apkg.mjs` writes an Anki package by hand. Nothing about that
 *   is worth much unless Anki accepts it, and "the format looked right to me" is
 *   exactly the kind of claim this vault is not allowed to make. Anki 26.9.2 is
 *   installed on this machine and its Python can import a package into a throwaway
 *   collection — so the test does that, against Anki's real importer, and reports
 *   what came out.
 *
 * WHY THERE IS A C SHIM IN HERE
 *   Anki ships Python as a **shared library**, not an executable:
 *   `Python.framework/Versions/3.13/Python` is a Mach-O dylib, and there is no
 *   `python3` binary in the bundle to run a script with. The only way in is to
 *   load the library and call `Py_BytesMain`, which is what the dozen lines of C
 *   below do. It is compiled on demand into a temporary directory — never
 *   installed, never committed as a binary.
 *
 *   This is a tool for **verification only**. Building a package must not need
 *   Anki or a compiler; checking one may.
 *
 * USAGE
 *   import { ankiReady, runAnkiPython } from './lib/anki-python.mjs'
 *   const env = ankiReady()            // null when Anki or clang is missing
 *   const report = runAnkiPython('Tools/verify-anki-import.py', [apkgPath], env)
 */

import { existsSync, mkdtempSync, writeFileSync, rmSync, chmodSync, readdirSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const SHIM_SOURCE = `
/* Load Anki's embedded Python and hand it our argv. See anki-python.mjs for why. */
#include <dlfcn.h>
#include <stdio.h>
int main(int argc, char **argv) {
  void *h = dlopen(PYTHON_LIB, RTLD_NOW | RTLD_GLOBAL);
  if (!h) { fprintf(stderr, "dlopen: %s\\n", dlerror()); return 127; }
  int (*fn)(int, char **) = (int (*)(int, char **))dlsym(h, "Py_BytesMain");
  if (!fn) { fprintf(stderr, "dlsym Py_BytesMain: %s\\n", dlerror()); return 127; }
  return fn(argc, argv);
}
`

const ANKI_CANDIDATES = [
  process.env.ANKI_APP,
  '/Applications/Anki.app',
  '/Applications/Anki 2.app'
].filter(Boolean)

function findCompiler () {
  for (const c of ['/usr/bin/clang', '/usr/bin/cc', '/usr/bin/gcc']) if (existsSync(c)) return c
  return null
}

/**
 * Everything needed to run Anki's Python, or null with a reason when it cannot
 * be done on this machine. Callers are expected to skip loudly, not silently.
 */
export function ankiReady () {
  const app = ANKI_CANDIDATES.find(existsSync)
  if (!app) return { ok: false, reason: 'Anki is not installed' }
  const home = join(app, 'Contents', 'Frameworks', 'Python.framework', 'Versions')
  if (!existsSync(home)) return { ok: false, reason: 'Anki has no embedded Python framework' }
  const version = readdirSync(home).filter(v => /^\d+\.\d+$/.test(v)).sort().pop()
  if (!version) return { ok: false, reason: 'no Python version directory inside the framework' }
  const pythonLib = join(home, version, 'Python')
  if (!existsSync(pythonLib)) return { ok: false, reason: 'the Python framework binary is missing' }
  const packages = join(app, 'Contents', 'Resources', 'app_packages')
  if (!existsSync(packages)) return { ok: false, reason: 'Anki has no app_packages directory' }
  const cc = findCompiler()
  if (!cc) return { ok: false, reason: 'no C compiler to build the shim with' }
  return { ok: true, app, home: join(home, version), pythonLib, packages, cc }
}

function buildShim (env, dir) {
  const src = join(dir, 'shim.c')
  const bin = join(dir, 'anki-python')
  writeFileSync(src, SHIM_SOURCE.replace('PYTHON_LIB', JSON.stringify(env.pythonLib)))
  execFileSync(env.cc, ['-O1', '-o', bin, src], { stdio: 'pipe' })
  chmodSync(bin, 0o755)
  return bin
}

/**
 * Run a Python script inside Anki's interpreter and return its stdout.
 * `args` are appended after the script path.
 */
export function runAnkiPython (scriptPath, args = [], env = ankiReady()) {
  if (!env.ok) throw new Error('Anki Python is not available: ' + env.reason)
  const dir = mkdtempSync(join(tmpdir(), 'mimir-ankipy-'))
  try {
    const shim = buildShim(env, dir)
    const res = spawnSync(shim, [scriptPath, ...args], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        PYTHONHOME: env.home,
        PYTHONPATH: env.packages,
        PYTHONDONTWRITEBYTECODE: '1'
      }
    })
    if (res.status !== 0) {
      throw new Error('Anki Python exited ' + res.status +
        '\n--- stdout ---\n' + (res.stdout || '').slice(-2000) +
        '\n--- stderr ---\n' + (res.stderr || '').split('\n').slice(-12).join('\n'))
    }
    // Anki's own deprecation warnings can land on stdout ahead of the report, so
    // the report is the last line that parses as an object.
    const line = (res.stdout || '').split('\n').reverse().find(l => l.trim().startsWith('{'))
    if (!line) {
      throw new Error('no JSON report on stdout\n--- stdout ---\n' + (res.stdout || '').slice(-2000) +
        '\n--- stderr ---\n' + (res.stderr || '').slice(-2000))
    }
    return line
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
