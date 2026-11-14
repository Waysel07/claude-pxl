// Loads art files (.js or .ts) into a Project by running them in a vm sandbox whose globals
// are the DSL. Each load gets a fresh context, so reloading after an edit is clean.
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";
import * as vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import { PxError, wrap } from "../core/errors.ts";
import { Project, type ProjectOptions } from "../core/project.ts";

function compile(code: string, file: string): string {
  // Type stripping keeps every line and column in place, so error locations stay exact.
  return /\.[cm]?ts$/.test(file) ? stripTypeScriptTypes(code, { mode: "strip" }) : code;
}

/** Load an art file from disk. Throws PxError with a file:line:col location on failure. */
export function loadProject(file: string, opts: ProjectOptions = {}): Project {
  const p = new Project(opts);
  const ctx = vm.createContext({ ...p.env(), console });
  const stack: string[] = [];
  const run = (path: string) => {
    const abs = resolve(path);
    if (stack.includes(abs)) throw new PxError(`include cycle: ${[...stack, abs].join(" -> ")}`);
    let code: string;
    try { code = readFileSync(abs, "utf8"); } catch {
      throw new PxError(`cannot read art file '${abs}'`, p.callerLoc());
    }
    p.addFile(abs);
    stack.push(abs);
    try {
      vm.runInContext(compile(code, abs), ctx, { filename: abs });
    } catch (e) {
      throw syntaxAware(e, abs, p);
    } finally {
      stack.pop();
    }
  };
  p.includeHook = (path) => run(kitPath(path) ?? (isAbsolute(path) ? path : resolve(dirname(stack[stack.length - 1]), path)));
  run(file);
  return p;
}

/** Load art source from a string (tests, embedding). `name` appears in error locations. */
export function loadSource(src: string, name = "art.px.js", opts: ProjectOptions = {}): Project {
  const p = new Project(opts);
  const ctx = vm.createContext({ ...p.env(), console });
  p.addFile(name);
  // Strings have no folder to include from, but the built-in kits ("pxl:cars") still work.
  p.includeHook = (path) => {
    const kit = kitPath(path);
    if (!kit) throw new PxError(`include("${path}") is not available here (only built-in kits like "pxl:cars")`);
    p.addFile(kit);
    vm.runInContext(readFileSync(kit, "utf8"), ctx, { filename: kit });
  };
  try {
    vm.runInContext(compile(src, name), ctx, { filename: name });
  } catch (e) {
    throw syntaxAware(e, name, p);
  }
  return p;
}

function syntaxAware(e: unknown, file: string, p: Project): PxError {
  const err = wrap(e, (s) => p.locFromStack(s));
  // SyntaxErrors put the location in the first stack line ("file:line").
  if (!err.loc && typeof e === "object" && e && "stack" in e) {
    const m = new RegExp(escape(file) + ":(\\d+)").exec(String((e as Error).stack));
    if (m) err.loc = `${file.replace(/^.*[\\/]/, "")}:${m[1]}`;
    err.message = err.format();
  }
  return err;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const KITS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "kits");

/** include("pxl:cars") -> the built-in kit file; undefined for ordinary paths. */
function kitPath(path: string): string | undefined {
  if (!path.startsWith("pxl:")) return undefined;
  const name = path.slice(4), file = join(KITS, name + ".px.js");
  if (!/^[a-z0-9_-]+$/.test(name) || !existsSync(file)) {
    let have: string[] = [];
    try { have = readdirSync(KITS).filter((f) => f.endsWith(".px.js")).map((f) => "pxl:" + f.slice(0, -6)); } catch { /* no kits folder */ }
    throw new PxError(`unknown kit "${path}" (have: ${have.join(", ") || "none"})`);
  }
  return file;
}
