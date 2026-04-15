import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ClipSchema } from "../schema/types";

type ResponseSchema = NonNullable<ClipSchema["endpoints"][number]["response"]>;

// CRUD method names that should be grouped into a sequence test
const CRUD_DEPENDENT_METHODS = new Set(["GET", "PATCH", "PUT", "DELETE"]);

/**
 * Generates test files for a ClipSchema alongside generated CLI output.
 */
export async function generateTests(
  schema: ClipSchema,
  outputDir: string,
): Promise<void> {
  const testsDir = join(outputDir, "tests");
  await mkdir(testsDir, { recursive: true });

  // Determine which endpoints have path params with :id — these are resource-dependent
  const resourceEndpoints = schema.endpoints.filter(
    (ep) => ep.path.includes(":") && CRUD_DEPENDENT_METHODS.has(ep.method),
  );
  const independentEndpoints = schema.endpoints.filter(
    (ep) => !resourceEndpoints.includes(ep),
  );

  // Check if we have a create endpoint to anchor the CRUD sequence
  const createEndpoint = schema.endpoints.find(
    (ep) => ep.method === "POST" && !ep.path.includes(":"),
  );

  const writes: Promise<void>[] = [];

  // Generate individual test files for independent endpoints
  for (const ep of independentEndpoints) {
    const content = renderEndpointTest(ep, schema);
    writes.push(writeFile(join(testsDir, `${ep.name}.test.ts`), content));
  }

  // Generate CRUD sequence test if we have create + resource-dependent endpoints
  if (createEndpoint && resourceEndpoints.length > 0) {
    const content = renderCrudSequenceTest(
      createEndpoint,
      resourceEndpoints,
      schema,
    );
    writes.push(writeFile(join(testsDir, "crud-sequence.test.ts"), content));
  }

  await Promise.all(writes);
}

/**
 * Renders a standalone test file for an independent endpoint.
 */
function renderEndpointTest(
  endpoint: ClipSchema["endpoints"][number],
  schema: ClipSchema,
): string {
  const bodyParams = endpoint.params?.body ?? {};
  const hasBody = Object.keys(bodyParams).length > 0;

  const queryParams = endpoint.params?.query ?? {};
  const queryString = buildQueryString(queryParams);
  const urlSuffix = queryString ? `?${queryString}` : "";

  const sampleBody = hasBody
    ? `\n      body: JSON.stringify({\n${Object.entries(bodyParams)
        .map(([name, def]) => `        ${name}: ${sampleValue(name, def.type)}`)
        .join(",\n")},\n      }),`
    : "";

  const headers = [`        "${schema.auth.headerName}": API_KEY`];
  if (hasBody) {
    headers.unshift(`        "Content-Type": "application/json"`);
  }

  const shapeValidation = endpoint.response
    ? `\n    const body = await response.json();\n\n    // Response shape validation\n${generateShapeValidator(endpoint.response, "body")}`
    : "";

  return `import { describe, test, expect } from "bun:test";

const BASE_URL = process.env.CLIP_TEST_BASE_URL || "${schema.baseUrl}";
const API_KEY = process.env.CLIP_TEST_API_KEY || "";

describe("${endpoint.name}", () => {
  test("${endpoint.method} ${endpoint.path} — ${endpoint.description}", async () => {
    const response = await fetch(\`\${BASE_URL}${endpoint.path}${urlSuffix}\`, {
      method: "${endpoint.method}",
      headers: {
${headers.join(",\n")},
      },${sampleBody}
    });

    expect(response.ok).toBe(true);${shapeValidation}
  });
});
`;
}

/**
 * Renders a CRUD sequence test that chains create → get → update → delete.
 */
function renderCrudSequenceTest(
  createEndpoint: ClipSchema["endpoints"][number],
  resourceEndpoints: ClipSchema["endpoints"][number][],
  schema: ClipSchema,
): string {
  const bodyParams = createEndpoint.params?.body ?? {};
  const createBody = Object.entries(bodyParams)
    .map(([name, def]) => `        ${name}: ${sampleValue(name, def.type)}`)
    .join(",\n");

  // Find endpoints by method
  const getEp = resourceEndpoints.find((ep) => ep.method === "GET");
  const updateEp = resourceEndpoints.find(
    (ep) => ep.method === "PATCH" || ep.method === "PUT",
  );
  const deleteEp = resourceEndpoints.find((ep) => ep.method === "DELETE");

  // Generate update body if we have an update endpoint
  const updateBodyParams = updateEp?.params?.body ?? {};
  const updateBody =
    Object.keys(updateBodyParams).length > 0
      ? Object.entries(updateBodyParams)
          .map(
            ([name, def]) => `        ${name}: ${sampleValue(name, def.type)}`,
          )
          .join(",\n")
      : "";

  const steps: string[] = [];

  // Extract the path param name from the first resource endpoint's params.path definition.
  // Falls back to "id" if no params.path is defined.
  const firstResourceEp = resourceEndpoints[0];
  const pathParamName = firstResourceEp.params?.path
    ? Object.keys(firstResourceEp.params.path)[0]
    : "id";

  // Helper: replace all :paramName occurrences in a path with the template variable
  const replacePathParam = (path: string): string =>
    // biome-ignore lint/suspicious/noTemplateCurlyInString: intentional template placeholder for generated code
    path.replace(new RegExp(`:${pathParamName}`, "g"), "${createdId}");

  // Create step
  steps.push(`    // Create
    const createRes = await fetch(\`\${BASE_URL}${createEndpoint.path}\`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "${schema.auth.headerName}": API_KEY,
      },
      body: JSON.stringify({
${createBody},
      }),
    });
    expect(createRes.ok).toBe(true);
    const created = await createRes.json();
    const createdId = created.${pathParamName};`);

  // Get step
  if (getEp) {
    const getPath = replacePathParam(getEp.path);
    const getQueryParams = getEp.params?.query ?? {};
    const getQueryString = buildQueryString(getQueryParams);
    const getUrlSuffix = getQueryString ? `?${getQueryString}` : "";
    steps.push(`
    // Get
    const getRes = await fetch(\`\${BASE_URL}${getPath}${getUrlSuffix}\`, {
      method: "GET",
      headers: {
        "${schema.auth.headerName}": API_KEY,
      },
    });
    expect(getRes.ok).toBe(true);`);
  }

  // Update step
  if (updateEp) {
    const updatePath = replacePathParam(updateEp.path);
    const updateQueryParams = updateEp.params?.query ?? {};
    const updateQueryString = buildQueryString(updateQueryParams);
    const updateUrlSuffix = updateQueryString ? `?${updateQueryString}` : "";
    steps.push(`
    // Update
    const updateRes = await fetch(\`\${BASE_URL}${updatePath}${updateUrlSuffix}\`, {
      method: "${updateEp.method}",
      headers: {
        "Content-Type": "application/json",
        "${schema.auth.headerName}": API_KEY,
      },${
        updateBody
          ? `
      body: JSON.stringify({
${updateBody},
      }),`
          : ""
      }
    });
    expect(updateRes.ok).toBe(true);`);
  }

  // Delete step
  if (deleteEp) {
    const deletePath = replacePathParam(deleteEp.path);
    const deleteQueryParams = deleteEp.params?.query ?? {};
    const deleteQueryString = buildQueryString(deleteQueryParams);
    const deleteUrlSuffix = deleteQueryString ? `?${deleteQueryString}` : "";
    steps.push(`
    // Delete
    const deleteRes = await fetch(\`\${BASE_URL}${deletePath}${deleteUrlSuffix}\`, {
      method: "DELETE",
      headers: {
        "${schema.auth.headerName}": API_KEY,
      },
    });
    expect(deleteRes.ok).toBe(true);`);
  }

  return `import { describe, test, expect } from "bun:test";

const BASE_URL = process.env.CLIP_TEST_BASE_URL || "${schema.baseUrl}";
const API_KEY = process.env.CLIP_TEST_API_KEY || "";

describe("CRUD sequence", () => {
  test("create → get → update → delete", async () => {
${steps.join("\n")}
  });
});
`;
}

/**
 * Generates response shape validation assertions.
 */
function generateShapeValidator(
  schema: ResponseSchema,
  varName: string,
): string {
  switch (schema.type) {
    case "array": {
      const itemValidation =
        "items" in schema && schema.items
          ? generateShapeValidator(schema.items, `${varName}[0]`)
          : "";
      return `    expect(Array.isArray(${varName})).toBe(true);
    if (${varName}.length > 0) {
${itemValidation}
    }`;
    }
    case "object": {
      const props =
        "properties" in schema && schema.properties
          ? Object.entries(schema.properties)
              .map(([key, propType]) => {
                const expectedType =
                  typeof propType === "string" ? propType : "object";
                return `    expect(typeof ${varName}.${key}).toBe("${expectedType}");`;
              })
              .join("\n")
          : "";
      return `    expect(typeof ${varName}).toBe("object");
${props}`;
    }
    default:
      return `    expect(typeof ${varName}).toBe("${schema.type}");`;
  }
}

/**
 * Generates a deterministic sample value for a given parameter type.
 */
function sampleValue(paramName: string, type: string): string {
  switch (type) {
    case "string":
      return `"test-${paramName}"`;
    case "number":
      return "42";
    case "boolean":
      return "true";
    default:
      return `"test-${paramName}"`;
  }
}

/**
 * Builds a URL query string from query param definitions with sample values.
 */
function buildQueryString(
  queryParams: Record<string, { type: string }>,
): string {
  const entries = Object.entries(queryParams);
  if (entries.length === 0) return "";
  return entries
    .map(([name, def]) => {
      const raw = sampleValue(name, def.type);
      // Strip surrounding quotes for the URL value
      const value = raw.startsWith('"') ? raw.slice(1, -1) : raw;
      return `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
    })
    .join("&");
}
