import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

function getAllRouteFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllRouteFiles(filePath, fileList);
    } else if (file === "route.ts") {
      fileList.push(filePath);
    }
  }
  return fileList;
}

describe("API Routes Guardrail", () => {
  it("every route handler in app/api should be wrapped in withApiAuth", () => {
    const apiDir = path.resolve(process.cwd(), "app/api");
    const routeFiles = getAllRouteFiles(apiDir);

    for (const routeFile of routeFiles) {
      if (routeFile.endsWith(path.join("app", "api", "health", "route.ts"))) {
        continue; // Healthcheck must be public for Docker
      }

      const content = fs.readFileSync(routeFile, "utf-8");
      const importsWithApiAuth = content.includes("withApiAuth");
      const usesWithApiAuth = content.includes("withApiAuth(");

      assert.ok(
        importsWithApiAuth && usesWithApiAuth,
        `Route file ${routeFile} is missing withApiAuth structural protection. All API routes must be wrapped with withApiAuth from @/lib/sso.`,
      );
    }
  });
});
