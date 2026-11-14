// pxl command line.
import { readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { PxError, didYouMean, wrap } from "../core/errors.ts";
import { ascii, packSheet, preview, review, versus } from "../core/render.ts";
import { analyzeRef, compareStyle } from "../core/ref.ts";
import type { Img } from "../core/image.ts";
import { decodePng } from "./png.ts";
import { decodeGif } from "./gif.ts";
import { lintImage } from "../core/lint.ts";
import { toHex } from "../core/color.ts";
import { loadProject } from "./load.ts";
import { writeOutputs, writePng } from "./output.ts";
import { serve } from "./server.ts";

const USAGE = `pxl — pixel-art DSL

  pxl build <art.px.js> [--out DIR] [--only a,b] [--scale N] [--no-preview] [--no-hints]
      Build PNGs (out/sprites, out/scenes, out/anims strips + JSON + GIF, sheets + JSON) and
      previews (out/_preview; animated assets also get a .gif).
  pxl serve <art.px.js> [--port 4321] [--out DIR | --no-out] [--no-preview]
      Live viewer: rebuilds on save and replays each asset's painting steps.
  pxl ref <image.png|gif> [--colors N] [--scale N] [--crop x,y,w,h] [--frame N] [--ascii] [--out DIR]
      Study a reference picture to draw in its style: finds its native pixel size, prints a
      ready-to-paste pal()/ramps() block and a style brief (outline, light, shading, contrast),
      and writes out/_ref/<name>.png (native size) + <name>.preview.png (gridded, to look at).
  pxl review <art.px.js> <name> [name...] [--scale N] [--ref image.png]
      Write out/_preview/<name>.review.png: the asset without the grid on dark and light
      backdrops, in grayscale (values), as a silhouette, at true 1x/2x size, and its colors.
      Prints craft hints and color usage. Judge finished art with this, not the grid preview.
      --ref also writes <name>.vs.png (art beside the reference) and prints how the styles match.
  pxl ascii <art.px.js> <name>
      Print an asset as palette keys with x/y rulers (anims: every frame).
  pxl list  <art.px.js>
      List assets, groups and sheets with their source locations.

Art files may be .js or .ts. Default out dir: <art file dir>/out.`;

interface Args {
  cmd?: string;
  file?: string;
  rest: string[];
  out?: string | false;
  only?: string[];
  scale?: number;
  preview?: boolean;
  port?: number;
  hints?: boolean;
  ref?: string;
  colors?: number;
  ascii?: boolean;
  crop?: number[];
  frame?: number;
}

function parse(argv: string[]): Args {
  const a: Args = { rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    const val = () => {
      const x = argv[++i];
      if (x === undefined) throw new PxError(`${v} needs a value`);
      return x;
    };
    if (v === "--out") a.out = val();
    else if (v === "--no-out") a.out = false;
    else if (v === "--only") a.only = val().split(",").map((s) => s.trim()).filter(Boolean);
    else if (v === "--scale") a.scale = Number(val());
    else if (v === "--port") a.port = Number(val());
    else if (v === "--no-preview") a.preview = false;
    else if (v === "--no-hints") a.hints = false;
    else if (v === "--ref") a.ref = val();
    else if (v === "--colors") a.colors = Number(val());
    else if (v === "--ascii") a.ascii = true;
    else if (v === "--frame") a.frame = Number(val());
    else if (v === "--crop") {
      a.crop = val().split(",").map(Number);
      if (a.crop.length !== 4 || a.crop.some((n) => !Number.isInteger(n) || n < 0) || !a.crop[2] || !a.crop[3]) throw new PxError("--crop needs x,y,w,h in image pixels");
    }
    else if (v === "-h" || v === "--help") a.cmd = "help";
    else if (v.startsWith("--")) throw new PxError(`unknown flag ${v}\n\n${USAGE}`);
    else if (!a.cmd) a.cmd = v;
    else if (!a.file) a.file = v;
    else a.rest.push(v);
  }
  return a;
}

export async function main(argv: string[]): Promise<number> {
  let a: Args;
  try { a = parse(argv); } catch (e) { console.error(wrap(e).message); return 2; }
  if (!a.cmd || a.cmd === "help" || !a.file) {
    console.log(USAGE);
    return a.cmd === "help" ? 0 : 2;
  }
  const file = resolve(a.file);
  const outDir = typeof a.out === "string" ? resolve(a.out) : join(dirname(file), "out");
  try {
    switch (a.cmd) {
      case "build": {
        const p = loadProject(file);
        const r = writeOutputs(p, outDir, { only: a.only, preview: a.preview, scale: a.scale, hints: a.hints });
        for (const l of r.lines) console.log(l);
        for (const e of r.errors) console.error("error: " + e.message);
        console.log(`-> ${outDir}${r.errors.length ? ` (${r.errors.length} error${r.errors.length > 1 ? "s" : ""})` : ""}`);
        return r.errors.length ? 1 : 0;
      }
      case "ascii": {
        const name = a.rest[0];
        if (!name) throw new PxError("ascii needs an asset name: pxl ascii <file> <name>");
        const p = loadProject(file);
        const pal = p.assets.get(name)?.pal ?? p.pal;
        if (p.assets.get(name)?.kind === "anim")
          p.frames(name).forEach((f, i) => console.log(`frame ${i} (${f.ms}ms)\n${ascii(f.img, pal)}\n`));
        else console.log(ascii(p.image(name), pal));
        return 0;
      }
      case "ref": {
        const r = analyzeRef(readImage(file, a), { colors: a.colors, scale: a.scale });
        const name = basename(file).replace(/\.(png|gif)$/i, ""), dir = join(outDir, "_ref");
        writePng(join(dir, name + ".png"), r.img);
        writePng(join(dir, name + ".preview.png"), preview(r.img));
        console.log(`reference ${name}: ${r.img.w}x${r.img.h} native (1 art pixel = ${r.scale}x${r.scale} in the file)${r.bg !== undefined ? `, background ${toHex(r.bg)} removed` : ""}`);
        console.log(`look at: ${join(dir, name + ".preview.png")}\n`);
        console.log("// palette of the reference: paste into the art file\n" + r.code + "\n");
        console.log("style brief: draw new art to these rules");
        for (const l of r.brief) console.log("  - " + l);
        console.log(`\ncheck your art against it: pxl review <art.px.js> <name> --ref ${a.file}`);
        if (a.ascii) console.log("\n" + ascii(r.img, r.pal));
        return 0;
      }
      case "review": {
        if (!a.rest.length) throw new PxError("review needs an asset name: pxl review <file> <name>");
        const ref = a.ref ? analyzeRef(readImage(resolve(a.ref), a), { colors: a.colors }) : undefined;
        const p = loadProject(file);
        for (const name of a.rest) {
          const def = p.assets.get(name), sh = p.sheets.find((s) => s.name === name);
          if (!def && !sh) throw new PxError(`unknown asset or sheet '${name}'${didYouMean(name, [...p.order, ...p.sheets.map((s) => s.name)])}`);
          const kind = def?.kind ?? "sheet", pal = def?.pal ?? p.pal;
          const img = def ? p.image(name) : packSheet(p.sheetNames(sh!).map((n) => ({ name: n, img: p.image(n) })), sh!.opts.cols, sh!.opts.pad ?? 1).sheet;
          const rev = pal.reverse();
          const path = join(outDir, "_preview", name + ".review.png");
          writePng(path, review(img, a.scale));
          const count = new Map<number, number>();
          for (const c of img.data) if (c) count.set(c, (count.get(c) ?? 0) + 1);
          const cols = [...count.entries()].sort((x, y) => y[1] - x[1]);
          console.log(`${kind} ${name} ${img.w}x${img.h}, ${cols.length} colors -> ${path}`);
          console.log("  " + cols.slice(0, 24).map(([c, n]) => `${rev.get(c) ?? toHex(c)}:${n}`).join(" ") + (cols.length > 24 ? " …" : ""));
          const hints = def ? lintImage(img, pal) : [];
          for (const h of hints) console.log(`  hint: ${h}`);
          if (!hints.length) console.log("  no hints");
          if (ref) {
            const vs = join(outDir, "_preview", name + ".vs.png");
            writePng(vs, versus(img, ref.img));
            console.log(`  against the reference (art left, reference right) -> ${vs}`);
            for (const l of compareStyle(img, ref)) console.log("    " + l);
          }
        }
        return 0;
      }
      case "list": {
        const p = loadProject(file);
        for (const n of p.order) {
          const d = p.assets.get(n)!;
          console.log(`${d.kind.padEnd(6)} ${n.padEnd(24)} ${d.loc ?? ""}`);
        }
        for (const g of p.groups.values()) console.log(`${"group".padEnd(6)} ${g.name.padEnd(24)} ${g.loc ?? ""}  [${g.members.join(" ")}]`);
        for (const s of p.sheets) console.log(`${"sheet".padEnd(6)} ${s.name.padEnd(24)} ${s.loc ?? ""}`);
        return 0;
      }
      case "serve": {
        const s = await serve(file, { port: a.port, out: a.out === false ? false : outDir, preview: a.preview });
        console.log(`pxl live viewer: ${s.url}  (watching ${file}; Ctrl+C to stop)`);
        return await new Promise<number>(() => {});
      }
      default:
        console.error(`unknown command '${a.cmd}'\n\n${USAGE}`);
        return 2;
    }
  } catch (e) {
    console.error("error: " + wrap(e).message);
    return 1;
  }
}

/** Read a PNG or GIF (one frame, --frame N, default the first), optionally cropped with --crop. */
function readImage(path: string, a: Args): Img {
  let buf: Buffer;
  try { buf = readFileSync(path); } catch { throw new PxError(`cannot read image '${path}'`); }
  let img: Img;
  try {
    if (buf.toString("ascii", 0, 3) === "GIF") {
      const frames = decodeGif(buf);
      const n = a.frame ?? 0;
      if (!frames[n]) throw new Error(`has ${frames.length} frames; --frame must be 0..${frames.length - 1}`);
      img = frames[n].img;
    } else img = decodePng(buf);
  } catch (e) { throw new PxError(`${path}: ${(e as Error).message.replace("must be .png", "must be .png or .gif")}`); }
  if (a.crop) {
    const [x, y, w, h] = a.crop;
    if (x + w > img.w || y + h > img.h) throw new PxError(`--crop ${a.crop.join(",")} is outside the ${img.w}x${img.h} image`);
    img = img.sub(x, y, w, h);
  }
  return img;
}
