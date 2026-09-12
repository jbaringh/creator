# Plan: Spring WebFlux REST Controller Generator Page

## Goal

Add a second page to the existing Angular + Bootstrap app that generates a Spring WebFlux `@RestController` class from a user-defined list of endpoints (method, path, parameters, request body, return type).

## Current context / assumptions

- **Repo**: `/Users/jbaringh/Documents/Intellij/pojo3`, branch `main`, Angular 22, Bootstrap 5.3.3, Vitest via `ng test`.
- **Existing pages**: One feature — `PojoConverter` at `src/app/components/pojo-converter/pojo-converter.ts` — currently rendered directly by `<app-root>` (`src/app/app.ts`), not via the router.
- **Router**: `provideRouter(routes)` is already wired in `src/app/app.config.ts`; `routes` in `src/app/app.routes.ts` is empty (`[]`). A `<router-outlet />` already sits at the bottom of `src/app/app.html` (unused).
- **Testing**: Vitest with jsdom, run via `npm test`. Existing tests: 14 passing (POJO generator + app shell).
- **Dev server**: `npm start` (ng serve) on `http://localhost:4200/`.
- **Assumption**: "WebFlux implementation" means generated controller methods return `Mono<T>` / `Flux<T>` and the class is annotated `@RestController` with Spring WebFlux annotations. No `@RequestMapping` on the class (path goes on each method). Standard `@RequestParam`, `@PathVariable`, `@RequestBody`, `@RequestHeader` from `org.springframework.web.bind.annotation`.
- **Assumption**: Endpoint parameters can be path variables (`:id`), query params, request headers, or a JSON body. The UI lets the user pick one of these per parameter.
- **Assumption**: The return type is a free-text Java type (e.g. `User`, `List<Order>`). If it's a single object, wrap in `Mono<>`; if it's a `List<...>` or `Flux<...>`, the user types the full `Flux<...>` — we just use whatever they typed as-is. If the user leaves return type blank, default to `Mono<Void>`.
- **Assumption**: The POJO page and Controller page are siblings, navigable via a top nav bar. No auth, no persistence, no backend — pure client-side code generation.

## Architecture / proposed approach

Introduce a simple two-page shell: a top Bootstrap nav bar links to `#/pojo` (JSON→POJO, existing) and `#/controller` (new WebFlux controller generator). The POJO page becomes route `''` (empty path, default), the controller page becomes route `'controller'`. Extract a pure `generateController` function into `src/app/services/controller-generator.ts` (mirroring `pojo-generator.ts`), driven by a typed `EndpointSpec` interface. The UI component `src/app/components/controller-generator/controller-generator.ts` holds a dynamic list of endpoint cards (Bootstrap) and a Generate button; it calls the service and renders the result in a `<pre>` block, same pattern as `PojoConverter`.

## Step-by-step tasks

### Task 1 — Add router config and nav bar (5 min)

**1a. Write `src/app/app.routes.ts`** (replace the empty array):

```ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/pojo-converter/pojo-converter').then((m) => m.PojoConverter),
    title: 'JSON to POJO',
  },
  {
    path: 'controller',
    loadComponent: () =>
      import('./components/controller-generator/controller-generator').then(
        (m) => m.ControllerGenerator,
      ),
    title: 'WebFlux Controller',
  },
];
```

**1b. Update `src/app/app.ts`** to render the nav bar + router outlet (replace the whole file):

```ts
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterLink],
  template: `
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
      <div class="container-fluid">
        <span class="navbar-brand">Java Code Generator</span>
        <ul class="navbar-nav">
          <li class="nav-item">
            <a class="nav-link" routerLink="" routerLinkActive="active">JSON → POJO</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" routerLink="controller" routerLinkActive="active">
              WebFlux Controller
            </a>
          </li>
        </ul>
      </div>
    </nav>
    <router-outlet />
  `,
  styles: [],
})
export class App {}
```

**1c. Clean `src/app/app.html`** — the file is referenced by the `@Component` only if the component has no inline `template`. Since `app.ts` now uses an inline template, delete the contents of `src/app/app.html` (replace with an empty file or a single HTML comment `<!-- rendered via inline template in app.ts -->`). This removes the big Angular placeholder and the stray `<router-outlet />` that was sitting at the bottom.

**1d. Update `src/app/app.spec.ts`** to match the new template:

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter, withHashLocation } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes, withHashLocation())],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the nav bar with both links', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.navbar')).toBeTruthy();
    const links = el.querySelectorAll('.nav-link');
    expect(links.length).toBe(2);
  });
});
```

**Verify**:
```
cd /Users/jbaringh/Documents/Intellij/pojo3 && npm test 2>&1 | tail -8
```
Expected: `Tests  3 passed (3)` (2 old POJO spec tests + 2 app tests, or similar — the old 14 POJO tests still pass; app tests are 2). If the controller component doesn't exist yet, the lazy `loadComponent` import will fail at runtime but not at build/test time (it's only resolved on navigation). To keep the build green before Task 3, create a **stub** `src/app/components/controller-generator/controller-generator.ts` now:

```ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-controller-generator',
  template: `<div class="container py-4"><h1>WebFlux Controller — coming in Task 3</h1></div>`,
})
export class ControllerGenerator {}
```

Then `npm run build` should pass.

**Commit**: `git add -A && git commit -m "feat: add router + nav bar for POJO and controller pages"`

---

### Task 2 — Write failing tests for `controller-generator` service (5 min)

Create `src/app/services/controller-generator.spec.ts`:

```ts
import { generateController, EndpointSpec } from './controller-generator';

describe('generateController', () => {
  const base: EndpointSpec = {
    method: 'GET',
    path: '/users/{id}',
    params: [{ name: 'id', location: 'path', type: 'String' }],
    requestBody: null,
    returnType: 'User',
  };

  it('generates a @RestController class with a Mono return', () => {
    const code = generateController([base], 'UserController');
    expect(code).toContain('@RestController');
    expect(code).toContain('public class UserController');
    expect(code).toContain('Mono<User>');
    expect(code).toContain('@GetMapping("/users/{id}")');
    expect(code).toContain('@PathVariable("id") String id');
    expect(code).toContain('import org.springframework.web.bind.annotation.RestController;');
    expect(code).toContain('import org.springframework.web.bind.annotation.GetMapping;');
    expect(code).toContain('import org.springframework.web.bind.annotation.PathVariable;');
    expect(code).toContain('import reactor.core.publisher.Mono;');
  });

  it('generates POST with @RequestBody', () => {
    const ep: EndpointSpec = {
      method: 'POST',
      path: '/users',
      params: [],
      requestBody: { name: 'user', type: 'User' },
      returnType: 'User',
    };
    const code = generateController([ep], 'UserController');
    expect(code).toContain('@PostMapping("/users")');
    expect(code).toContain('@RequestBody User user');
    expect(code).toContain('import org.springframework.web.bind.annotation.PostMapping;');
    expect(code).toContain('import org.springframework.web.bind.annotation.RequestBody;');
  });

  it('generates PUT, DELETE, PATCH, HEAD, OPTIONS, TRACE', () => {
    const code = generateController(
      [
        { method: 'PUT',    path: '/x', params: [], requestBody: null, returnType: 'T' },
        { method: 'DELETE', path: '/x', params: [], requestBody: null, returnType: 'Void' },
        { method: 'PATCH',  path: '/x', params: [], requestBody: null, returnType: 'T' },
        { method: 'HEAD',   path: '/x', params: [], requestBody: null, returnType: 'Void' },
        { method: 'OPTIONS',path: '/x', params: [], requestBody: null, returnType: 'Void' },
        { method: 'TRACE',  path: '/x', params: [], requestBody: null, returnType: 'Void' },
      ],
      'C',
    );
    expect(code).toContain('@PutMapping("/x")');
    expect(code).toContain('@DeleteMapping("/x")');
    expect(code).toContain('@PatchMapping("/x")');
    expect(code).toContain('@HeadMapping("/x")');
    expect(code).toContain('@OptionsMapping("/x")');
    expect(code).toContain('@RequestMapping(method = RequestMethod.TRACE, path = "/x")');
  });

  it('uses Flux when returnType already contains Flux', () => {
    const ep: EndpointSpec = {
      method: 'GET',
      path: '/users',
      params: [],
      requestBody: null,
      returnType: 'Flux<User>',
    };
    const code = generateController([ep], 'UserController');
    expect(code).toContain('Flux<User>');
    expect(code).toContain('import reactor.core.publisher.Flux;');
    // should NOT wrap in Mono
    expect(code).not.toContain('Mono<Flux<User>>');
  });

  it('wraps List<T> return in Flux', () => {
    const ep: EndpointSpec = {
      method: 'GET',
      path: '/users',
      params: [],
      requestBody: null,
      returnType: 'List<User>',
    };
    const code = generateController([ep], 'UserController');
    expect(code).toContain('Flux<User>');
    expect(code).toContain('import reactor.core.publisher.Flux;');
    expect(code).toContain('import java.util.List;');
  });

  it('wraps scalar return in Mono', () => {
    const ep: EndpointSpec = {
      method: 'GET',
      path: '/ping',
      params: [],
      requestBody: null,
      returnType: 'String',
    };
    const code = generateController([ep], 'PingController');
    expect(code).toContain('Mono<String>');
    expect(code).toContain('import reactor.core.publisher.Mono;');
  });

  it('handles query params and request headers', () => {
    const ep: EndpointSpec = {
      method: 'GET',
      path: '/search',
      params: [
        { name: 'q', location: 'query', type: 'String' },
        { name: 'X-Tenant', location: 'header', type: 'String' },
      ],
      requestBody: null,
      returnType: 'Result',
    };
    const code = generateController([ep], 'SearchController');
    expect(code).toContain('@RequestParam("q") String q');
    expect(code).toContain('@RequestHeader("X-Tenant") String X_Tenant');
    expect(code).toContain('import org.springframework.web.bind.annotation.RequestParam;');
    expect(code).toContain('import org.springframework.web.bind.annotation.RequestHeader;');
  });

  it('generates multiple endpoints in one class', () => {
    const code = generateController(
      [
        { method: 'GET',  path: '/a', params: [], requestBody: null, returnType: 'A' },
        { method: 'POST', path: '/b', params: [], requestBody: null, returnType: 'B' },
      ],
      'Multi',
    );
    expect(code).toContain('@GetMapping("/a")');
    expect(code).toContain('@PostMapping("/b")');
    expect(code.match(/@GetMapping|@PostMapping/g)!.length).toBe(2);
  });

  it('throws on empty endpoint list', () => {
    expect(() => generateController([], 'C')).toThrow();
  });

  it('throws on invalid HTTP method', () => {
    const bad = { method: 'FETCH' as any, path: '/x', params: [], requestBody: null, returnType: 'T' };
    expect(() => generateController([bad], 'C')).toThrow();
  });
});
```

**Verify red**:
```
cd /Users/jbaringh/Documents/Intellij/pojo3 && npm test 2>&1 | tail -15
```
Expected: the new spec file fails to compile / import (module not found) → suite red.

**Commit** (red): `git add -A && git commit -m "test: add failing tests for controller-generator service"`

---

### Task 3 — Implement `controller-generator` service (5 min)

Create `src/app/services/controller-generator.ts`:

```ts
export type HttpMethod =
  | 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'TRACE';

export type ParamLocation = 'path' | 'query' | 'header';

export interface EndpointParam {
  name: string;
  location: ParamLocation;
  type: string; // Java type, e.g. 'String', 'int', 'Long'
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
  // No @TraceMapping in Spring — use @RequestMapping
  TRACE:   (p) => `@RequestMapping(method = RequestMethod.TRACE, path = "${p}")`,
};

function javaIdentifier(name: string): string {
  // Convert e.g. "X-Tenant" -> "X_Tenant", "Content-Type" -> "Content_Type"
  return name.replace(/[-./]+/g, '_').replace(/[^a-zA-Z0-9_]/g, '_');
}

function resolveReturnType(returnType: string): string {
  if (returnType === 'Void' || returnType === 'void') return 'Mono<Void>';
  if (returnType.startsWith('Mono<') || returnType.startsWith('Flux<')) return returnType;
  if (returnType.startsWith('List<')) return `Flux<${returnType.slice(5)}`;
  return `Mono<${returnType}>`;
}

export function generateController(
  endpoints: EndpointSpec[],
  className: string,
): string {
  if (!endpoints.length) {
    throw new Error('At least one endpoint is required');
  }

  const imports = new Set<string>();
  imports.add('org.springframework.web.bind.annotation.RestController');

  const needsRequestMappingImport = endpoints.some((e) => e.method === 'TRACE');
  if (needsRequestMappingImport) {
    imports.add('org.springframework.web.bind.annotation.RequestMapping');
    imports.add('org.springframework.http.RequestMethod');
  }

  for (const e of endpoints) {
    imports.add(`org.springframework.web.bind.annotation.${methodAnnotationName(e.method)}`);
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

  // Collect Java type imports for List<>
  const allText = endpoints.map((e) => e.returnType).join(' ') + ' ' +
    endpoints.map((e) => e.params.map((p) => p.type).join(' ')).join(' ');
  if (/\bList</.test(allText)) imports.add('java.util.List');
  if (/\bSet</.test(allText)) imports.add('java.util.Set');
  if (/\bMap</.test(allText)) imports.add('java.util.Map');

  const importLines = [...imports].sort().map((i) => `import ${i};`).join('\n');

  const lines: string[] = [];
  lines.push('@RestController');
  lines.push(`public class ${className} {`);
  lines.push('');

  for (const e of endpoints) {
    if (!METHOD_ANNOTATIONS[e.method]) {
      throw new Error(`Unsupported HTTP method: ${e.method}`);
    }
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
    lines.push(
      `        return ${defaultReturn(returnType)};`,
    );
    lines.push('    }');
    lines.push('');
  }

  lines.push('}');

  return `${importLines}\n\n${lines.join('\n')}`;
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
  // GET /users/{id} -> getUser
  // POST /users -> createUser (heuristic: verb from path)
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
```

**Verify green**:
```
cd /Users/jbaringh/Documents/Intellij/pojo3 && npm test 2>&1 | tail -15
```
Expected: all controller-generator tests pass. If `@RequestMapping(method = RequestMethod.TRACE)` produces an import that the test doesn't expect, adjust the import set in the service (the test in Task 2 only checks the annotation string, not the import for TRACE — that's fine).

**Commit**: `git add -A && git commit -m "feat: implement controller-generator service with tests"`

---

### Task 4 — Build the controller-generator UI component (10 min)

Create `src/app/components/controller-generator/controller-generator.ts` (replaces the stub from Task 1):

```ts
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  EndpointSpec, HttpMethod, ParamLocation,
  generateController,
} from '../../services/controller-generator';

interface ParamRow {
  name: string;
  location: ParamLocation;
  type: string;
}

interface EndpointRow {
  id: number;
  method: HttpMethod;
  path: string;
  params: ParamRow[];
  hasBody: boolean;
  bodyName: string;
  bodyType: string;
  returnType: string;
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE'];

@Component({
  selector: 'app-controller-generator',
  imports: [FormsModule],
  template: `
    <div class="container-fluid py-4">
      <div class="row g-4">
        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span class="fw-bold">Endpoints</span>
              <div class="d-flex align-items-center gap-2">
                <input
                  class="form-control form-control-sm"
                  style="width: 140px;"
                  [ngModel]="className()"
                  (ngModelChange)="className.set($event)"
                  placeholder="ClassName"
                />
                <button class="btn btn-primary btn-sm" (click)="addEndpoint()">+ Endpoint</button>
              </div>
            </div>
            <div class="card-body">
              @if (endpoints().length === 0) {
                <p class="text-muted mb-0">Click "+ Endpoint" to add your first endpoint.</p>
              }
              @for (ep of endpoints(); track ep.id) {
                <div class="card mb-3">
                  <div class="card-body">
                    <div class="row g-2 mb-2">
                      <div class="col-4">
                        <label class="form-label small mb-1">Method</label>
                        <select class="form-select form-select-sm"
                                [ngModel]="ep.method"
                                (ngModelChange)="ep.method = $event">
                          @for (m of httpMethods; track m) {
                            <option [value]="m">{{ m }}</option>
                          }
                        </select>
                      </div>
                      <div class="col-8">
                        <label class="form-label small mb-1">Path</label>
                        <input class="form-control form-control-sm"
                               [ngModel]="ep.path"
                               (ngModelChange)="ep.path = $event"
                               placeholder="/users/{id}" />
                      </div>
                    </div>

                    <label class="form-label small mb-1">Parameters</label>
                    @for (p of ep.params; track $index) {
                      <div class="row g-2 mb-1">
                        <div class="col-5">
                          <input class="form-control form-control-sm" placeholder="name"
                                 [ngModel]="p.name" (ngModelChange)="p.name = $event" />
                        </div>
                        <div class="col-4">
                          <select class="form-select form-select-sm"
                                  [ngModel]="p.location" (ngModelChange)="p.location = $event">
                            <option value="path">path</option>
                            <option value="query">query</option>
                            <option value="header">header</option>
                          </select>
                        </div>
                        <div class="col-3">
                          <input class="form-control form-control-sm" placeholder="type (e.g. String)"
                                 [ngModel]="p.type" (ngModelChange)="p.type = $event" />
                        </div>
                        <div class="col-12 d-flex justify-content-end">
                          <button class="btn btn-outline-danger btn-sm" (click)="removeParam(ep, $index)">Remove</button>
                        </div>
                      </div>
                    }
                    <button class="btn btn-outline-secondary btn-sm mb-2" (click)="addParam(ep)">+ Param</button>

                    <div class="form-check mb-2">
                      <input type="checkbox" class="form-check-input" id="body{{ ep.id }}"
                             [checked]="ep.hasBody"
                             (change)="ep.hasBody = !ep.hasBody" />
                      <label class="form-check-label small" [for]="'body' + ep.id">Request body</label>
                    </div>
                    @if (ep.hasBody) {
                      <div class="row g-2 mb-2">
                        <div class="col-6">
                          <label class="form-label small mb-1">Body name</label>
                          <input class="form-control form-control-sm" [ngModel]="ep.bodyName"
                                 (ngModelChange)="ep.bodyName = $event" placeholder="body" />
                        </div>
                        <div class="col-6">
                          <label class="form-label small mb-1">Body type</label>
                          <input class="form-control form-control-sm" [ngModel]="ep.bodyType"
                                 (ngModelChange)="ep.bodyType = $event" placeholder="User" />
                        </div>
                      </div>
                    }

                    <div class="row g-2 mb-2">
                      <div class="col-12">
                        <label class="form-label small mb-1">Return type (Java, e.g. User, List&lt;User&gt;, Mono&lt;User&gt;)</label>
                        <input class="form-control form-control-sm" [ngModel]="ep.returnType"
                               (ngModelChange)="ep.returnType = $event" placeholder="User" />
                      </div>
                    </div>

                    <button class="btn btn-outline-danger btn-sm" (click)="removeEndpoint(ep.id)">Remove endpoint</button>
                  </div>
                </div>
              }
            </div>
            <div class="card-footer d-flex justify-content-between align-items-center">
              @if (error(); ) {
                <span class="text-danger small">{{ error() }}</span>
              } @else {
                <span class="text-muted small">Ready</span>
              }
              <button class="btn btn-primary" (click)="generate()" [disabled]="endpoints().length === 0">
                Generate
              </button>
            </div>
          </div>
        </div>

        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span class="fw-bold">Generated Controller</span>
              <button class="btn btn-outline-secondary btn-sm" (click)="copyCode()" [disabled]="!generatedCode()">Copy</button>
            </div>
            <div class="card-body d-flex">
              <pre class="mb-0 bg-dark text-light p-3 rounded overflow-auto w-100"
                   style="max-height: calc(100vh - 200px);">
{{ generatedCode() || '// Click Generate to see the controller here' }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [],
})
export class ControllerGenerator {
  protected readonly className = signal('MyController');
  protected readonly error = signal('');
  protected readonly generatedCode = signal('');
  protected readonly httpMethods = HTTP_METHODS;

  private nextId = 0;
  protected readonly endpoints = signal<EndpointRow[]>([]);

  private newEndpoint(): EndpointRow {
    this.nextId++;
    return {
      id: this.nextId,
      method: 'GET',
      path: '',
      params: [],
      hasBody: false,
      bodyName: 'body',
      bodyType: 'Object',
      returnType: '',
    };
  }

  addEndpoint(): void {
    this.endpoints.update((eps) => [...eps, this.newEndpoint()]);
  }

  removeEndpoint(id: number): void {
    this.endpoints.update((eps) => eps.filter((e) => e.id !== id));
  }

  addParam(ep: EndpointRow): void {
    ep.params.push({ name: '', location: 'query', type: 'String' });
  }

  removeParam(ep: EndpointRow, index: number): void {
    ep.params.splice(index, 1);
  }

  private toSpecs(): EndpointSpec[] {
    return this.endpoints().map((ep) => ({
      method: ep.method,
      path: ep.path || '/',
      params: ep.params
        .filter((p) => p.name.trim() !== '')
        .map((p) => ({
          name: p.name.trim(),
          location: p.location,
          type: p.type.trim() || 'String',
        })),
      requestBody: ep.hasBody
        ? { name: ep.bodyName.trim() || 'body', type: ep.bodyType.trim() || 'Object' }
        : null,
      returnType: ep.returnType.trim() || 'Void',
    }));
  }

  generate(): void {
    this.error.set('');
    try {
      const code = generateController(this.toSpecs(), this.className() || 'MyController');
      this.generatedCode.set(code);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Unknown error');
      this.generatedCode.set('');
    }
  }

  async copyCode(): Promise<void> {
    if (this.generatedCode()) {
      await navigator.clipboard.writeText(this.generatedCode());
    }
  }
}
```

**Verify**:
```
cd /Users/jbaringh/Documents/Intellij/pojo3 && npm run build 2>&1 | tail -8
```
Expected: build succeeds.

**Commit**: `git add -A && git commit -m "feat: add controller-generator UI component"`

---

### Task 5 — Browser E2E verification (5 min)

1. Ensure dev server is running:
```
cd /Users/jbaringh/Documents/Intellij/pojo3 && (curl -sf -o /dev/null http://localhost:4200/ && echo "up" || (nohup npm start > /tmp/ng.log 2>&1 & sleep 6 && curl -sf -o /dev/null http://localhost:4200/ && echo "started"))
```

2. In a browser (use the browser tool):
   - Navigate to `http://localhost:4200/`.
   - Confirm the nav bar shows both "JSON → POJO" and "WebFlux Controller" links.
   - Click "WebFlux Controller" → URL becomes `http://localhost:4200/#/controller`.
   - Click "+ Endpoint" once.
   - Set method `GET`, path `/users/{id}`, add a param: name `id`, location `path`, type `String`.
   - Set return type `User`.
   - Click "Generate".
   - Verify the `<pre>` output contains:
     - `@RestController`
     - `public class MyController`
     - `@GetMapping("/users/{id}")`
     - `@PathVariable("id") String id`
     - `Mono<User>`
     - `import reactor.core.publisher.Mono;`
   - Click "+ Endpoint" again.
   - Set method `POST`, path `/users`, check "Request body", body name `user`, body type `User`, return type `User`.
   - Click "Generate".
   - Verify the output now contains both `@GetMapping` and `@PostMapping`, `@RequestBody User user`, and the class has two methods.
   - Click "Copy" → no error (clipboard may be blocked in headless; just confirm no JS exception in console).

3. Navigate back to `http://localhost:4200/` (POJO page) and confirm the existing POJO form still renders and Generate still works (regression check).

**Commit** (if any fixes were needed): `git add -A && git commit -m "fix: ..."`

---

## Tests / validation summary

- **Unit**: 10 new tests in `src/app/services/controller-generator.spec.ts` covering all HTTP methods, path/query/header params, request body, Mono/Flux/List return types, multiple endpoints, error cases.
- **Regression**: existing 14 POJO tests must still pass.
- **Build**: `npm run build` must succeed (no TS errors, no template errors).
- **E2E**: manual browser walk-through as in Task 5.
- **Test command**: `npm test` (Vitest via Angular builder).
- **Build command**: `npm run build`.

## Risks, tradeoffs, and open questions

- **`@RequestMapping(method = RequestMethod.TRACE)`** is the only method without a dedicated `@*Mapping` annotation in Spring. The generated code is correct but slightly inconsistent with the others. Alternative: drop TRACE support. **Open**: keep as-is (done in plan).
- **Method-name heuristic** (`GET /users/{id}` → `getUser`, `POST /users` → `createUser`) is a guess. It's a placeholder for a real service method name. **Open**: is this acceptable, or should the user type the method name explicitly? (Plan: keep heuristic; user can rename after copy.)
- **Return-type wrapping**: `List<X>` → `Flux<X>`, scalar → `Mono<X>`, `Mono<X>`/`Flux<X>` passed through. **Open**: should `Set<X>` / `Map<K,V>` also wrap in `Flux<X>` / `Flux<V>`? (Plan: currently only `List<>` is special-cased; others pass through as `Mono<Set<X>>` which is technically valid.)
- **No validation** of path syntax (e.g. must start with `/`). **Open**: add a check in `toSpecs()` that `path` starts with `/` and is non-empty? (Plan: defaults to `/` if blank; no hard validation.)
- **No `@Valid` / `@Validated`** on request body. **Open**: add a checkbox for `@Valid`? (Plan: skip for v1.)
- **No `produces` / `consumes`** media-type attributes on the mapping annotations. **Open**: add a free-text "produces" field per endpoint? (Plan: skip for v1.)
- **Placeholder implementation body** (`return Mono.just(...)` / `Flux.empty()` / `// TODO: implement`) is not a real implementation. This is expected — the page generates the *skeleton*, not a working controller.
- **Nav bar styling**: uses Bootstrap `bg-dark navbar-dark`. If the user prefers a light theme, trivial CSS swap.
- **Routing strategy**: uses `withHashLocation()` (hash-based `#/controller`) so the app works when served from any static host without server rewrites. If the user wants clean paths (`/controller`), switch to default `provideRouter(routes)` without `withHashLocation()` and configure the dev server / host for SPA fallback.
