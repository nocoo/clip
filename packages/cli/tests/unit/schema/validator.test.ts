import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import type { ClipSchema } from "../../../src/schema/types";
import {
  ClipSchemaZod,
  validateSemantics,
} from "../../../src/schema/validator";

// --- Helper: minimal valid schema object ---

function validSchema(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: "Todo API",
    alias: "todo",
    version: "1.0.0",
    baseUrl: "http://localhost:3000",
    auth: { type: "header", headerName: "X-API-Key" },
    endpoints: [
      {
        name: "list",
        method: "GET",
        path: "/todos",
        description: "List all todos",
      },
    ],
    ...overrides,
  };
}

function validEndpoint(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: "list",
    method: "GET",
    path: "/todos",
    description: "List all todos",
    ...overrides,
  };
}

// =============================================================
// Zod structural validation
// =============================================================

describe("ClipSchemaZod", () => {
  it("validates a correct minimal schema", () => {
    const result = ClipSchemaZod.parse(validSchema());
    expect(result.name).toBe("Todo API");
    expect(result.alias).toBe("todo");
    expect(result.endpoints).toHaveLength(1);
  });

  it("validates a full schema with all fields", () => {
    const full = validSchema({
      endpoints: [
        {
          name: "list",
          method: "GET",
          path: "/todos",
          description: "List all todos",
          response: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: "string",
                title: "string",
                completed: "boolean",
              },
            },
          },
        },
        {
          name: "create",
          method: "POST",
          path: "/todos",
          description: "Create a new todo",
          params: {
            body: { title: { type: "string", required: true } },
          },
          response: {
            type: "object",
            properties: { id: "string", title: "string", completed: "boolean" },
          },
        },
        {
          name: "get",
          method: "GET",
          path: "/todos/:id",
          description: "Get a todo by ID",
          params: {
            path: { id: { type: "string", required: true } },
          },
          response: {
            type: "object",
            properties: { id: "string", title: "string", completed: "boolean" },
          },
        },
      ],
    });
    const result = ClipSchemaZod.parse(full);
    expect(result.endpoints).toHaveLength(3);
  });

  // --- Top-level field validation ---

  describe("top-level fields", () => {
    it("rejects missing name", () => {
      const s = validSchema();
      delete (s as Record<string, unknown>).name;
      expect(() => ClipSchemaZod.parse(s)).toThrow(ZodError);
    });

    it("rejects empty name", () => {
      expect(() => ClipSchemaZod.parse(validSchema({ name: "" }))).toThrow(
        ZodError,
      );
    });

    it("rejects invalid alias — uppercase", () => {
      expect(() => ClipSchemaZod.parse(validSchema({ alias: "Todo" }))).toThrow(
        ZodError,
      );
    });

    it("rejects invalid alias — spaces", () => {
      expect(() =>
        ClipSchemaZod.parse(validSchema({ alias: "my api" })),
      ).toThrow(ZodError);
    });

    it("rejects invalid alias — starts with number", () => {
      expect(() =>
        ClipSchemaZod.parse(validSchema({ alias: "1todo" })),
      ).toThrow(ZodError);
    });

    it("accepts valid alias with hyphens", () => {
      const result = ClipSchemaZod.parse(validSchema({ alias: "my-api" }));
      expect(result.alias).toBe("my-api");
    });

    it("rejects invalid version", () => {
      expect(() =>
        ClipSchemaZod.parse(validSchema({ version: "v1.0" })),
      ).toThrow(ZodError);
    });

    it("rejects invalid baseUrl", () => {
      expect(() =>
        ClipSchemaZod.parse(validSchema({ baseUrl: "not-a-url" })),
      ).toThrow(ZodError);
    });

    it("rejects empty endpoints array", () => {
      expect(() => ClipSchemaZod.parse(validSchema({ endpoints: [] }))).toThrow(
        ZodError,
      );
    });
  });

  // --- Auth validation ---

  describe("auth", () => {
    it("rejects unsupported auth type", () => {
      expect(() =>
        ClipSchemaZod.parse(
          validSchema({ auth: { type: "bearer", headerName: "Auth" } }),
        ),
      ).toThrow(ZodError);
    });

    it("rejects empty headerName", () => {
      expect(() =>
        ClipSchemaZod.parse(
          validSchema({ auth: { type: "header", headerName: "" } }),
        ),
      ).toThrow(ZodError);
    });

    describe("oauth", () => {
      it("validates a minimal oauth auth and applies defaults", () => {
        const result = ClipSchemaZod.parse(
          validSchema({ auth: { type: "oauth" } }),
        );
        expect(result.auth.type).toBe("oauth");
        if (result.auth.type === "oauth") {
          expect(result.auth.tokenParam).toBe("api_key");
          expect(result.auth.loginPath).toBe("/api/auth/cli");
          expect(result.auth.headerName).toBe("Authorization");
          expect(result.auth.headerPrefix).toBe("Bearer");
          expect(result.auth.loginUrl).toBeUndefined();
        }
      });

      it("validates a full oauth auth with all fields set", () => {
        const result = ClipSchemaZod.parse(
          validSchema({
            auth: {
              type: "oauth",
              loginUrl: "https://example.com/api/auth/cli",
              tokenParam: "token",
              loginPath: "/login",
              headerName: "X-Auth",
              headerPrefix: "Token",
            },
          }),
        );
        if (result.auth.type === "oauth") {
          expect(result.auth.loginUrl).toBe("https://example.com/api/auth/cli");
          expect(result.auth.tokenParam).toBe("token");
          expect(result.auth.loginPath).toBe("/login");
          expect(result.auth.headerName).toBe("X-Auth");
          expect(result.auth.headerPrefix).toBe("Token");
        }
      });

      it("rejects invalid loginUrl", () => {
        expect(() =>
          ClipSchemaZod.parse(
            validSchema({ auth: { type: "oauth", loginUrl: "not-a-url" } }),
          ),
        ).toThrow(ZodError);
      });

      it("rejects loginPath not starting with /", () => {
        expect(() =>
          ClipSchemaZod.parse(
            validSchema({ auth: { type: "oauth", loginPath: "api/auth" } }),
          ),
        ).toThrow(ZodError);
      });

      it("rejects empty headerName for oauth", () => {
        expect(() =>
          ClipSchemaZod.parse(
            validSchema({ auth: { type: "oauth", headerName: "" } }),
          ),
        ).toThrow(ZodError);
      });

      it("allows empty headerPrefix for tokens without prefix", () => {
        const result = ClipSchemaZod.parse(
          validSchema({ auth: { type: "oauth", headerPrefix: "" } }),
        );
        if (result.auth.type === "oauth") {
          expect(result.auth.headerPrefix).toBe("");
        }
      });
    });
  });

  // --- Endpoint validation ---

  describe("endpoints", () => {
    it("rejects invalid endpoint name — uppercase", () => {
      expect(() =>
        ClipSchemaZod.parse(
          validSchema({ endpoints: [validEndpoint({ name: "ListTodos" })] }),
        ),
      ).toThrow(ZodError);
    });

    it("rejects invalid endpoint name — spaces", () => {
      expect(() =>
        ClipSchemaZod.parse(
          validSchema({
            endpoints: [validEndpoint({ name: "list todos" })],
          }),
        ),
      ).toThrow(ZodError);
    });

    it("rejects unsupported HTTP method", () => {
      expect(() =>
        ClipSchemaZod.parse(
          validSchema({ endpoints: [validEndpoint({ method: "OPTIONS" })] }),
        ),
      ).toThrow(ZodError);
    });

    it("rejects path not starting with /", () => {
      expect(() =>
        ClipSchemaZod.parse(
          validSchema({ endpoints: [validEndpoint({ path: "todos" })] }),
        ),
      ).toThrow(ZodError);
    });
  });

  // --- Params validation ---

  describe("params", () => {
    it("validates string, number, boolean param types", () => {
      const ep = validEndpoint({
        name: "search",
        params: {
          query: {
            q: { type: "string", required: true },
            limit: { type: "number" },
            verbose: { type: "boolean" },
          },
        },
      });
      const result = ClipSchemaZod.parse(validSchema({ endpoints: [ep] }));
      expect(result.endpoints[0].params?.query).toBeDefined();
    });

    it("validates array param with items", () => {
      const ep = validEndpoint({
        name: "batch",
        method: "POST",
        path: "/batch",
        params: {
          body: {
            ids: { type: "array", items: { type: "string" } },
          },
        },
      });
      const result = ClipSchemaZod.parse(validSchema({ endpoints: [ep] }));
      expect(result.endpoints[0].params?.body?.ids.type).toBe("array");
    });

    it("rejects array param without items", () => {
      const ep = validEndpoint({
        name: "batch",
        method: "POST",
        path: "/batch",
        params: {
          body: {
            ids: { type: "array" },
          },
        },
      });
      expect(() =>
        ClipSchemaZod.parse(validSchema({ endpoints: [ep] })),
      ).toThrow(ZodError);
    });

    it("validates enum param", () => {
      const ep = validEndpoint({
        name: "filter",
        params: {
          query: {
            status: { type: "string", enum: ["active", "done"] },
          },
        },
      });
      const result = ClipSchemaZod.parse(validSchema({ endpoints: [ep] }));
      expect(result.endpoints[0].params?.query?.status.enum).toEqual([
        "active",
        "done",
      ]);
    });

    it("validates nullable param", () => {
      const ep = validEndpoint({
        name: "update",
        method: "PATCH",
        path: "/items/:id",
        params: {
          path: { id: { type: "string", required: true } },
          body: {
            title: { type: "string", nullable: true },
          },
        },
      });
      const result = ClipSchemaZod.parse(validSchema({ endpoints: [ep] }));
      expect(result.endpoints[0].params?.body?.title.nullable).toBe(true);
    });
  });

  // --- Response validation ---

  describe("response", () => {
    it("validates simple response types", () => {
      for (const type of ["string", "number", "boolean"] as const) {
        const ep = validEndpoint({ name: `get-${type}`, response: { type } });
        const result = ClipSchemaZod.parse(validSchema({ endpoints: [ep] }));
        expect(result.endpoints[0].response?.type).toBe(type);
      }
    });

    it("validates object response with properties", () => {
      const ep = validEndpoint({
        response: {
          type: "object",
          properties: { id: "string", count: "number", ok: "boolean" },
        },
      });
      const result = ClipSchemaZod.parse(validSchema({ endpoints: [ep] }));
      expect(result.endpoints[0].response?.type).toBe("object");
    });

    it("validates nested array of objects response", () => {
      const ep = validEndpoint({
        response: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: "string",
              tags: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
      });
      const result = ClipSchemaZod.parse(validSchema({ endpoints: [ep] }));
      expect(result.endpoints[0].response?.type).toBe("array");
    });

    it("rejects object response without properties", () => {
      const ep = validEndpoint({
        response: { type: "object" },
      });
      expect(() =>
        ClipSchemaZod.parse(validSchema({ endpoints: [ep] })),
      ).toThrow(ZodError);
    });

    it("rejects array response without items", () => {
      const ep = validEndpoint({
        response: { type: "array" },
      });
      expect(() =>
        ClipSchemaZod.parse(validSchema({ endpoints: [ep] })),
      ).toThrow(ZodError);
    });

    it("rejects unsupported response type", () => {
      const ep = validEndpoint({
        response: { type: "date" },
      });
      expect(() =>
        ClipSchemaZod.parse(validSchema({ endpoints: [ep] })),
      ).toThrow(ZodError);
    });
  });
});

// =============================================================
// Semantic validation
// =============================================================

describe("validateSemantics", () => {
  function makeSchema(endpoints: ClipSchema["endpoints"]): ClipSchema {
    return {
      name: "Test API",
      alias: "test",
      version: "1.0.0",
      baseUrl: "http://localhost:3000",
      auth: { type: "header", headerName: "X-API-Key" },
      endpoints,
    };
  }

  it("returns no errors for a valid schema", () => {
    const schema = makeSchema([
      { name: "list", method: "GET", path: "/todos", description: "List" },
      { name: "create", method: "POST", path: "/todos", description: "Create" },
    ]);
    expect(validateSemantics(schema)).toEqual([]);
  });

  it("detects duplicate endpoint names", () => {
    const schema = makeSchema([
      { name: "list", method: "GET", path: "/todos", description: "List" },
      { name: "list", method: "POST", path: "/todos", description: "List v2" },
    ]);
    const errors = validateSemantics(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("Duplicate endpoint name: list");
  });

  it("detects undeclared path params", () => {
    const schema = makeSchema([
      {
        name: "get",
        method: "GET",
        path: "/todos/:id",
        description: "Get",
      },
    ]);
    const errors = validateSemantics(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("Path param :id not declared");
  });

  it("detects orphan declared params", () => {
    const schema = makeSchema([
      {
        name: "get",
        method: "GET",
        path: "/todos",
        description: "Get",
        params: {
          path: { id: { type: "string", required: true } },
        },
      },
    ]);
    const errors = validateSemantics(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("Declared param id not found in path");
  });

  it("detects duplicate method+path combinations", () => {
    const schema = makeSchema([
      { name: "list", method: "GET", path: "/todos", description: "List" },
      {
        name: "list-v2",
        method: "GET",
        path: "/todos",
        description: "List v2",
      },
    ]);
    const errors = validateSemantics(schema);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("Duplicate method+path: GET /todos");
  });

  it("passes when path params match declared params", () => {
    const schema = makeSchema([
      {
        name: "get",
        method: "GET",
        path: "/todos/:id",
        description: "Get",
        params: {
          path: { id: { type: "string", required: true } },
        },
      },
    ]);
    const errors = validateSemantics(schema);
    expect(errors).toEqual([]);
  });

  it("handles multiple path params", () => {
    const schema = makeSchema([
      {
        name: "get-comment",
        method: "GET",
        path: "/todos/:todoId/comments/:commentId",
        description: "Get comment",
        params: {
          path: {
            todoId: { type: "string", required: true },
            commentId: { type: "string", required: true },
          },
        },
      },
    ]);
    const errors = validateSemantics(schema);
    expect(errors).toEqual([]);
  });

  it("detects multiple errors at once", () => {
    const schema = makeSchema([
      {
        name: "get",
        method: "GET",
        path: "/todos/:id",
        description: "Get",
        params: {
          path: { slug: { type: "string", required: true } },
        },
      },
      {
        name: "get",
        method: "GET",
        path: "/todos/:id",
        description: "Get v2",
      },
    ]);
    const errors = validateSemantics(schema);
    // duplicate name, undeclared :id, orphan slug, undeclared :id (2nd ep), duplicate method+path
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });

  describe("OAuth reserved endpoint names", () => {
    function makeOAuthSchema(endpoints: ClipSchema["endpoints"]): ClipSchema {
      return {
        name: "OAuth API",
        alias: "oapi",
        version: "1.0.0",
        baseUrl: "https://api.example.com",
        auth: {
          type: "oauth",
          tokenParam: "api_key",
          loginPath: "/api/auth/cli",
          headerName: "Authorization",
          headerPrefix: "Bearer",
        },
        endpoints,
      };
    }

    it("rejects endpoint named 'login' for OAuth schemas", () => {
      const schema = makeOAuthSchema([
        {
          name: "login",
          method: "POST",
          path: "/login",
          description: "Login",
        },
      ]);
      const errors = validateSemantics(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('"login"'))).toBe(true);
    });

    it("rejects endpoint named 'logout' for OAuth schemas", () => {
      const schema = makeOAuthSchema([
        {
          name: "logout",
          method: "POST",
          path: "/logout",
          description: "Logout",
        },
      ]);
      const errors = validateSemantics(schema);
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('"logout"'))).toBe(true);
    });

    it("allows 'login' endpoint for header-auth schemas", () => {
      const schema = makeSchema([
        {
          name: "login",
          method: "POST",
          path: "/login",
          description: "Login",
        },
      ]);
      expect(validateSemantics(schema)).toEqual([]);
    });
  });
});
