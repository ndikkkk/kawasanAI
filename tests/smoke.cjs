const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { randomBytes } = require("node:crypto");
const path = require("node:path");

async function main() {
  const calls = [];
  const provider = http.createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    calls.push({ url: req.url, body: JSON.parse(raw) });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { content: "Halo Dika, ini respons mock." } }] }));
  });
  provider.listen(0, "127.0.0.1");
  await once(provider, "listening");
  const portProbe = http.createServer();
  portProbe.listen(0, "127.0.0.1");
  await once(portProbe, "listening");
  const port = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let logs = "";
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: path.resolve(__dirname, ".."),
    env: { ...process.env, NODE_ENV: "production", ACCESS_CODE: "smoke-code-one", ACCESS_CODE_2: "smoke-code-two", SESSION_SECRET: randomBytes(32).toString("hex"), TOKEN_GATEWAY_BASE_URL: `http://127.0.0.1:${provider.address().port}/v1`, TOKEN_GATEWAY_API_KEY: "mock-key-not-real", SYSTEM_PROMPT: "Test system instruction" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (data) => { logs += data; });
  child.stderr.on("data", (data) => { logs += data; });
  async function post(route, body, cookie) {
    return fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/login`)).ok) { ready = true; break; } } catch {}
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(ready, `Server did not start: ${logs}`);
    assert.equal((await fetch(base, { redirect: "manual" })).status, 307);
    assert.equal((await post("/api/chat", {})).status, 401);
    assert.equal((await post("/api/chat", {}, "chat_session=authenticated")).status, 401);
    assert.equal((await post("/api/login", { code: "wrong" })).status, 401);
    const login = await post("/api/login", { code: "smoke-code-one" });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie");
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /SameSite=strict/i);
    const cookie = setCookie.split(";")[0];
    const second = await post("/api/login", { code: "smoke-code-two" });
    assert.equal(second.status, 200);
    assert.notEqual(second.headers.get("set-cookie").split(";")[0], cookie);
    const page = await fetch(base, { headers: { Cookie: cookie } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Kawasan AI/);
    const avatar = await fetch(`${base}/avatars/user.svg`);
    assert.equal(avatar.status, 200);
    assert.match(await avatar.text(), /<svg/);
    assert.equal((await post("/api/chat", { model: "invalid", messages: [{ role: "user", content: "Hi" }] }, cookie)).status, 400);
    assert.equal((await post("/api/chat", { messages: [null] }, cookie)).status, 400);
    assert.equal(calls.length, 0);
    const chat = await post("/api/chat", { model: "gpt-5.4-mini", preferences: { name: "Dika", instructions: "Ringkas" }, messages: [{ role: "user", content: "Halo" }] }, cookie);
    assert.equal(chat.status, 200);
    assert.match((await chat.json()).content, /Dika/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/v1/chat/completions");
    assert.equal(calls[0].body.model, "gpt-5.4-mini");
    assert.match(calls[0].body.messages[0].content, /Dika/);
    assert.match(calls[0].body.messages[0].content, /Ringkas/);
    const logout = await post("/api/logout", {}, cookie);
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /1970/);
    console.log("PASS: production routes, two login codes, forged-cookie rejection, avatar, provider mock, personalization, logout. No real provider requests.");
  } finally {
    child.kill();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });