import { rmSync } from "node:fs";
import { resolve } from "node:path";

const cwd = process.cwd();
const nextDir = resolve(cwd, ".next");

if (!nextDir.startsWith(cwd)) {
  throw new Error(`Refusing to remove a path outside the project: ${nextDir}`);
}

rmSync(nextDir, { recursive: true, force: true });
