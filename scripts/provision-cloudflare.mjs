import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const wrangler = process.platform === "win32" ? "npx.cmd" : "npx";
const run = (...args) => execFileSync(wrangler, ["wrangler@latest", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
const databaseName = "veritas-production";
const bucketName = "veritas-evidence-production";

let databases = JSON.parse(run("d1", "list", "--json"));
let database = databases.find((item) => item.name === databaseName);
if (!database) {
  run("d1", "create", databaseName);
  databases = JSON.parse(run("d1", "list", "--json"));
  database = databases.find((item) => item.name === databaseName);
}
if (!database?.uuid && !database?.id) throw new Error("Unable to resolve the Veritas D1 database ID.");

const buckets = run("r2", "bucket", "list");
if (!buckets.includes(bucketName)) run("r2", "bucket", "create", bucketName);

const config = {
  name: "veritas",
  main: "./worker/index.js",
  compatibility_date: "2026-08-22",
  keep_vars: true,
  build: { command: "npm run build:client" },
  vars: { GEMINI_MODEL: "gemini-3.6-flash" },
  assets: { directory: "./dist/spa", binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: true },
  d1_databases: [{ binding: "DB", database_name: databaseName, database_id: database.uuid ?? database.id, migrations_dir: "migrations" }],
  r2_buckets: [{ binding: "EVIDENCE", bucket_name: bucketName }],
};
writeFileSync("wrangler.generated.json", `${JSON.stringify(config, null, 2)}\n`);
console.log(`Prepared Cloudflare bindings for ${databaseName} and ${bucketName}.`);
