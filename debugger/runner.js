const fs = require("fs");

const [scriptPath, functionName, input] = process.argv.slice(2);
const allowed = new Set(["searchResults", "extractDetails", "extractEpisodes", "extractStreamUrl"]);
if (!allowed.has(functionName)) throw new Error("Unsupported function");

const logs = [];
console.log = (...values) => logs.push(values.map(String).join(" "));
console.error = (...values) => logs.push(values.map(String).join(" "));

global.fetchv2 = async (url, headers = {}, method = "GET", body) => {
    const response = await fetch(url, {
        method,
        headers,
        body: body && method !== "GET" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    });
    return { text: () => response.text(), json: () => response.json() };
};

(async () => {
    eval(fs.readFileSync(scriptPath, "utf8"));
    const started = Date.now();
    const value = await eval(functionName)(input);
    process.stdout.write(JSON.stringify({ value, logs, ms: Date.now() - started }));
})().catch(error => {
    process.stderr.write(error.stack || String(error));
    process.exit(1);
});
