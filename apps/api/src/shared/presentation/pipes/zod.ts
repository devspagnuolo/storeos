import { Body, PipeTransform, Query } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import { ZodError, type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ValidationError } from '../../domain/errors';

export function zodIssuesToFieldErrors(error: ZodError) {
  return error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationError('Dados inválidos', zodIssuesToFieldErrors(result.error));
    }
    return result.data;
  }
}

interface JsonSchema {
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

function toJsonSchema(schema: ZodTypeAny): JsonSchema {
  // O cast via unknown evita a instanciação profunda de tipos do zod-to-json-schema.
  const json = (zodToJsonSchema as unknown as (s: unknown, o: unknown) => JsonSchema)(schema, {
    target: 'openApi3',
    $refStrategy: 'none',
  });
  delete json['$schema'];
  return json;
}

/** @Body validado por Zod, documentado no Swagger a partir do schema. */
export function ZodBody(schema: ZodTypeAny): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    Body(new ZodValidationPipe(schema))(target, propertyKey, parameterIndex);
    if (propertyKey === undefined) return;
    const descriptor = Object.getOwnPropertyDescriptor(target, propertyKey);
    if (descriptor) ApiBody({ schema: toJsonSchema(schema) as never })(target, propertyKey, descriptor);
  };
}

/** @Query validado por Zod; cada propriedade do schema vira um parâmetro no Swagger. */
export function ZodQuery(schema: ZodTypeAny): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    Query(new ZodValidationPipe(schema))(target, propertyKey, parameterIndex);
    if (propertyKey === undefined) return;
    const descriptor = Object.getOwnPropertyDescriptor(target, propertyKey);
    if (!descriptor) return;
    const json = toJsonSchema(schema);
    const required = json.required ?? [];
    for (const [name, prop] of Object.entries(json.properties ?? {})) {
      ApiQuery({ name, required: required.includes(name), schema: prop as never })(target, propertyKey, descriptor);
    }
  };
}
