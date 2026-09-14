import { load as yamlLoad } from 'js-yaml';
import type { NullIncludeMode } from './pojo-generator';

export interface OpenApiOptions {
  includeMode?: NullIncludeMode;
  useLombok?: boolean;
}

interface Field {
  name: string;
  type: string;
  annotations: string[];
}

interface EnumDef {
  name: string;
  constants: string[];
}

interface ClassDef {
  name: string;
  fields: Field[];
  nested: ClassDef[];
  enums: EnumDef[];
}

type Schema = Record<string, unknown>;

function isObject(v: unknown): v is Schema {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function nestedName(prop: string, className: string): string {
  const base = capitalize(prop);
  return base === className ? `${base}Dto` : base;
}

function enumConstant(v: unknown): string {
  const s = String(v).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return s || 'VALUE';
}

function refName(ref: string): string {
  const parts = ref.split('/');
  return parts[parts.length - 1];
}

/** Merge an allOf list into a single flat schema. */
function resolveAllOf(schema: Schema, schemas: Record<string, unknown>): Schema {
  const allOf = schema['allOf'];
  if (!Array.isArray(allOf)) return schema;
  const merged: Schema = { type: 'object' };
  const props: Record<string, unknown> = {};
  for (const part of allOf) {
    if (!isObject(part)) continue;
    let resolved: Schema = part;
    if (typeof part['$ref'] === 'string') {
      const name = refName(part['$ref'] as string);
      const looked = schemas[name];
      if (isObject(looked)) resolved = looked;
    }
    if (isObject(resolved['properties'])) {
      Object.assign(props, resolved['properties']);
    }
  }
  if (Object.keys(props).length > 0) merged['properties'] = props;
  // Carry over any non-allOf keys from the original schema
  for (const [k, v] of Object.entries(schema)) {
    if (k !== 'allOf' && !(k in merged)) merged[k] = v;
  }
  return merged;
}

function primitiveType(type: string, format: string | undefined): string | null {
  switch (type) {
    case 'string':
      if (format === 'date') return 'java.time.LocalDate';
      if (format === 'date-time') return 'java.time.OffsetDateTime';
      return 'String';
    case 'integer':
      if (format === 'int64') return 'long';
      return 'int';
    case 'number':
      if (format === 'float') return 'float';
      return 'double';
    case 'boolean':
      return 'boolean';
    default:
      return null;
  }
}

/**
 * Build a ClassDef for one schema. Registers inline nested objects and
 * enums into the given ClassDef (recursively for deeper nesting).
 */
function buildClass(
  name: string,
  schema: Schema,
  schemas: Record<string, unknown>,
): ClassDef {
  const def: ClassDef = { name, fields: [], nested: [], enums: [] };
  const s = resolveAllOf(schema, schemas);
  const properties = isObject(s['properties']) ? s['properties'] : {};

  for (const [prop, raw] of Object.entries(properties)) {
    if (!isObject(raw)) continue;
    const field = makeField(prop, raw, name, schemas, def);
    def.fields.push(field);
  }
  return def;
}

function makeField(
  prop: string,
  schema: Schema,
  className: string,
  schemas: Record<string, unknown>,
  owner: ClassDef,
): Field {
  const annotations: string[] = [`@JsonProperty("${prop}")`];

  // Enum?
  if (schema['type'] === 'string' && Array.isArray(schema['enum']) && (schema['enum'] as unknown[]).length > 0) {
    const enumName = nestedName(prop, className);
    const constants = (schema['enum'] as unknown[]).map(enumConstant);
    owner.enums.push({ name: enumName, constants });
    return { name: prop, type: enumName, annotations };
  }

  // $ref
  if (typeof schema['$ref'] === 'string') {
    return { name: prop, type: refName(schema['$ref'] as string), annotations };
  }

  const type = (schema['type'] as string) ?? (schema['properties'] ? 'object' : undefined);

  // Array
  if (type === 'array') {
    const items = isObject(schema['items']) ? schema['items'] : {};
    const elemType = elementItemType(items, prop, className, schemas, owner);
    return { name: prop, type: `List<${elemType}>`, annotations };
  }

  // Inline object
  if (type === 'object' || isObject(schema['properties'])) {
    const nestedName2 = nestedName(prop, className);
    owner.nested.push(buildClass(nestedName2, schema, schemas));
    return { name: prop, type: nestedName2, annotations };
  }

  const primitive = type ? primitiveType(type, schema['format'] as string | undefined) : null;
  if (primitive) {
    return { name: prop, type: primitive, annotations };
  }

  // Fallback
  return { name: prop, type: 'Object', annotations };
}

function elementItemType(
  items: Schema,
  prop: string,
  className: string,
  schemas: Record<string, unknown>,
  owner: ClassDef,
): string {
  if (typeof items['$ref'] === 'string') return refName(items['$ref'] as string);

  const type = (items['type'] as string) ?? (items['properties'] ? 'object' : undefined);

  if (type === 'array' && isObject(items['items'])) {
    return `List<${elementItemType(items['items'] as Schema, prop, className, schemas, owner)}>`;
  }

  if (type === 'object' || isObject(items['properties'])) {
    const nestedName3 = nestedName(prop, className);
    owner.nested.push(buildClass(nestedName3, items, schemas));
    return nestedName3;
  }

  if (type) {
    const p = primitiveType(type, items['format'] as string | undefined);
    if (p) return p;
  }

  return 'Object';
}

/** Collect the transitive imports a set of classes needs. */
function collectImports(classes: ClassDef[], options: OpenApiOptions): Set<string> {
  const imports = new Set<string>();
  imports.add('com.fasterxml.jackson.annotation.JsonProperty');
  imports.add('com.fasterxml.jackson.annotation.JsonPropertyOrder');

  if (options.includeMode) imports.add('com.fasterxml.jackson.annotation.JsonInclude');
  if (options.useLombok ?? true) {
    imports.add('lombok.AllArgsConstructor');
    imports.add('lombok.Builder');
    imports.add('lombok.Data');
    imports.add('lombok.NoArgsConstructor');
  }

  const visit = (c: ClassDef) => {
    for (const f of c.fields) {
      if (f.type.startsWith('List<')) imports.add('java.util.List');
      // Date/time types are emitted fully-qualified in the field (no import needed).
    }
    for (const n of c.nested) visit(n);
  };
  for (const c of classes) visit(c);
  return imports;
}

function renderClass(c: ClassDef, options: OpenApiOptions, indent: string, nested: boolean): string[] {
  const useLombok = options.useLombok ?? true;
  const jsonIncludeLine = options.includeMode
    ? `@JsonInclude(JsonInclude.Include.${options.includeMode})`
    : null;

  const lines: string[] = [];
  const orderKey = c.fields.map((f) => `\"${f.name}\"`).join(', ');
  lines.push(`${indent}@JsonPropertyOrder({${orderKey}})`);
  if (jsonIncludeLine) lines.push(`${indent}${jsonIncludeLine}`);
  if (useLombok) {
    lines.push(`${indent}@Data`);
    lines.push(`${indent}@NoArgsConstructor`);
    lines.push(`${indent}@AllArgsConstructor`);
    lines.push(`${indent}@Builder`);
  }
  lines.push(`${indent}public ${nested ? 'static ' : ''}class ${c.name} {`);
  lines.push('');

  for (const f of c.fields) {
    for (const ann of f.annotations) lines.push(`${indent}    ${ann}`);
    lines.push(`${indent}    private ${f.type} ${f.name};`);
    lines.push('');
  }

  if (!useLombok) {
    for (const f of c.fields) {
      const cap = f.name.charAt(0).toUpperCase() + f.name.slice(1);
      lines.push(`${indent}    public ${f.type} get${cap}() {`);
      lines.push(`${indent}        return ${f.name};`);
      lines.push(`${indent}    }`);
      lines.push('');
      lines.push(`${indent}    public void set${cap}(${f.type} ${f.name}) {`);
      lines.push(`${indent}        this.${f.name} = ${f.name};`);
      lines.push(`${indent}    }`);
      lines.push('');
    }
  }

  for (const e of c.enums) {
    lines.push(`${indent}    public enum ${e.name} {`);
    lines.push(`${indent}        ${e.constants.join(', ')}`);
    lines.push(`${indent}    }`);
    lines.push('');
  }

  for (const n of c.nested) {
    lines.push(...renderClass(n, options, `${indent}    `, true));
    lines.push('');
  }

  lines.push(`${indent}}`);
  return lines;
}

export interface GeneratedOpenApiClass {
  name: string;
  imports: string[];
  body: string;
}

export function generatePojoClassesFromOpenApi(
  input: string,
  options: OpenApiOptions = {},
): GeneratedOpenApiClass[] {
  let doc: unknown;
  try {
    doc = yamlLoad(input);
  } catch (e) {
    throw new Error('Could not parse OpenAPI spec: ' + (e instanceof Error ? e.message : String(e)));
  }

  if (!isObject(doc)) throw new Error('OpenAPI spec must be an object');
  const components = isObject(doc['components']) ? doc['components'] : null;
  const schemas = components && isObject(components['schemas']) ? components['schemas'] : null;
  if (!schemas || Object.keys(schemas).length === 0) {
    throw new Error('No components.schemas found in the OpenAPI spec');
  }

  const classes: ClassDef[] = [];
  for (const [name, rawSchema] of Object.entries(schemas)) {
    if (!isObject(rawSchema)) continue;
    classes.push(buildClass(name, rawSchema, schemas));
  }

  if (classes.length === 0) throw new Error('No valid schemas to generate');

  return classes.map((c) => ({
    name: c.name,
    imports: [...collectImports([c], options)].sort(),
    body: renderClass(c, options, '', false).join('\n'),
  }));
}

export function generatePojoFromOpenApi(
  input: string,
  options: OpenApiOptions = {},
): string {
  const generated = generatePojoClassesFromOpenApi(input, options);
  const imports = new Set<string>();
  for (const c of generated) {
    for (const i of c.imports) imports.add(i);
  }
  const importLines = [...imports].sort().map((i) => `import ${i};`).join('\n');

  const parts: string[] = [importLines, ''];
  for (const c of generated) {
    parts.push(c.body);
    parts.push('');
  }
  // Trim trailing blank line
  while (parts.length && parts[parts.length - 1] === '') parts.pop();

  return parts.join('\n');
}
