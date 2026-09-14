export interface AdviceHandlerSpec {
  /** Fully-qualified or simple exception type, e.g. IllegalArgumentException. */
  exceptionType: string;
  /** HTTP status code, e.g. 400. */
  status: string;
  /** Response body type, e.g. String. */
  bodyType: string;
  /** Body expression (for String bodies), e.g. "An unexpected error occurred: " + ex.getMessage(). */
  bodyExpression?: string;
}

export interface ControllerAdviceOptions {
  className?: string;
  /** Restrict advice to controllers in these packages (optional). */
  basePackages?: string[];
  handlers: AdviceHandlerSpec[];
}

const STATUS_NAMES: Record<string, string> = {
  '200': 'OK',
  '201': 'CREATED',
  '202': 'ACCEPTED',
  '204': 'NO_CONTENT',
  '301': 'MOVED_PERMANENTLY',
  '302': 'FOUND',
  '400': 'BAD_REQUEST',
  '401': 'UNAUTHORIZED',
  '403': 'FORBIDDEN',
  '404': 'NOT_FOUND',
  '405': 'METHOD_NOT_ALLOWED',
  '406': 'NOT_ACCEPTABLE',
  '409': 'CONFLICT',
  '415': 'UNSUPPORTED_MEDIA_TYPE',
  '422': 'UNPROCESSABLE_ENTITY',
  '429': 'TOO_MANY_REQUESTS',
  '500': 'INTERNAL_SERVER_ERROR',
  '501': 'NOT_IMPLEMENTED',
  '503': 'SERVICE_UNAVAILABLE',
};

function statusLiteral(status: string): string {
  const code = status.trim();
  const name = STATUS_NAMES[code];
  return name ? `HttpStatus.${name}` : code; // unknown code falls back to the numeric status
}

function parameterName(): string {
  return 'ex';
}

function methodName(exceptionType: string, used: Set<string>): string {
  const base = `handle${exceptionType}`;
  let name = base;
  let n = 1;
  while (used.has(name)) {
    n++;
    name = `${base}${n}`;
  }
  used.add(name);
  return name;
}

export function generateControllerAdvice(options: ControllerAdviceOptions): string {
  const handlers = (options.handlers ?? []).filter((h) => h.exceptionType.trim() !== '');
  if (handlers.length === 0) {
    throw new Error('At least one exception handler is required');
  }

  const className = options.className?.trim() || 'GlobalExceptionHandler';
  const basePackages = (options.basePackages ?? []).map((p) => p.trim()).filter((p) => p !== '');

  const adviceAttr = basePackages.length
    ? `(basePackages = ${basePackages.map((p) => `"${p}"`).join(', ')})`
    : '';

  const imports = new Set<string>();
  imports.add('org.springframework.http.HttpStatus');
  imports.add('org.springframework.http.ResponseEntity');
  imports.add('org.springframework.web.bind.annotation.ControllerAdvice');
  imports.add('org.springframework.web.bind.annotation.ExceptionHandler');
  const importLines = [...imports].sort().map((i) => `import ${i};`).join('\n');

  const lines: string[] = [];
  lines.push(`@ControllerAdvice${adviceAttr}`);
  lines.push('// @Order(1) // Highest priority: evaluated first');
  lines.push(`public class ${className} {`);
  lines.push('');

  const usedNames = new Set<string>();
  for (const h of handlers) {
    const exType = h.exceptionType.trim();
    const bodyType = h.bodyType.trim() || 'String';
    const name = methodName(exType, usedNames);
    const param = parameterName();

    lines.push(`    @ExceptionHandler(${exType}.class)`);
    lines.push(`    public ResponseEntity<${bodyType}> ${name}(${exType} ${param}) {`);
    if (bodyType === 'String' && h.bodyExpression?.trim()) {
      lines.push(`        String body = ${h.bodyExpression.trim()};`);
      lines.push(`        return new ResponseEntity<>(body, ${statusLiteral(h.status)});`);
    } else {
      lines.push('        // TODO: build response body');
      lines.push(`        return new ResponseEntity<>(null, ${statusLiteral(h.status)});`);
    }
    lines.push('    }');
    lines.push('');
  }

  lines.push('}');

  const header = [importLines, ''].join('\n');
  return `${header}\n${lines.join('\n')}`;
}
