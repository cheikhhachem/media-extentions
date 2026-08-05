import json
import subprocess
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SORA_DIR = ROOT / "sora"
RUNNER = Path(__file__).with_name("runner.js")


def extensions():
    found = {}
    for manifest_path in SORA_DIR.glob("*/*.json"):
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        scripts = list(manifest_path.parent.glob("*.js"))
        if scripts:
            key = manifest_path.parent.name
            found[key] = {
                "id": key,
                "name": manifest.get("sourceName", key),
                "script": str(scripts[0]),
            }
    return found


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/extensions":
            return self.send_json(HTTPStatus.OK, list(extensions().values()))
        if self.path == "/":
            body = PAGE.encode()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)
        self.send_error(HTTPStatus.NOT_FOUND)

    def do_POST(self):
        if self.path != "/api/run":
            return self.send_error(HTTPStatus.NOT_FOUND)
        try:
            size = int(self.headers.get("Content-Length", "0"))
            request = json.loads(self.rfile.read(size))
            extension = extensions()[request["extension"]]
            completed = subprocess.run(
                ["node", str(RUNNER), extension["script"], request["function"], request["input"]],
                capture_output=True,
                text=True,
                timeout=60,
            )
            if completed.returncode:
                raise RuntimeError(completed.stderr.strip() or "Runner failed")
            return self.send_json(HTTPStatus.OK, json.loads(completed.stdout))
        except (KeyError, json.JSONDecodeError, RuntimeError, subprocess.TimeoutExpired) as error:
            return self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})

    def log_message(self, *_):
        pass


PAGE = r'''<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Extension Debugger</title>
<style>
:root { color-scheme: dark; --ink:#e9ebf1; --muted:#9298aa; --line:#2a3040; --panel:#141824; --accent:#63e6be; --bg:#0b0e14; }
* { box-sizing:border-box } body { margin:0; background:radial-gradient(circle at top right,#152441,transparent 35%),var(--bg); color:var(--ink); font:15px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace }
main { max-width:1100px; margin:auto; padding:48px 20px 80px } h1 { font:700 38px/1.1 system-ui,sans-serif; margin:0 0 8px } p { color:var(--muted); margin:0 0 28px }
.bar,.card { background:color-mix(in srgb,var(--panel) 92%,transparent); border:1px solid var(--line); border-radius:14px }.bar { padding:18px; display:flex; gap:12px; align-items:center; margin-bottom:20px }
select,input,button { font:inherit; border-radius:8px; border:1px solid var(--line); padding:10px 12px } select,input { flex:1; background:#0d111a; color:var(--ink) } button { cursor:pointer; background:var(--accent); color:#062219; border:0; font-weight:800 } button:disabled { opacity:.5; cursor:wait }
.grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(460px,1fr)); gap:16px }.card { padding:18px } h2 { font:700 18px system-ui,sans-serif; margin:0 0 4px }.hint { font-size:12px; color:var(--muted); min-height:38px } .run { display:flex; gap:8px; margin-top:12px } pre { min-height:120px; max-height:360px; overflow:auto; margin:14px 0 0; padding:14px; border-radius:8px; background:#090c12; border:1px solid #202638; white-space:pre-wrap; word-break:break-word; color:#c6d0e3 }.ok { color:var(--accent) }.error { color:#ff8787 }
@media (max-width:540px) { main { padding:26px 14px }.grid { grid-template-columns:1fr }.bar,.run { flex-direction:column; align-items:stretch } h1 { font-size:30px } }
</style>
<main>
  <h1>Sora Extension Debugger</h1>
  <p>Runs local extension scripts through Node with a Sora-like <code>fetchv2()</code>.</p>
  <div class="bar"><label for="extension">Extension</label><select id="extension"></select><button id="reload">Reload</button></div>
  <section class="grid" id="tests"></section>
</main>
<script>
const tests = [
  ["searchResults", "Search keyword", "naruto"],
  ["extractDetails", "Series or movie URL", ""],
  ["extractEpisodes", "Series or movie URL", ""],
  ["extractStreamUrl", "Episode or movie watch URL", ""]
];
const select = document.querySelector("#extension"), area = document.querySelector("#tests");

function draw() {
  area.innerHTML = tests.map(([fn, hint, value]) => `<article class="card"><h2>${fn}</h2><div class="hint">${hint}</div><div class="run"><input aria-label="${hint}" value="${value}" placeholder="${hint}"><button>Run</button></div><pre>Ready.</pre></article>`).join("");
  area.querySelectorAll(".card").forEach((card, index) => card.querySelector("button").onclick = () => run(card, tests[index][0]));
}

async function run(card, fn) {
  const input = card.querySelector("input"), button = card.querySelector("button"), output = card.querySelector("pre");
  if (!input.value.trim()) return output.textContent = "Enter an input first.";
  button.disabled = true; output.textContent = "Running...";
  try {
    const response = await fetch("/api/run", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({extension:select.value,function:fn,input:input.value.trim()}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    let value = data.value;
    try { value = JSON.parse(value); } catch (_) {}
    output.className = "ok";
    output.textContent = `${data.ms}ms\n\n${JSON.stringify(value, null, 2)}${data.logs.length ? "\n\nLogs:\n" + data.logs.join("\n") : ""}`;
  } catch (error) { output.className = "error"; output.textContent = error.message; }
  button.disabled = false;
}

async function load() {
  const entries = await (await fetch("/api/extensions")).json();
  select.innerHTML = entries.map(item => `<option value="${item.id}">${item.name}</option>`).join("");
  draw();
}
document.querySelector("#reload").onclick = load;
load();
</script>'''


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    print("Open http://127.0.0.1:8000")
    webbrowser.open("http://127.0.0.1:8000")
    server.serve_forever()
