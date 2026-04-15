import type { z } from "zod";
import type { ClipSchemaZod } from "./validator";

export type ClipSchema = z.infer<typeof ClipSchemaZod>;

export interface ValidationError {
  path: string;
  message: string;
}

export class ClipSchemaError extends Error {
  constructor(public errors: ValidationError[]) {
    super(
      `Schema validation failed:\n${errors.map((e) => `  ${e.path}: ${e.message}`).join("\n")}`,
    );
    this.name = "ClipSchemaError";
  }
}
