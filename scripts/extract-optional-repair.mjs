import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, "dreamos-runtime-repair.sql"), "utf8");
const start = src.indexOf("-- Onboarding");
const end = src.lastIndexOf("notify pgrst");
const q =
  src.slice(start, end) +
  "\nnotify pgrst, 'reload schema';\nselect pg_notify('pgrst', 'reload schema');\n";
const out = path.join(__dirname, "_remote_optional_apply.sql");
fs.writeFileSync(out, q);
console.log(out, q.length);
