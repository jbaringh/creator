export interface ExceptionFieldSpec {
  name: string;
  type: string;
}

export interface ExceptionOptions {
  name: string;
  /** Superclass to extend, defaults to RuntimeException. */
  extendsType?: string;
  /** Optional payload fields (each gets a getter). */
  fields?: ExceptionFieldSpec[];
  /** When true (default), use Lombok @Getter instead of hand-written getters. */
  useLombok?: boolean;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getterName(field: string): string {
  return `get${capitalize(field)}`;
}

export function generateExceptionClass(options: ExceptionOptions): string {
  const name = options.name.trim();
  if (!name) throw new Error('Exception class name is required');

  const superType = options.extendsType?.trim() || 'RuntimeException';
  const fields = (options.fields ?? [])
    .map((f) => ({ name: f.name.trim(), type: f.type.trim() || 'String' }))
    .filter((f) => f.name !== '');
  const useLombok = options.useLombok ?? true;

  const lines: string[] = [];
  if (useLombok && fields.length > 0) {
    lines.push('import lombok.Getter;');
    lines.push('');
  }
  if (useLombok && fields.length > 0) {
    lines.push('@Getter');
  }
  lines.push(`public class ${name} extends ${superType} {`);
  lines.push('');

  if (fields.length > 0) {
    for (const f of fields) {
      lines.push(`    private final ${f.type} ${f.name};`);
    }
    lines.push('');
  }

  if (fields.length > 0) {
    const fieldParams = fields.map((f) => `${f.type} ${f.name}`).join(', ');
    const fieldArgs = fields.map((f) => f.name).join(', ');
    const assignments = fields.map((f) => `        this.${f.name} = ${f.name};`).join('\n');

    // Convenience: fields only (first field doubles as the message).
    lines.push(`    public ${name}(${fieldParams}) {`);
    lines.push(`        super(${fields[0].name});`);
    lines.push(assignments);
    lines.push('    }');
    lines.push('');

    lines.push(`    public ${name}(${fieldParams}, String message) {`);
    lines.push('        super(message);');
    lines.push(assignments);
    lines.push('    }');
    lines.push('');

    lines.push(`    public ${name}(${fieldParams}, String message, Throwable cause) {`);
    lines.push('        super(message, cause);');
    lines.push(assignments);
    lines.push('    }');
    lines.push('');
  } else {
    lines.push(`    public ${name}(String message) {`);
    lines.push('        super(message);');
    lines.push('    }');
    lines.push('');

    lines.push(`    public ${name}(String message, Throwable cause) {`);
    lines.push('        super(message, cause);');
    lines.push('    }');
    lines.push('');
  }

  if (!useLombok) {
    for (const f of fields) {
      lines.push(`    public ${f.type} ${getterName(f.name)}() {`);
      lines.push(`        return ${f.name};`);
      lines.push('    }');
      lines.push('');
    }
  }

  lines.push('}');

  // Trim trailing blank line before closing brace is already handled; trim final blanks.
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}
