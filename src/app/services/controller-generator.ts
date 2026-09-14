export type HttpMethod =
  | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'TRACE';

export type ParamLocation = 'path' | 'query' | 'header';

export interface EndpointParam {
  name: string;
  location: ParamLocation;
  type: string;
}

export interface RequestBodySpec {
  name: string;
  type: string;
}

export interface EndpointSpec {
  method: HttpMethod;
  path: string;
  params: EndpointParam[];
  requestBody: RequestBodySpec | null;
  returnType: string;
}

const METHOD_ANNOTATIONS: Record<HttpMethod, (path: string) => string> = {
  GET:     (p) => `@GetMapping("${p}")`,
  POST:    (p) => `@PostMapping("${p}")`,
  PUT:     (p) => `@PutMapping("${p}")`,
  DELETE:  (p) => `@DeleteMapping("${p}")`,
  PATCH:   (p) => `@PatchMapping("${p}")`,
  HEAD:    (p) => `@HeadMapping("${p}")`,
  OPTIONS: (p) => `@OptionsMapping("${p}")`,
  TRACE:   (p) => `@RequestMapping(method = RequestMethod.TRACE, path = "${p}")`,
};

function javaIdentifier(name: string): string {
  return name.replace(/[-./]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
}

function resolveReturnType(returnType: string): string {
  if (returnType === 'Void' || returnType === 'void') return 'Mono<Void>';
  if (returnType.startsWith('Mono<') || returnType.startsWith('Flux<')) return returnType;
  if (returnType.startsWith('List<')) return `Flux<${returnType.slice(5)}`;
  return `Mono<${returnType}>`;
}

function methodAnnotationName(m: HttpMethod): string {
  switch (m) {
    case 'GET': return 'GetMapping';
    case 'POST': return 'PostMapping';
    case 'PUT': return 'PutMapping';
    case 'DELETE': return 'DeleteMapping';
    case 'PATCH': return 'PatchMapping';
    case 'HEAD': return 'HeadMapping';
    case 'OPTIONS': return 'OptionsMapping';
    case 'TRACE': return 'RequestMapping';
  }
}

function methodName(e: EndpointSpec): string {
  const parts = e.path.split('/').filter(Boolean);
  const last = parts[parts.length - 1] ?? 'resource';
  const clean = last.replace(/{(.*)}/, '$1');
  const verb =
    e.method === 'GET' ? 'get' :
    e.method === 'POST' ? 'create' :
    e.method === 'PUT' ? 'update' :
    e.method === 'DELETE' ? 'delete' :
    e.method === 'PATCH' ? 'patch' :
    e.method === 'HEAD' ? 'head' :
    e.method === 'OPTIONS' ? 'options' :
    'trace';
  const cap = clean.charAt(0).toUpperCase() + clean.slice(1);
  return `${verb}${cap}`;
}

function defaultReturn(returnType: string): string {
  if (returnType.startsWith('Mono<')) {
    const inner = returnType.slice(5, -1);
    if (inner === 'Void' || inner === 'void') return 'Mono.empty()';
    return `Mono.just(${defaultJavaValue(inner)})`;
  }
  if (returnType.startsWith('Flux<')) {
    return 'Flux.empty()';
  }
  return 'null';
}

function defaultJavaValue(javaType: string): string {
  if (javaType === 'String') return '"placeholder"';
  if (javaType === 'int' || javaType === 'Integer') return '0';
  if (javaType === 'long' || javaType === 'Long') return '0L';
  if (javaType === 'double' || javaType === 'Double') return '0.0';
  if (javaType === 'boolean' || javaType === 'Boolean') return 'false';
  return 'null';
}

export function generateController(
  endpoints: EndpointSpec[],
  className: string,
  basePath?: string,
): string {
  if (!endpoints.length) {
    throw new Error('At least one endpoint is required');
  }

  const imports = new Set<string>();
  imports.add('org.springframework.web.bind.annotation.RestController');

  const normalizedBase = (basePath ?? '').trim().replace(/\/+$/, '');
  if (normalizedBase) {
    imports.add('org.springframework.web.bind.annotation.RequestMapping');
  }

  for (const e of endpoints) {
    if (!METHOD_ANNOTATIONS[e.method]) {
      throw new Error(`Unsupported HTTP method: ${e.method}`);
    }
    imports.add(`org.springframework.web.bind.annotation.${methodAnnotationName(e.method)}`);
    if (e.method === 'TRACE') {
      imports.add('org.springframework.http.RequestMethod');
    }
    for (const p of e.params) {
      if (p.location === 'path') imports.add('org.springframework.web.bind.annotation.PathVariable');
      if (p.location === 'query') imports.add('org.springframework.web.bind.annotation.RequestParam');
      if (p.location === 'header') imports.add('org.springframework.web.bind.annotation.RequestHeader');
    }
    if (e.requestBody) imports.add('org.springframework.web.bind.annotation.RequestBody');
  }

  const returnTypes = new Set(endpoints.map((e) => resolveReturnType(e.returnType)));
  for (const rt of returnTypes) {
    if (rt.startsWith('Mono<')) imports.add('reactor.core.publisher.Mono');
    if (rt.startsWith('Flux<')) imports.add('reactor.core.publisher.Flux');
  }

  const allText =
    endpoints.map((e) => e.returnType).join(' ') + ' ' +
    endpoints.map((e) => e.params.map((p) => p.type).join(' ')).join(' ') + ' ' +
    endpoints.map((e) => (e.requestBody ? e.requestBody.type : '')).join(' ');

  if (/\bList</.test(allText)) imports.add('java.util.List');
  if (/\bSet</.test(allText)) imports.add('java.util.Set');
  if (/\bMap</.test(allText)) imports.add('java.util.Map');

  const importLines = [...imports].sort().map((i) => `import ${i};`).join('\n');

  const lines: string[] = [];
  lines.push('@RestController');
  if (normalizedBase) {
    lines.push(`@RequestMapping("${normalizedBase}")`);
  }
  lines.push(`public class ${className} {`);
  lines.push('');

  for (const e of endpoints) {
    const ann = METHOD_ANNOTATIONS[e.method](e.path);
    const returnType = resolveReturnType(e.returnType);
    const params: string[] = [];
    for (const p of e.params) {
      const ident = javaIdentifier(p.name);
      if (p.location === 'path') params.push(`@PathVariable("${p.name}") ${p.type} ${ident}`);
      if (p.location === 'query') params.push(`@RequestParam("${p.name}") ${p.type} ${ident}`);
      if (p.location === 'header') params.push(`@RequestHeader("${p.name}") ${p.type} ${ident}`);
    }
    if (e.requestBody) {
      params.push(`@RequestBody ${e.requestBody.type} ${e.requestBody.name}`);
    }

    lines.push(`    ${ann}`);
    lines.push(`    public ${returnType} ${methodName(e)}(${params.join(', ')}) {`);
    lines.push('        // TODO: implement');
    lines.push(`        return ${defaultReturn(returnType)};`);
    lines.push('    }');
    lines.push('');
  }

  lines.push('}');

  return `${importLines}\n\n${lines.join('\n')}`;
}
