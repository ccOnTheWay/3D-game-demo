import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const distDir = path.resolve("dist");
const indexPath = path.join(distDir, "index.html");

let html = await readFile(indexPath, "utf8");

html = await inlineStyles(html);
html = await inlineModuleScripts(html);

await writeFile(indexPath, html);

async function inlineStyles(source) {
  return replaceAsync(
    source,
    /<link rel="stylesheet" crossorigin href="([^"]+)">/g,
    async (_match, href) => {
      const css = await readDistAsset(href);
      return `<style>\n${css}\n</style>`;
    },
  );
}

async function inlineModuleScripts(source) {
  return replaceAsync(
    source,
    /<script type="module" crossorigin src="([^"]+)"><\/script>/g,
    async (_match, src) => {
      const js = await readDistAsset(src);
      return `<script type="module">\n${js}\n</script>`;
    },
  );
}

async function readDistAsset(assetUrl) {
  const filename = decodeURIComponent(new URL(assetUrl).pathname.split("/").pop());
  return readFile(path.join(distDir, filename), "utf8");
}

async function replaceAsync(source, pattern, replacer) {
  const matches = [...source.matchAll(pattern)];
  let result = source;

  for (const match of matches.reverse()) {
    const replacement = await replacer(...match);
    result = `${result.slice(0, match.index)}${replacement}${result.slice(
      match.index + match[0].length,
    )}`;
  }

  return result;
}
