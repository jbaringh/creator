export interface PojoOptions {
  /** When true, fields whose sample value is null get @JsonIgnore. */
  ignoreNulls?: boolean;
  /** When true (default), use Lombok annotations instead of hand-written getters/setters. */
  useLombok?: boolean;
}

interface Field {
  name: string;
  type: string;
  annotations: string[];
  isDate: boolean;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function isIsoDate(value: unknown): boolean {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

function inferType(value: unknown, key: string, parentClassName: string): string {
  if (value === null || value === undefined) return 'Object';
  if (typeof value === 'string') return 'String';
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
    return `List<${inferType(value[0], key, parentClassName)}>`;
  }
  if (typeof value === 'object') {
    return nestedClassName(key, parentClassName);
  }
  return 'Object';
}

/**
 * If a nested object's capitalised key would collide with the parent class
 * name (e.g. key "order" inside class "Order"), return a disambiguated name.
 */
function nestedClassName(key: string, parentClassName: string): string {
  const base = capitalize(key);
  return base === parentClassName ? `${base}Dto` : base;
}

function makeField(
  key: string,
  value: unknown,
  options: PojoOptions,
  parentClassName: string,
): Field {
  const annotations: string[] = [`@JsonProperty("${key}")`];

  if (value === null && options.ignoreNulls) {
    annotations.push('@JsonIgnore');
  }

  const isDate = isIsoDate(value);
  if (isDate) {
    annotations.push(
      '@JsonFormat(shape = JsonFormat.Shape.STRING, pattern = "yyyy-MM-dd\'T\'HH:mm:ss.SSSXXX")',
    );
  }

  return {
    name: key,
    type: inferType(value, key, parentClassName),
    annotations,
    isDate,
  };
}

function buildFieldBlock(
  fields: Field[],
  indent: string,
  useLombok: boolean,
): string[] {
  const lines: string[] = [];

  for (const f of fields) {
    for (const ann of f.annotations) {
      lines.push(`${indent}${ann}`);
    }
    lines.push(`${indent}private ${f.type} ${f.name};`);
    lines.push('');
  }

  if (!useLombok) {
    for (const f of fields) {
      const cap = f.name.charAt(0).toUpperCase() + f.name.slice(1);
      lines.push(`${indent}public ${f.type} get${cap}() {`);
      lines.push(`${indent}    return ${f.name};`);
      lines.push(`${indent}}`);
      lines.push('');
      lines.push(`${indent}public void set${cap}(${f.type} ${f.name}) {`);
      lines.push(`${indent}    this.${f.name} = ${f.name};`);
      lines.push(`${indent}}`);
      lines.push('');
    }
  }

  return lines;
}

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

  const useLombok = options.useLombok ?? true;

  const fields: Field[] = [];
  const nestedClasses: Map<string, Field[]> = new Map();

  /** Recursively register a nested object's fields into nestedClasses. */
  function registerNested(value: Record<string, unknown>, name: string): void {
    const nestedFields: Field[] = [];
    for (const [nk, nv] of Object.entries(value)) {
      if (typeof nv === 'object' && nv !== null && !Array.isArray(nv)) {
        const childName = nestedClassName(nk, name);
        registerNested(nv as Record<string, unknown>, childName);
      } else if (Array.isArray(nv) && nv.length > 0) {
        const elemName = nestedClassName(nk, name);
        // Merge fields from all elements, then register the merged shape
        const objEls = nv.filter(
          (el): el is Record<string, unknown> =>
            typeof el === 'object' && el !== null,
        );
        if (objEls.length > 0) {
          const merged: Record<string, unknown> = {};
          for (const el of objEls) {
            for (const [k, v] of Object.entries(el)) {
              if (!(k in merged)) merged[k] = v;
            }
          }
          registerNested(merged, elemName);
        }
      }
      nestedFields.push(makeField(nk, nv, options, name));
    }
    nestedClasses.set(name, nestedFields);
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      registerNested(value as Record<string, unknown>, nestedClassName(key, className));
    } else if (Array.isArray(value) && value.length > 0) {
      const objEls = value.filter(
        (el): el is Record<string, unknown> =>
          typeof el === 'object' && el !== null,
      );
      if (objEls.length > 0) {
        const merged: Record<string, unknown> = {};
        for (const el of objEls) {
          for (const [k, v] of Object.entries(el)) {
            if (!(k in merged)) merged[k] = v;
          }
        }
        registerNested(merged, nestedClassName(key, className));
      }
    }

    fields.push(makeField(key, value, options, className));
  }

  const imports = new Set<string>();
  imports.add('com.fasterxml.jackson.annotation.JsonProperty');
  imports.add('com.fasterxml.jackson.annotation.JsonPropertyOrder');

  if (fields.some((f) => f.annotations.some((a) => a.includes('@JsonIgnore')))) {
    imports.add('com.fasterxml.jackson.annotation.JsonIgnore');
  }

  if (useLombok) {
    imports.add('lombok.AllArgsConstructor');
    imports.add('lombok.Builder');
    imports.add('lombok.Data');
    imports.add('lombok.NoArgsConstructor');
  }

  if (fields.some((f) => f.type.startsWith('List<'))) {
    imports.add('java.util.List');
  }
  if (fields.some((f) => f.isDate)) {
    imports.add('com.fasterxml.jackson.annotation.JsonFormat');
  }

  const importLines = [...imports].sort().map((i) => `import ${i};`).join('\n');

  const orderKey = fields.map((f) => `"${f.name}"`).join(', ');

  const lines: string[] = [];
  lines.push(`@JsonPropertyOrder({${orderKey}})`);
  if (useLombok) {
    lines.push('@Data');
    lines.push('@NoArgsConstructor');
    lines.push('@AllArgsConstructor');
    lines.push('@Builder');
  }
  lines.push(`public class ${className} {`);
  lines.push('');

  lines.push(...buildFieldBlock(fields, '    ', useLombok));

  const nestedOrderKey = (fs: Field[]) => fs.map((f) => `"${f.name}"`).join(', ');

  for (const [nestedName, nestedFields] of nestedClasses) {
    lines.push(`    @JsonPropertyOrder({${nestedOrderKey(nestedFields)}})`);
    if (useLombok) {
      lines.push('    @Data');
      lines.push('    @NoArgsConstructor');
      lines.push('    @AllArgsConstructor');
      lines.push('    @Builder');
    }
    lines.push(`    public static class ${nestedName} {`);
    lines.push('');
    lines.push(...buildFieldBlock(nestedFields, '        ', useLombok));
    lines.push('    }');
    lines.push('');
  }

  lines.push('}');

  return `${importLines}\n\n${lines.join('\n')}`;
}
