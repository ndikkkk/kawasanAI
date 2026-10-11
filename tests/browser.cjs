const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

// Optional smoke-test companion using installed Chromium and its native CDP API.
// OCR responses are mocked here; Azure REST behavior is tested separately.
module.exports = async function browserTest(base, cookie, executable) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "kawasan-browser-"));
  const child = spawn(executable, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${directory}`, "about:blank"], { stdio: "ignore" });
  let socket;
  let sequence = 0;
  const pending = new Map();
  async function waitFor(callback, message) {
    for (let attempt = 0; attempt < 100; attempt++) {
      try { const value = await callback(); if (value) return value; } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Browser timeout: ${message}`);
  }
  function command(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  const text = () => evaluate("document.body.innerText");
  async function upload(filename, content) {
    const target = path.join(directory, filename);
    await fs.writeFile(target, content);
    const root = await command("DOM.getDocument");
    const input = await command("DOM.querySelector", { nodeId: root.root.nodeId, selector: 'input[type="file"]' });
    assert.ok(input.nodeId, "File input available");
    await command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [target] });
  }
  try {
    const port = await waitFor(async () => (await fs.readFile(path.join(directory, "DevToolsActivePort"), "utf8")).split("\n")[0], "Edge startup");
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find((target) => target.type === "page").webSocketDebuggerUrl);
    await once(socket, "open");
    const exceptions = [];
    let ocrText = "Teks hasil OCR mock dari dokumen skripsi.";
    let uploads = 0;
    socket.addEventListener("message", (event) => {
      const data = JSON.parse(event.data);
      if (data.id && pending.has(data.id)) {
        const promise = pending.get(data.id); pending.delete(data.id); clearTimeout(promise.timer);
        if (data.error) promise.reject(new Error(data.error.message)); else promise.resolve(data.result);
      }
      if (data.method === "Runtime.exceptionThrown") exceptions.push(data.params.exceptionDetails.text);
      if (data.method === "Fetch.requestPaused") {
        const { requestId, request } = data.params;
        if (request.method === "POST") uploads++;
        const body = request.url.includes("configuration=") ? { parser: "azure" } : request.method === "POST" ? { token: "browser-only-mock" } : { status: "succeeded", text: ocrText };
        void command("Fetch.fulfillRequest", { requestId, responseCode: request.method === "POST" ? 202 : 200, responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify(body)).toString("base64") }).catch((error) => exceptions.push(error.message));
      }
    });
    await command("Runtime.enable");
    await command("Network.enable");
    await command("Page.enable");
    await command("Network.setCookie", { name: "chat_session", value: cookie.slice(cookie.indexOf("=") + 1), url: base, httpOnly: true, sameSite: "Strict" });
    await command("Fetch.enable", { patterns: [{ urlPattern: "*/api/documents*", requestStage: "Request" }] });
    await command("Page.navigate", { url: base });
    await waitFor(async () => (await text()).includes("Riwayat bersama dimuat"), "workspace loaded");
    async function checkComposer(multiline = false) {
      const layout = await evaluate(`(() => {
        const form = document.querySelector('.composer');
        const textarea = form.querySelector('textarea');
        const rect = (element) => { const r = element.getBoundingClientRect(); return { height: r.height, center: r.y + r.height / 2 }; };
        const style = getComputedStyle(textarea);
        return { form: rect(form), controls: [...form.querySelectorAll('button, textarea')].map(rect),
          paddingTop: parseFloat(style.paddingTop), paddingBottom: parseFloat(style.paddingBottom),
          lineHeight: parseFloat(style.lineHeight), overflow: textarea.scrollHeight > textarea.clientHeight,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth };
      })()`);
      for (const control of layout.controls) assert.ok(Math.abs(control.center - layout.form.center) <= 1, "Composer controls vertically centered");
      assert.equal(layout.controls[0].height, 38);
      assert.equal(layout.controls[2].height, 38);
      assert.equal(layout.paddingTop, layout.paddingBottom, "Symmetric text padding");
      if (multiline) assert.ok(layout.form.height > 52, "Composer grows for multiple lines");
      else {
        assert.equal(layout.form.height, 52, "Compact height follows plus button plus padding and border");
        assert.equal(layout.controls[1].height, layout.lineHeight + layout.paddingTop + layout.paddingBottom, "Single text line vertically centered");
      }
      assert.equal(layout.overflow, false, "Textarea content is not clipped");
      assert.equal(layout.horizontalOverflow, false, "No horizontal overflow");
    }
    for (const viewport of [{ width: 1280, height: 900, mobile: false }, { width: 390, height: 844, mobile: true }]) {
      await command("Emulation.setDeviceMetricsOverride", { ...viewport, deviceScaleFactor: 1 });
      await checkComposer();
      await evaluate('document.querySelector(".composer textarea").focus()');
      await command("Input.insertText", { text: "Baris pertama\nBaris kedua\nBaris ketiga" });
      await waitFor(() => evaluate('document.querySelector(".composer textarea").clientHeight > 38'), "multiline growth");
      await checkComposer(true);
      await evaluate('document.querySelector(".composer textarea").select()');
      await command("Input.dispatchKeyEvent", { type: "keyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
      await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 });
      await waitFor(() => evaluate('document.querySelector(".composer textarea").value === "" && document.querySelector(".composer textarea").clientHeight === 38'), "compact height restored");
      await checkComposer();
    }
    await command("Emulation.clearDeviceMetricsOverride");
    console.log("PASS browser: centered compact composer, multiline growth and shrink on desktop and mobile");
    assert.ok((await evaluate('document.querySelector("link[rel=icon]").href')).includes("icon.svg"));
    const longText = "a".repeat(100000) + "SECOND_PART_SENTINEL";
    await upload("long-thesis.txt", longText);
    await waitFor(async () => (await text()).includes("2 bagian"), "long file split");
    assert.equal(await evaluate('document.querySelector(".pending-file") === null'), true);
    await evaluate('const select=document.querySelector(".document-preview select"); select.value="1"; select.dispatchEvent(new Event("change",{bubbles:true}));');
    await waitFor(async () => (await text()).includes("bagian 2/2"), "part selected");
    assert.equal(await evaluate('document.querySelector(".document-preview pre").textContent'), "SECOND_PART_SENTINEL");
    await waitFor(() => evaluate('!document.querySelector("button[aria-label=Kirim]").disabled'), "send enabled");
    await evaluate('document.querySelector("button[aria-label=Kirim]").click()');
    await waitFor(async () => (await text()).includes("Halo Dika, ini respons mock."), "AI response");
    await waitFor(() => evaluate('!document.querySelector(".attach-button").disabled'), "autosave complete");
    assert.ok((await text()).includes("long-thesis.txt — bagian 2/2"));
    await upload("unsupported.png", Buffer.from([1, 2, 3]));
    await waitFor(async () => (await text()).includes("Format belum didukung"), "unsupported error");
    await upload("scan.pdf", "%PDF-browser-mock");
    await waitFor(() => evaluate('Boolean(document.querySelector("dialog[open]"))'), "OCR consent");
    await evaluate('Array.from(document.querySelectorAll("dialog button")).find(b=>b.textContent==="Batal").click()');
    await waitFor(() => evaluate('!document.querySelector(".attach-button").disabled'), "cancelled consent");
    assert.equal(uploads, 0, "Cancel never uploads to OCR");
    await upload("scan.pdf", "%PDF-browser-mock");
    await waitFor(() => evaluate('Boolean(document.querySelector("dialog[open]"))'), "second consent");
    await evaluate('document.querySelector("dialog .primary-button").click()');
    await waitFor(async () => (await text()).includes("Teks siap dilampirkan"), "OCR result");
    assert.equal(await evaluate('document.querySelector(".document-preview pre").textContent'), ocrText);
    assert.equal(uploads, 1);
    await upload("thesis.docx", Buffer.from([0x50, 0x4b, 3, 4]));
    await waitFor(() => evaluate('Boolean(document.querySelector("dialog[open]"))'), "DOCX consent");
    await evaluate('document.querySelector("dialog .primary-button").click()');
    await waitFor(async () => (await text()).includes("Teks siap dilampirkan"), "DOCX result");
    assert.equal(uploads, 2);
    await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    assert.equal(await evaluate("document.documentElement.scrollWidth <= window.innerWidth"), true, "No mobile horizontal overflow");
    const previousTheme = await evaluate('document.documentElement.dataset.theme');
    await evaluate('document.querySelector(".theme-toggle").click()');
    assert.notEqual(await evaluate('document.documentElement.dataset.theme'), previousTheme);
    const screenshot = await command("Page.captureScreenshot", { format: "png" });
    const screenshotPath = path.join(os.tmpdir(), "kawasan-document-mobile.png");
    await fs.writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
    assert.deepEqual(exceptions, [], "No uncaught browser exceptions");
    console.log(`PASS browser: long UTF-8 upload, chosen part, AI response, unsupported file, consent cancellation, mock PDF/OCR and DOCX, mobile layout, theme, favicon. Screenshot: ${screenshotPath}`);
  } catch (error) {
    if (socket?.readyState === WebSocket.OPEN) console.error("Browser state:", await text().catch(() => "unavailable"));
    throw error;
  } finally {
    socket?.close();
    for (const promise of pending.values()) clearTimeout(promise.timer);
    if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }).catch(() => {});
  }
};