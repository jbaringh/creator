import { load as yamlLoad } from 'js-yaml';

type Schema = Record<string, unknown>;
type Doc = Record<string, unknown>;

const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options'] as const;
type HttpVerb = (typeof HTTP_METHODS)[number];

const METHOD_ANNOTATION: Record<HttpVerb, string> = {
  get: 'GetMapping',
  post: 'PostMapping',
  put: 'PutMapping',
  delete: 'DeleteMapping',
  patch: 'PatchMapping',
  head: 'HeadMapping',
  options: 'OptionsMapping',
};

const VERB_PREFIX: Record<HttpVerb, string> = {
  get: 'get',
  post: 'create',
  put: 'update',
  delete: 'delete',
  patch: 'patch',
  head: 'head',
  options: 'options',
};

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function refName(ref: string): string {
  const parts = ref.split('/');
  return parts[parts.length - 1];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Map an OpenAPI schema to a Java type. Falls back to String. */
function javaTypeFor(schema: Schema | null | undefined): string {
  if (!schema) return 'String';
  if (typeof schema['$ref'] === 'string') return refName(schema['$ref'] as string);
  const type = schema['type'] as string | undefined;
  if (!type) return 'String';
  switch (type) {
    case 'integer':
      return schema['format'] === 'int64' ? 'long' : 'int';
    case 'number':
      return 'double';
    case 'boolean':
      return 'boolean';
    case 'string':
      if (schema['format'] === 'date-time') return 'java.time.OffsetDateTime';
      if (schema['format'] === 'date') return 'java.time.LocalDate';
      return 'String';
    default:
      return 'String';
  }
}

interface Operation {
  verb: HttpVerb;
  path: string;
  pathParams: { name: string; type: string }[];
  queryParams: { name: string; type: string }[];
  headerParams: { name: string; type: string }[];
  requestBody: { name: string; type: string } | null;
  returnType: string; // e.g. Mono<Pet>, Flux<Pet>, Mono<Void>
}

function collectParams(op: Schema): {
  pathParams: { name: string; type: string }[];
  queryParams: { name: string; type: string }[];
  headerParams: { name: string; type: string }[];
} {
  const pathParams: { name: string; type: string }[] = [];
  const queryParams: { name: string; type: string }[] = [];
  const headerParams: { name: string; type: string }[] = [];
  const params = Array.isArray(op['parameters']) ? (op['parameters'] as Schema[]) : [];
  for (const p of params) {
    if (!isObject(p) || typeof p['name'] !== 'string') continue;
    const name = p['name'];
    const type = javaTypeFor(p['schema'] as Schema);
    const loc = p['in'];
    if (loc === 'path') pathParams.push({ name, type });
    else if (loc === 'query') queryParams.push({ name, type });
    else if (loc === 'header') headerParams.push({ name, type });
  }
  return { pathParams, queryParams, headerParams };
}

function requestBodyOf(op: Schema): { name: string; type: string } | null {
  const rb = op['requestBody'];
  if (!isObject(rb)) return null;
  const content = (rb as Schema)['content'];
  if (!isObject(content)) return null;
  // First media type that has a schema.
  for (const media of Object.values(content)) {
    if (!isObject(media)) continue;
    const schema = (media as Schema)['schema'];
    if (!isObject(schema)) continue;
    if (typeof schema['$ref'] === 'string') {
      const type = refName(schema['$ref'] as string);
      return { name: lowerFirst(type), type };
    }
    return { name: 'body', type: javaTypeFor(schema) };
  }
  return null;
}

function responseTypeOf(op: Schema): string {
  const responses = op['responses'];
  if (!isObject(responses)) return 'Mono<Void>';
  // Pick the first 2xx response.
  let resp: Schema | null = null;
  for (const status of Object.keys(responses).sort()) {
    if (status.startsWith('2')) {
      resp = (responses as Record<string, unknown>)[status] as Schema;
      break;
    }
  }
  if (!resp || !isObject(resp)) return 'Mono<Void>';
  const content = resp['content'];
  if (!isObject(content)) return 'Mono<Void>';
  for (const media of Object.values(content)) {
    if (!isObject(media)) continue;
    const schema = (media as Schema)['schema'];
    if (!isObject(schema)) continue;
    if (schema['type'] === 'array' && isObject(schema['items'])) {
      const items = schema['items'] as Schema;
      const inner = typeof items['$ref'] === 'string' ? refName(items['$ref'] as string) : javaTypeFor(items);
      return `Flux<${inner}>`;
    }
    if (typeof schema['$ref'] === 'string') return `Mono<${refName(schema['$ref'] as string)}>`;
    const t = javaTypeFor(schema);
    return `Mono<${t}>`;
  }
  return 'Mono<Void>';
}

function methodName(verb: HttpVerb, path: string): string {
  const parts = path.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? 'resource';
  const clean = last.replace(/{(.*)}/, '$1');
  return `${VERB_PREFIX[verb]}${capitalize(clean)}`;
}

function defaultReturn(returnType: string): string {
  if (returnType === 'Mono<Void>') return 'Mono.empty()';
  if (returnType.startsWith('Mono<')) return 'Mono.just(null)';
  if (returnType.startsWith('Flux<')) return 'Flux.empty()';
  return 'null';
}

function classNameFromTitle(title: unknown): string {
  const base = String(title ?? 'Api').replace(/[^a-zA-Z0-9]/g, '');
  const cap = capitalize(base || 'Api');
  return cap;
}

export function generateControllerFromOpenApi(
  input: unknown,
  className?: string,
): string {
  let doc: Doc;
  if (typeof input === 'string') {
    doc = yamlLoad(input) as Doc;
  } else {
    doc = input as Doc;
  }

  if (!isObject(doc)) throw new Error('OpenAPI document must be an object');
  const paths = doc['paths'];
  if (!isObject(paths)) throw new Error('No paths found in the OpenAPI document');

  const operations: Operation[] = [];
  for (const [path, item] of Object.entries(paths)) {
    if (!isObject(item)) continue;
    for (const verb of HTTP_METHODS) {
      const op = (item as Record<string, unknown>)[verb];
      if (!isObject(op)) continue;
      const { pathParams, queryParams, headerParams } = collectParams(op as Schema);
      operations.push({
        verb,
        path,
        pathParams,
        queryParams,
        headerParams,
        requestBody: requestBodyOf(op as Schema),
        returnType: responseTypeOf(op as Schema),
      });
    }
  }

  if (operations.length === 0) {
    throw new Error('No operations found in the OpenAPI document paths');
  }

  const imports = new Set<string>();
  imports.add('org.springframework.web.bind.annotation.RestController');
  for (const o of operations) {
    imports.add(`org.springframework.web.bind.annotation.${METHOD_ANNOTATION[o.verb]}`);
    if (o.pathParams.length) imports.add('org.springframework.web.bind.annotation.PathVariable');
    if (o.queryParams.length) imports.add('org.springframework.web.bind.annotation.RequestParam');
    if (o.headerParams.length) imports.add('org.springframework.web.bind.annotation.RequestHeader');
    if (o.requestBody) imports.add('org.springframework.web.bind.annotation.RequestBody');
    if (o.returnType.startsWith('Mono<')) imports.add('reactor.core.publisher.Mono');
    if (o.returnType.startsWith('Flux<')) imports.add('reactor.core.publisher.Flux');
  }
  // java.time types emitted fully-qualified in the field/param; no import needed.

  const importLines = [...imports].sort().map((i) => `import ${i};`).join('\n');
  const cn = className && className.trim() ? className.trim() : classNameFromTitle(doc['info'] && isObject(doc['info']) ? (doc['info'] as Schema)['title'] : undefined);

  const lines: string[] = [];
  lines.push('@RestController');
  lines.push(`public class ${cn} {`);
  lines.push('');

  const usedNames = new Set<string>();
  for (const o of operations) {
    const base = methodName(o.verb, o.path);
    let name = base;
    let n = 1;
    while (usedNames.has(name)) {
      n++;
      name = `${base}${n}`;
    }
    usedNames.add(name);

    const params: string[] = [];
    for (const p of o.pathParams) params.push(`@PathVariable("${p.name}") ${p.type} ${p.name}`);
    for (const p of o.queryParams) params.push(`@RequestParam("${p.name}") ${p.type} ${p.name}`);
    for (const p of o.headerParams) params.push(`@RequestHeader("${p.name}") ${p.type} ${p.name}`);
    if (o.requestBody) params.push(`@RequestBody ${o.requestBody.type} ${o.requestBody.name}`);

    lines.push(`    @${METHOD_ANNOTATION[o.verb]}("${o.path}")`);
    lines.push(`    public ${o.returnType} ${name}(${params.join(', ')}) {`);
    lines.push('        // TODO: implement');
    lines.push(`        return ${defaultReturn(o.returnType)};`);
    lines.push('    }');
    lines.push('');
  }

  lines.push('}');

  return `${importLines}\n\n${lines.join('\n')}`;
}
