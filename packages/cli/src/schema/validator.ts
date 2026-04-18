import { z } from "zod";
import type { ClipSchema, ValidationError } from "./types";

const aliasPattern = /^[a-z][a-z0-9-]*$/;
const endpointNamePattern = /^[a-z][a-z0-9-]*$/;
const httpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

// --- Type declarations for recursive Zod schemas ---

interface ParamDef {
  type: "string" | "number" | "boolean" | "array";
  required?: boolean;
  description?: string;
  items?: ParamDef;
  enum?: (string | number)[];
  nullable?: boolean;
}

type PropertyDef = "string" | "number" | "boolean" | ResponseSchema;

type ResponseSchema =
  | { type: "object"; properties: Record<string, PropertyDef> }
  | { type: "array"; items: ResponseSchema }
  | { type: "string" }
  | { type: "number" }
  | { type: "boolean" };

// --- Zod schemas ---

const ParamDefSchema: z.ZodType<ParamDef> = z.lazy(() =>
  z
    .object({
      type: z.enum(["string", "number", "boolean", "array"]),
      required: z.boolean().optional(),
      description: z.string().optional(),
      items: ParamDefSchema.optional(),
      enum: z.array(z.union([z.string(), z.number()])).optional(),
      nullable: z.boolean().optional(),
    })
    .refine((data) => data.type !== "array" || data.items !== undefined, {
      message: "items is required when type is 'array'",
    }),
);

const PropertyDefSchema: z.ZodType<PropertyDef> = z.lazy(() =>
  z.union([z.enum(["string", "number", "boolean"]), ResponseSchemaZod]),
);

const ResponseSchemaZod: z.ZodType<ResponseSchema> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("object"),
      properties: z.record(z.string(), PropertyDefSchema),
    }),
    z.object({
      type: z.literal("array"),
      items: z.lazy(() => ResponseSchemaZod),
    }),
    z.object({ type: z.literal("string") }),
    z.object({ type: z.literal("number") }),
    z.object({ type: z.literal("boolean") }),
  ]),
);

const EndpointSchema = z.object({
  name: z.string().regex(endpointNamePattern),
  method: z.enum(httpMethods),
  path: z.string().startsWith("/"),
  description: z.string(),
  params: z
    .object({
      path: z.record(z.string(), ParamDefSchema).optional(),
      query: z.record(z.string(), ParamDefSchema).optional(),
      body: z.record(z.string(), ParamDefSchema).optional(),
    })
    .optional(),
  response: ResponseSchemaZod.optional(),
});

const HeaderAuthSchema = z.object({
  type: z.literal("header"),
  headerName: z.string().min(1),
});

const OAuthAuthSchema = z.object({
  type: z.literal("oauth"),
  loginUrl: z.string().url().optional(),
  tokenParam: z.string().min(1).default("api_key"),
  loginPath: z.string().startsWith("/").default("/api/auth/cli"),
  headerName: z.string().min(1).default("Authorization"),
  headerPrefix: z.string().default("Bearer"),
});

const AuthSchema = z.discriminatedUnion("type", [
  HeaderAuthSchema,
  OAuthAuthSchema,
]);

export const ClipSchemaZod = z.object({
  name: z.string().min(1),
  alias: z.string().regex(aliasPattern),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  baseUrl: z.string().url(),
  auth: AuthSchema,
  endpoints: z.array(EndpointSchema).min(1),
});

// --- Semantic validation ---

export function validateSemantics(schema: ClipSchema): ValidationError[] {
  const errors: ValidationError[] = [];

  // 1. Unique endpoint names
  const names = new Set<string>();
  for (const ep of schema.endpoints) {
    if (names.has(ep.name)) {
      errors.push({
        path: `endpoints.${ep.name}`,
        message: `Duplicate endpoint name: ${ep.name}`,
      });
    }
    names.add(ep.name);
  }

  // 2-3. Path param consistency
  for (const ep of schema.endpoints) {
    const pathParams = (ep.path.match(/:([a-zA-Z0-9_]+)/g) || []).map((p) =>
      p.slice(1),
    );
    const declaredParams = Object.keys(ep.params?.path || {});

    for (const p of pathParams) {
      if (!declaredParams.includes(p)) {
        errors.push({
          path: `endpoints.${ep.name}.path`,
          message: `Path param :${p} not declared in params.path`,
        });
      }
    }
    for (const p of declaredParams) {
      if (!pathParams.includes(p)) {
        errors.push({
          path: `endpoints.${ep.name}.params.path.${p}`,
          message: `Declared param ${p} not found in path`,
        });
      }
    }
  }

  // 4. Unique method+path
  const methodPaths = new Set<string>();
  for (const ep of schema.endpoints) {
    const key = `${ep.method} ${ep.path}`;
    if (methodPaths.has(key)) {
      errors.push({
        path: `endpoints.${ep.name}`,
        message: `Duplicate method+path: ${key}`,
      });
    }
    methodPaths.add(key);
  }

  return errors;
}
