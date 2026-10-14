/**
 * Images OpenAPI Paths (documentation-only stub)
 *
 * Only `/images/{key}` lives here now: that route uses Hono's regex param
 * (`:key{.+}`) so keys containing slashes match, which cannot be
 * expressed as a @hono/zod-openapi createRoute path. The serve router is
 * therefore kept on plain Hono and documented via this retained entry,
 * which src/openapi/serve.ts merges into the generated document.
 * Upload is fully migrated to generated specs.
 */

const errorSchema = { $ref: "#/components/schemas/ErrorResponse" };
const json = (schema: object) => ({ "application/json": { schema } });

export const imagePaths = {
  "/images/{key}": {
    get: {
      tags: ["Images"],
      summary: "Serve image",
      description:
        "Public image serving (no auth). Without size parameters, the stored image; with `w` and/or `h` (1–2000, rounded up to a multiple of 40) and `fit` (`cover`, the default with both sizes, or `contain`), a WebP resized once and kept. Cached with immutable headers.",
      operationId: "serveImage",
      security: [],
      parameters: [
        {
          name: "key",
          in: "path",
          required: true,
          schema: { type: "string" },
          description: "Storage key (e.g. `products/abc123.webp`)",
        },
        { name: "w", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 2000 } },
        { name: "h", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 2000 } },
        { name: "fit", in: "query", required: false, schema: { type: "string", enum: ["cover", "contain"] } },
      ],
      responses: {
        "200": { description: "Image file (binary response with appropriate Content-Type)" },
        "400": {
          description: "Invalid image size",
          content: json({
            type: "object",
            properties: {
              error: { type: "string", example: "Invalid key" },
              code: {
                type: "string",
                enum: ["REQUIRED_FIELD_MISSING", "VALIDATION_FAILED"],
                example: "VALIDATION_FAILED",
              },
              category: { type: "string", example: "VALIDATION" },
              context: {
                type: "object",
                properties: {
                  key: { type: "string", example: "../../../etc/passwd" },
                },
              },
            },
          }),
        },
        "404": {
          description: "Image not found",
          content: json({
            type: "object",
            properties: {
              error: { type: "string", example: "Image with ID products/abc123.jpg not found" },
              code: { type: "string", example: "IMAGE_NOT_FOUND" },
              category: { type: "string", example: "BUSINESS_LOGIC" },
              context: {
                type: "object",
                properties: {
                  entity: { type: "string", example: "Image" },
                  id: { type: "string", example: "products/abc123.jpg" },
                },
              },
            },
          }),
        },
      },
    },
  },
};
