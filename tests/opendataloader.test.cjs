const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const ts = require("typescript");
require.extensions[".ts"] = (module, filename) => {
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
  module._compile(outputText, filename);
};
const { extractLocalPdf } = require("../lib/opendataloader.ts");
const fixture = require("./pdf-fixture.cjs");
const temporary = () => fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("kawasan-opendataloader-")).sort();

test("real Java parser extracts both pages, rejects blank/corrupt PDFs and cleans temporary files", async () => {
  const before = temporary();
  const text = await extractLocalPdf(fixture(), "real-two-pages");
  assert.match(text, /THESIS_PAGE_ONE/);
  assert.match(text, /THESIS_PAGE_TWO/);
  await assert.rejects(extractLocalPdf(fixture(true), "blank-pages"), /Tidak ada teks/);
  await assert.rejects(extractLocalPdf(Buffer.from("%PDF-corrupted"), "corrupt"), /gagal membaca/);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(extractLocalPdf(fixture(), "aborted", abort.signal), /dibatalkan/);
  assert.deepEqual(temporary(), before);
});