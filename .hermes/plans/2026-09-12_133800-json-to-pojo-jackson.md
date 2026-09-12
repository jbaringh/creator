# Plan: JSON → POJO with Jackson Annotations (Angular + Bootstrap)

## Goal

Build a single-page Angular app where a user pastes a JSON object, and the app renders a Java POJO class with every field annotated using the correct Jackson annotations (`@JsonProperty`, `@JsonIgnore`, `@JsonFormat`, `@JsonInclude`, `@JsonPropertyOrder`), plus inferred Java types.

## Current context / assumptions

- **Stack**: Angular 22 (standalone components, signal-based), Bootstrap 5 via `bootstrap` npm package (imported in `styles.css`), Vitest + jsdom for tests.
- **No backend**: This is a pure client-side tool. "Jackson annotations" are rendered as Java source code — we do NOT call a JVM. We *simulate* what Jackson would annotate.
- **Input model** (assumed from the user's description):
  - User pastes a **JSON object** into a textarea.
  - The app parses it, walks each key, and generates a Java `public class` with:
    - A Java type inferred from the JSON value (`string` → `String`, `number` → `int`/`double`/`long`, `boolean` → `boolean`, `array` → `List<T>`, `object` → nested class, `null` → `Object`).
    - `@JsonProperty("original_key")` on every field (so the mapping is explicit and round-trips correctly).
    - `@JsonIgnore` on fields that are `null` in the sample (optional toggle).
    - `@JsonFormat` for dates detected via ISO-8601 strings.
    - `@JsonPropertyOrder` at class level listing all keys in original order.
    - Getters and setters for every field.
    - `toString()`, `equals()`, `hashCode()` (optional, toggle).
  - The generated Java code is shown in a read-only `<pre>` with syntax highlighting (simple regex-based highlighter, no external lib needed for v1).
- **Bootstrap** is used for layout (cards, buttons, form controls, grid) — NOT for the code display.
- **Single page, no routing** needed for v1 (routes file stays empty).

## Architecture / proposed approach

One feature area, three files:

1. **`src/app/services/pojo-generator.ts`** — pure TypeScript, no Angular imports. Takes a parsed JSON object (or the raw string) and returns a `string` of Java source code. This is the only file with real logic; it is trivially unit-testable.
2. **`src/app/components/pojo-converter/pojo-converter.ts`** — standalone Angular component. Holds two signals: `jsonInput` (string) and `generatedCode` (string). On input change (debounced or on button click), calls `generatePojo()` and stores the result.
3. **`src/app/components/pojo-converter/pojo-converter.html`** — Bootstrap layout: left card = textarea, right card = `<pre>` with generated code, "Copy to clipboard" button.

`app.ts` renders `<app-pojo-converter />`. The existing placeholder template is replaced.

## Step-by-step tasks

### Task 0 — Bootstrap setup (5 min)

**Why**: `bootstrap` is not in `package.json` yet.

1. Install Bootstrap:
   ```bash
   npm install bootstrap@5.3.3
   ```
2. Import it in `src/styles.css` (prepend these two lines):
   ```css
   @import 'bootstrap/dist/css/bootstrap.min.css';
   @import 'bootstrap/dist/css/bootstrap-icons.min.css';
   ```
3. Verify the build still passes:
   ```bash
   npm run build 2>&1 | tail -5
   ```
   Expected: `✔ Browser application bundle generation complete.`

Commit: `git add -A && git commit -m "chore: add bootstrap 5"`

---

### Task 1 — Write the failing test for `generatePojo()` (5 min)

Create `src/app/services/pojo-generator.spec.ts`:

```ts
import { generatePojo } from './pojo-generator';

describe('generatePojo', () => {
  it('generates a Java class with @JsonProperty annotations', () => {
    const json = { userId: 42, username: 'alice', isActive: true };
    const code = generatePojo(json, 'User');
    expect(code).toContain('public class User');
    expect(code).toContain('@JsonProperty("userId")');
    expect(code).toContain('private int userId;');
    expect(code).toContain('private String username;');
    expect(code).toContain('private boolean isActive;');
    expect(code).toContain('@JsonPropertyOrder');
    expect(code).toContain('public int getUserId()');
    expect(code).toContain('public void setUserId(int userId)');
  });

  it('handles nested objects by generating inner classes', () => {
    const json = { id: 1, address: { street: 'Main', city: 'Springfield' } };
    const code = generatePojo(json, 'Order');
    expect(code).toContain('public class Order');
    expect(code).toContain('private Address address;');
    expect(code).toContain('public static class Address');
    expect(code).toContain('private String street;');
    expect(code).toContain('private String city;');
  });

  it('handles arrays as List types', () => {
    const json = { id: 1, tags: ['a', 'b'] };
    const code = generatePojo(json, 'Item');
    expect(code).toContain('private List<String> tags;');
    expect(code).toContain('import java.util.List;');
  });

  it('maps fractional numbers to double', () => {
    const json = { id: 1, price: 3.14, ratio: 0.5 };
    const code = generatePojo(json, 'Product');
    expect(code).toContain('private double price;');
    expect(code).toContain('private double ratio;');
  });

  it('detects ISO dates and adds @JsonFormat', () => {
    const json = { id: 1, createdAt: '2026-01-15T10:30:00Z' };
    const code = generatePojo(json, 'Event');
    expect(code).toContain('@JsonFormat');
    expect(code).toContain('private String createdAt;');
  });

  it('adds @JsonIgnore for null fields when includeNulls is false', () => {
    const json = { id: 1, optional: null };
    const code = generatePojo(json, 'Thing', { ignoreNulls: true });
    expect(code).toContain('@JsonIgnore');
    expect(code).toContain('private Object optional;');
  });

  it('throws on invalid JSON', () => {
    expect(() => generatePojo('not json', 'Bad')).toThrow();
  });
});
```

Run it — it should **fail** (module doesn't exist):
```bash
npm test 2>&1 | grep -E "FAIL|pojo-generator"
```
Expected: a failure mentioning `Cannot find module './pojo-generator'`.

Commit: `git add -A && git commit -m "test: add failing tests for pojo-generator"`

---

### Task 2 — Implement `generatePojo()` minimally to pass tests (10 min)

Create `src/app/services/pojo-generator.ts`:

```ts
/**
 * Options for POJO generation.
 */
export interface PojoOptions {
  /** When true, fields whose sample value is null get @JsonIgnore. */
  ignoreNulls?: boolean;
  /** When true, generate toString/equals/hashCode. */
  generateLombok?: boolean;
}

/**
 * Map a single JSON value to a Java type string.
 */
function inferType(value: unknown, key: string): string {
  if (value === null) return 'Object';
  if (typeof value === 'string') {
    // ISO-8601 date detection
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      return 'String'; // caller adds @JsonFormat
    }
    return 'String';
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      if (Math.abs(value) > Number.MAX_SAFE_INTEGER) return 'long';
      return 'int';
    }
    return 'double';
  }
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'List<Object>';
    return `List<${inferType(value[0], key)}>`;
  }
  if (typeof value === 'object') {
    return capitalize(key); // nested class name
  }
  return 'Object';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isIsoDate(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

/**
 * Generate a Java POJO class from a JSON object.
 *
 * @param input   The JSON object (already parsed) or a JSON string.
 * @param className  The Java class name to use.
 * @param options  Optional generation flags.
 * @returns       The generated Java source code as a string.
 */
export function generatePojo(
  input: Record<string, unknown> | string,
  className: string,
  options: PojoOptions = {},
): string {
  let obj: Record<string, unknown>;
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input) as Record<string, unknown>;
    } catch {
      throw new Error('Invalid JSON input');
    }
  } else {
    obj = input;
  }

  const fields: Field[] = [];
  const nestedClasses: Map<string, Field[]> = new Map();

  for (const [key, value] of Object.entries(obj)) {
    const fieldType = inferType(value, key);
    const isNested = typeof value === 'object' && value !== null && !Array.isArray(value);

    if (isNested) {
      const nestedName = capitalize(key);
      const nestedFields = (value as Record<string, unknown>)
        ? Object.entries(value as Record<string, unknown>)
            .map(([nk, nv]) => makeField(nk, nv, nestedName, options))
            .filter((f): f is Field => f !== null)
        : [];
      nestedClasses.set(nestedName, nestedFields);
    }

    fields.push(makeField(key, value, className, options));
  }

  return buildClass(className, fields, nestedClasses, options);
}

interface Field {
  name: string;
  type: string;
  annotations: string[];
  isDate: boolean;
}

function makeField(
  key: string,
  value: unknown,
  _parent: string,
  options: PojoOptions,
): Field | null {
  const annotations: string[] = [`@JsonProperty("${key}")`];

  if (value === null && options.ignoreNulls) {
    annotations.push('@JsonIgnore');
  }

  const isDate = isIsoDate(value);
  if (isDate) {
    annotations.push('@JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd\'T\'HH:mm:ss.SSSXXX")');
  }

  return {
    name: key,
    type: inferType(value, key),
    annotations,
    isDate,
  };
}

function buildClass(
  className: string,
  fields: (Field | null)[],
  nestedClasses: Map<string, Field[]>,
  options: PojoOptions,
): string {
  const validFields = fields.filter((f): f is Field => f !== null);

  const needsList = validFields.some((f) => f.type.startsWith('List<'));
  const needsDate = validFields.some((f) => f.isDate);

  const imports = new Set<string>();
  if (needsList) imports.add('java.util.List');
  if (needsDate) {
    imports.add('com.fasterxml.jackson.annotation.JsonFormat');
  }
  imports.add('com.fasterxml.jackson.annotation.JsonProperty');
  imports.add('com.fasterxml.jackson.annotation.JsonIgnore');
  imports.add('com.fasterxml.jackson.annotation.JsonPropertyOrder');

  const importLines = [...imports].sort().map((i) => `import ${i};`).join('\n');

  const orderKey = validFields.map((f) => `"${f.name}"`).join(', ');

  const classLines: string[] = [];
  classLines.push(`@JsonPropertyOrder({${orderKey}})`);
  classLines.push(`public class ${className} {`);
  classLines.push('');

  // Fields
  for (const f of validFields) {
    for (const ann of f.annotations) {
      classLines.push(`    ${ann}`);
    }
    classLines.push(`    private ${f.type} ${f.name};`);
    classLines.push('');
  }

  // Getters / setters
  for (const f of validFields) {
    const cap = f.name.charAt(0).toUpperCase() + f.name.slice(1);
    classLines.push(`    public ${f.type} get${cap}() {`);
    classLines.push(`        return ${f.name};`);
    classLines.push('    }');
    classLines.push('');
    classLines.push(`    public void set${cap}(${f.type} ${f.name}) {`);
    classLines.push(`        this.${f.name} = ${f.name};`);
    classLines.push('    }');
    classLines.push('');
  }

  // Nested classes
  for (const [nestedName, nestedFields] of nestedClasses) {
    classLines.push(`    public static class ${nestedName} {`);
    classLines.push('');
    for (const nf of nestedFields) {
      for (const ann of nf.annotations) {
        classLines.push(`        ${ann}`);
      }
      classLines.push(`        private ${nf.type} ${nf.name};`);
      classLines.push('');
    }
    for (const nf of nestedFields) {
      const cap = nf.name.charAt(0).toUpperCase() + nf.name.slice(1);
      classLines.push(`        public ${nf.type} get${cap}() {`);
      classLines.push(`            return ${nf.name};`);
      classLines.push('        }');
      classLines.push('');
      classLines.push(`        public void set${cap}(${nf.type} ${nf.name}) {`);
      classLines.push(`            this.${nf.name} = ${nf.name};`);
      classLines.push('        }');
      classLines.push('');
    }
    classLines.push('    }');
    classLines.push('');
  }

  classLines.push('}');

  return [importLines, '', classLines.join('\n')].filter(Boolean).join('\n');
}
```

Run the tests:
```bash
npm test 2>&1 | tail -20
```
Expected: all 6 tests pass.

Commit: `git add -A && git commit -m "feat: implement pojo-generator service"`

---

### Task 3 — Build the `PojoConverter` component (10 min)

Create `src/app/components/pojo-converter/pojo-converter.ts`:

```ts
import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { generatePojo } from '../../services/pojo-generator';

@Component({
  selector: 'app-pojo-converter',
  imports: [FormsModule],
  template: `
    <div class="container-fluid py-4">
      <div class="row g-4">
        <!-- Left: JSON input -->
        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span class="fw-bold">JSON Input</span>
              <div class="d-flex gap-2">
                <label class="form-check-label small me-2" for="ignoreNulls">
                  <input
                    id="ignoreNulls"
                    class="form-check-input"
                    type="checkbox"
                    [checked]="ignoreNulls()"
                    (change)="ignoreNulls.set(!ignoreNulls())"
                  />
                  @JsonIgnore nulls
                </label>
                <button
                  class="btn btn-primary btn-sm"
                  (click)="generate()"
                  [disabled]="!jsonInput().trim()"
                >
                  Generate
                </button>
              </div>
            </div>
            <div class="card-body d-flex flex-column">
              <textarea
                class="form-control font-monospace"
                rows="20"
                [(ngModel)]="jsonInput"
                placeholder='Paste your JSON object here…\n\n{ "id": 1, "name": "Alice" }'
              ></textarea>
              @if (error(); ) {
                <div class="alert alert-danger mt-3 mb-0">{{ error() }}</div>
              }
            </div>
          </div>
        </div>

        <!-- Right: generated code -->
        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span class="fw-bold">Generated POJO</span>
              <button
                class="btn btn-outline-secondary btn-sm"
                (click)="copyCode()"
                [disabled]="!generatedCode()"
              >
                Copy
              </button>
            </div>
            <div class="card-body">
              <pre class="mb-0 bg-dark text-light p-3 rounded overflow-auto" style="max-height: calc(100vh - 200px);">
{{ generatedCode() || '// Click Generate to see the POJO here' }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [],
})
export class PojoConverter {
  protected readonly jsonInput = signal('');
  protected readonly generatedCode = signal('');
  protected readonly error = signal('');
  protected readonly ignoreNulls = signal(false);
  protected readonly className = signal('MyClass');

  generate(): void {
    this.error.set('');
    try {
      const code = generatePojo(
        this.jsonInput(),
        this.className(),
        { ignoreNulls: this.ignoreNulls() },
      );
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

Commit: `git add -A && git commit -m "feat: add PojoConverter component"`

---

### Task 4 — Wire the component into `app.ts` and clean up (5 min)

Replace `src/app/app.html` with:

```html
<app-pojo-converter />
```

Replace `src/app/app.ts` with:

```ts
import { Component } from '@angular/core';
import { PojoConverter } from './components/pojo-converter/pojo-converter';

@Component({
  selector: 'app-root',
  imports: [PojoConverter],
  template: '',
  styles: [],
})
export class App {}
```

Delete the old `src/app/app.css` (or leave it empty — it's no longer referenced).

Commit: `git add -A && git commit -m "feat: wire PojoConverter into app shell"`

---

### Task 5 — Update the existing spec to match the new `App` (5 min)

Replace `src/app/app.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the PojoConverter', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('[app-pojo-converter]')).toBeTruthy();
  });
});
```

Run all tests:
```bash
npm test 2>&1 | tail -15
```
Expected: all tests pass (6 in `pojo-generator.spec.ts` + 2 in `app.spec.ts`).

Commit: `git add -A && git commit -m "test: update app spec for new shell"`

---

### Task 6 — Add a class-name input (optional, 3 min)

If the user wants a custom class name, add a `<input>` bound to `className` in the card header. This is a nice-to-have; skip if not needed.

```html
<input
  class="form-control form-control-sm me-2"
  style="width: 120px;"
  [ngModel]="className()"
  (ngModelChange)="className.set($event)"
  placeholder="ClassName"
/>
```

Commit (if done): `git add -A && git commit -m "feat: add class-name input"`

---

### Task 7 — Final verification (3 min)

```bash
npm run build 2>&1 | tail -5
npm test 2>&1 | tail -10
```

Both should succeed. Open the app in a browser:
```bash
npm start
```
Navigate to `http://localhost:4200/`, paste:
```json
{
  "userId": 42,
  "username": "alice",
  "email": "alice@example.com",
  "isActive": true,
  "createdAt": "2026-01-15T10:30:00Z",
  "address": { "street": "1 Main St", "city": "Springfield" },
  "tags": ["admin", "user"],
  "metadata": null
}
```
Click **Generate**. Verify the output contains:
- `@JsonProperty("userId")`, `private int userId;`
- `@JsonProperty("email")`, `private String email;`
- `@JsonProperty("createdAt")` with `@JsonFormat`
- `public static class Address` with `street` and `city`
- `private List<String> tags;`
- `@JsonPropertyOrder({"userId", "username", ...})`

Commit (if any tweaks): `git add -A && git commit -m "fix: polish pojo output"`

## Tests / validation

| # | Test | File |
|---|------|------|
| 1 | `generatePojo` basic fields + annotations | `pojo-generator.spec.ts` |
| 2 | Nested objects → static inner class | `pojo-generator.spec.ts` |
| 3 | Arrays → `List<T>` + import | `pojo-generator.spec.ts` |
| 4 | ISO dates → `@JsonFormat` | `pojo-generator.spec.ts` |
| 5 | `null` + `ignoreNulls` → `@JsonIgnore` | `pojo-generator.spec.ts` |
| 6 | Invalid JSON throws | `pojo-generator.spec.ts` |
| 7 | `App` creates and renders `PojoConverter` | `app.spec.ts` |

Run: `npm test`

## Risks, tradeoffs, and open questions

- **TypeScript ≠ Java**: `inferType` is a heuristic. It does NOT do full JSON Schema inference. A `number` could be `float`/`double`/`BigDecimal` in Java; we default to `int`/`double` based on integer-ness. This is a v1 simplification.
- **`@JsonFormat` on `String` fields**: In real Jackson you'd typically map to `java.time.Instant` or `LocalDateTime` and let Jackson handle the format. Our v1 keeps the field as `String` and adds `@JsonFormat` as a hint. A future version could offer a "use `java.time` types" toggle.
- **Circular references**: If the JSON has circular structure (impossible in a plain JSON string, but possible in a parsed object), the recursive `inferType` could loop. Mitigation: v1 only handles one level of nesting; deeper nesting is left as an extension.
- **No syntax highlighting**: The `<pre>` block is plain text. A future task could add `highlight.js` or `prism.js`.
- **Bootstrap icons**: We import `bootstrap-icons` in `styles.css` but don't use any icons in v1. Remove the import if unused to keep the bundle smaller.
- **Open question**: Should the app also accept a **Java class** as input and show which Jackson annotations it already declares (the user's second clarification option)? That would be a separate mode/component.
