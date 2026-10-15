import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CORE_SRC = path.resolve(__dirname, "../src");

function getAllTsFiles(dir: string): string[] {
  let results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      results = results.concat(getAllTsFiles(fullPath));
    } else if (file.endsWith(".ts") && !file.endsWith(".test.ts") && !file.endsWith(".d.ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

const FORBIDDEN_DOMAIN_IMPORTS = [
  "@libsql/client",
  "drizzle-orm",
  "nodemailer",
  "ssh2",
  "next",
  "react",
  "jose",
  "@react-pdf/renderer",
  "@node-rs/argon2",
];

describe("Architecture Boundary Invariants", () => {
  const allFiles = getAllTsFiles(CORE_SRC);

  it("enforces zero DB, framework, or network packages in domain layers", () => {
    const domainFiles = allFiles.filter(
      (f) =>
        f.includes(`${path.sep}domain${path.sep}`) ||
        f.includes(`${path.sep}kernel${path.sep}`),
    );

    const violations: string[] = [];

    for (const file of domainFiles) {
      const content = fs.readFileSync(file, "utf-8");
      for (const forbidden of FORBIDDEN_DOMAIN_IMPORTS) {
        const importRegex = new RegExp(
          `from\\s+["']${forbidden}["']|import\\(["']${forbidden}["']\\)`,
        );
        if (importRegex.test(content)) {
          violations.push(`${file} imports forbidden package '${forbidden}'`);
        }
      }

      if (content.match(/from\s+["'].*\/infrastructure\/.*["']/)) {
        violations.push(`${file} imports from an infrastructure layer`);
      }
      if (content.match(/from\s+["'].*\/application\/.*["']/)) {
        violations.push(`${file} imports from an application layer`);
      }
    }

    expect(violations).toEqual([]);
  });

  it("enforces zero cross-context internal imports between bounded contexts", () => {
    const moduleFiles = allFiles.filter((f) =>
      f.includes(`${path.sep}modules${path.sep}`),
    );
    const violations: string[] = [];

    for (const file of moduleFiles) {
      // Extract current module name: src/modules/<context>/...
      const relative = path.relative(path.join(CORE_SRC, "modules"), file);
      const currentContext = relative.split(path.sep)[0];
      if (!currentContext) continue;

      const content = fs.readFileSync(file, "utf-8");
      // Look for imports into other modules' internal folders: ../<otherContext>/domain or application or infrastructure
      const crossContextInternalRegex =
        /from\s+["']\.\.\/([a-zA-Z0-9_-]+)\/(domain|application|infrastructure)(\/.*)?["']/;
      const match = content.match(crossContextInternalRegex);
      if (match && match[1] !== currentContext) {
        violations.push(
          `${file} violates context boundary: imports internal '${match[2]}' of '${match[1]}'`,
        );
      }
    }

    expect(violations).toEqual([]);
  });
});
