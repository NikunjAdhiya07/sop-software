import fs from "fs";
function loadEnv() {
  const env = fs.readFileSync(".env.local", "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
async function main() {
  loadEnv();
  const { runMcqGeneration } = await import("../lib/mcq-generation");
  const identifier = process.argv[2] ?? "QAGE01-11";
  console.log(`Running MCQ generation (continue, English, gemini) for ${identifier}...`);
  const result = await runMcqGeneration(identifier, "continue", "gemini", "English");
  console.log("Result:", JSON.stringify(result, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
