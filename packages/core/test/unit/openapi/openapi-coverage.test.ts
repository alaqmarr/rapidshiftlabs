import { describe, it, expect } from "vitest";
import { openApiSpec, type OpenApiOperation } from "../../../src/shared/openapi";

describe("OpenAPI 3.1.0 Specification & Route Coverage", () => {
  it("conforms to OpenAPI 3.1.0 top-level specification requirements", () => {
    expect(openApiSpec.openapi).toBe("3.1.0");
    expect(openApiSpec.info.title).toContain("RapidShift");
    expect(openApiSpec.info.version).toBe("1.0.0");
    expect(openApiSpec.info.description.length).toBeGreaterThan(20);
    expect(openApiSpec.servers.length).toBeGreaterThanOrEqual(1);
    expect(openApiSpec.tags.length).toBeGreaterThanOrEqual(10);
    expect(openApiSpec.components.securitySchemes).toHaveProperty("ApiKeyAuth");
    expect(openApiSpec.components.securitySchemes).toHaveProperty("PublishableKeyAuth");
    expect(openApiSpec.components.securitySchemes).toHaveProperty("SessionAuth");
  });

  const expectedPublicAndPortalPaths = [
    "/api/v1/health",
    "/api/v1/access/status",
    "/api/collect",
    "/api/stream",
    "/api/v1/embed-tokens",
    "/api/v1/billing/invoices/{id}/pdf",
    "/api/v1/portal/billing",
    "/api/v1/portal/contracts",
    "/api/v1/portal/fleet",
    "/api/v1/portal/fleet/processes/{id}/restart",
    "/api/v1/portal/fleet/processes/{id}/logs",
    "/api/v1/portal/domains",
    "/api/v1/portal/domains/{id}",
    "/api/v1/tickets",
    "/api/v1/tickets/{id}",
    "/api/v1/tickets/{id}/messages",
    "/api/v1/tickets/{id}/escalate",
    "/api/v1/tickets/{id}/csat",
    "/api/v1/tickets/canned-replies",
    "/api/v1/credentials",
    "/api/v1/credentials/{id}",
    "/api/v1/credentials/{id}/reveal",
    "/api/v1/releases",
    "/api/v1/releases/{id}",
    "/api/v1/portal/api-keys",
    "/api/v1/portal/api-keys/{id}",
    "/api/v1/analytics/overview",
    "/api/v1/analytics/timeseries",
    "/api/v1/analytics/vitals",
    "/api/v1/analytics/export",
    "/api/v1/analytics/offload",
  ];

  const expectedAdminPaths = [
    "/api/v1/admin/clients",
    "/api/v1/admin/clients/{id}",
    "/api/v1/admin/clients/{id}/invite",
    "/api/v1/admin/contracts",
    "/api/v1/admin/contracts/{id}/activate",
    "/api/v1/admin/invoices",
    "/api/v1/admin/invoices/{id}/issue",
    "/api/v1/admin/payments",
    "/api/v1/admin/servers",
    "/api/v1/admin/servers/{id}",
    "/api/v1/admin/servers/{id}/discover",
    "/api/v1/admin/servers/processes/{id}/map",
    "/api/v1/admin/domains",
    "/api/v1/admin/domains/{id}",
    "/api/v1/admin/domains/{id}/check",
    "/api/v1/admin/entitlements/{clientId}",
    "/api/v1/admin/api-keys",
    "/api/v1/admin/api-keys/{id}",
    "/api/v1/admin/settings",
    "/api/v1/admin/settings/test-email",
  ];

  it("covers 100% of public client and integration API routes", () => {
    for (const pathKey of expectedPublicAndPortalPaths) {
      expect(openApiSpec.paths, `Missing public route in OpenAPI spec: ${pathKey}`).toHaveProperty(pathKey);
    }
  });

  it("covers 100% of administrative API routes", () => {
    for (const pathKey of expectedAdminPaths) {
      expect(openApiSpec.paths, `Missing admin route in OpenAPI spec: ${pathKey}`).toHaveProperty(pathKey);
    }
  });

  it("guarantees every operation has schemas, summary, operationId, tags, and responses", () => {
    const knownTags = new Set(openApiSpec.tags.map((t) => t.name));
    const operationIds = new Set<string>();

    for (const [pathKey, pathItem] of Object.entries(openApiSpec.paths)) {
      const methods = ["get", "post", "put", "delete", "patch"] as const;

      for (const method of methods) {
        const op = pathItem[method] as OpenApiOperation | undefined;
        if (!op) continue;

        // 1. Operation identity & tags
        expect(op.operationId, `Operation ${method.toUpperCase()} ${pathKey} missing operationId`).toBeDefined();
        expect(operationIds.has(op.operationId), `Duplicate operationId: ${op.operationId}`).toBe(false);
        operationIds.add(op.operationId);

        expect(op.summary.length, `Summary missing for ${op.operationId}`).toBeGreaterThan(3);
        expect(op.description.length, `Description missing for ${op.operationId}`).toBeGreaterThan(5);
        expect(op.tags.length, `Tags missing for ${op.operationId}`).toBeGreaterThan(0);
        for (const tag of op.tags) {
          expect(knownTags.has(tag), `Tag '${tag}' in ${op.operationId} not declared in spec.tags`).toBe(true);
        }

        // 2. Parameters verification
        const pathParamsMatches = pathKey.match(/\{([^}]+)\}/g);
        if (pathParamsMatches) {
          const expectedParams = pathParamsMatches.map((p) => p.slice(1, -1));
          const actualPathParams = (op.parameters || [])
            .filter((p) => p.in === "path")
            .map((p) => p.name);

          for (const param of expectedParams) {
            expect(
              actualPathParams,
              `Missing path parameter '${param}' in operation ${op.operationId}`
            ).toContain(param);
          }
        }

        // 3. Request body schema & example verification
        if (op.requestBody) {
          const jsonContent = op.requestBody.content["application/json"];
          expect(jsonContent, `Missing application/json content in requestBody for ${op.operationId}`).toBeDefined();
          expect(jsonContent.schema, `Missing schema in requestBody for ${op.operationId}`).toBeDefined();
          expect(jsonContent.example, `Missing example in requestBody for ${op.operationId}`).toBeDefined();
        }

        // 4. Responses verification (at least one 2xx and one error response)
        const responseCodes = Object.keys(op.responses);
        const has2xx = responseCodes.some((code) => code.startsWith("2"));
        const hasError = responseCodes.some((code) => code.startsWith("4") || code.startsWith("5"));

        expect(has2xx, `Operation ${op.operationId} has no 2xx success response`).toBe(true);
        expect(hasError, `Operation ${op.operationId} has no 4xx/5xx error response`).toBe(true);

        for (const [code, resp] of Object.entries(op.responses)) {
          expect(resp.description.length, `Response ${code} missing description in ${op.operationId}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("verifies total operation count exceeds 50 operations covering full system surface", () => {
    let count = 0;
    for (const pathItem of Object.values(openApiSpec.paths)) {
      const methods = ["get", "post", "put", "delete", "patch"] as const;
      for (const m of methods) {
        if (pathItem[m]) count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(50);
  });
});
