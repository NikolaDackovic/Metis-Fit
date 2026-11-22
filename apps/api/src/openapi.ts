import { z } from 'zod';
import type { RouteDef } from './shared/route';

type JsonSchema = Record<string, unknown>;

function schemaOf(s: z.ZodType, io: 'input' | 'output'): JsonSchema {
  return z.toJSONSchema(s, { io, unrepresentable: 'any' }) as JsonSchema;
}

function parametersOf(s: z.ZodType | undefined, location: 'path' | 'query') {
  if (!s) return [];
  const json = schemaOf(s, 'input') as {
    properties?: Record<string, JsonSchema>;
    required?: string[];
  };
  return Object.entries(json.properties ?? {}).map(([name, schema]) => ({
    name,
    in: location,
    required: location === 'path' || (json.required ?? []).includes(name),
    schema,
  }));
}

/** OpenAPI 3.1 document generated from the same zod schemas that validate requests. */
export function buildOpenApi(routes: RouteDef[], prefix: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of routes) {
    const path = prefix + r.path.replace(/:(\w+)/g, '{$1}');
    const security = r.access.kind === 'public' ? [] : [{ bearer: [] }];
    paths[path] ??= {};
    paths[path][r.method] = {
      summary: r.summary,
      tags: r.tags,
      security,
      'x-grit-access': r.access.kind === 'permission' ? r.access.permission : r.access.kind,
      parameters: [...parametersOf(r.params, 'path'), ...parametersOf(r.query, 'query')],
      ...(r.body && {
        requestBody: {
          required: true,
          content: { 'application/json': { schema: schemaOf(r.body, 'input') } },
        },
      }),
      responses: {
        200: {
          description: 'Success envelope { success, data, message, error, meta? }',
          ...(r.response && {
            content: {
              'application/json': {
                schema: { type: 'object', properties: { data: schemaOf(r.response, 'output') } },
              },
            },
          }),
        },
        default: { description: 'Error envelope { success: false, error: { code, details } }' },
      },
    };
  }
  return {
    openapi: '3.1.0',
    info: { title: 'GRIT DIGITAL CLUB API', version: '1.0.0' },
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    },
    paths,
  };
}
