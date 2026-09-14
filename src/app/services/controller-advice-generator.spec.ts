import { generateControllerAdvice } from './controller-advice-generator';

describe('generateControllerAdvice', () => {
  it('generates a basic @ControllerAdvice with one handler', () => {
    const code = generateControllerAdvice({
      className: 'GlobalExceptionHandler',
      handlers: [
        { exceptionType: 'Exception', status: '500', bodyType: 'String',
          bodyExpression: '"An unexpected error occurred: " + ex.getMessage()' },
      ],
    });
    expect(code).toContain('@ControllerAdvice');
    expect(code).toContain('public class GlobalExceptionHandler');
    expect(code).toContain('@ExceptionHandler(Exception.class)');
    expect(code).toContain('public ResponseEntity<String> handleException(Exception ex)');
    expect(code).toContain('String body = "An unexpected error occurred: " + ex.getMessage();');
    expect(code).toContain('return new ResponseEntity<>(body, HttpStatus.INTERNAL_SERVER_ERROR);');
    expect(code).toContain('import org.springframework.web.bind.annotation.ControllerAdvice;');
    expect(code).toContain('import org.springframework.web.bind.annotation.ExceptionHandler;');
    expect(code).toContain('import org.springframework.http.ResponseEntity;');
    expect(code).toContain('import org.springframework.http.HttpStatus;');
  });

  it('maps common status codes to HttpStatus enum names', () => {
    const code = generateControllerAdvice({
      className: 'H',
      handlers: [
        { exceptionType: 'IllegalArgumentException', status: '400', bodyType: 'String' },
        { exceptionType: 'SecurityException', status: '403', bodyType: 'String' },
        { exceptionType: 'NoSuchElementException', status: '404', bodyType: 'String' },
      ],
    });
    expect(code).toContain('HttpStatus.BAD_REQUEST');
    expect(code).toContain('HttpStatus.FORBIDDEN');
    expect(code).toContain('HttpStatus.NOT_FOUND');
  });

  it('uses numeric fallback for unknown status codes', () => {
    const code = generateControllerAdvice({
      className: 'H',
      handlers: [{ exceptionType: 'E', status: '418', bodyType: 'String' }],
    });
    expect(code).toContain('new ResponseEntity<>(null, 418)');
  });

  it('generates multiple handlers with deduplicated method names', () => {
    const code = generateControllerAdvice({
      className: 'H',
      handlers: [
        { exceptionType: 'Exception', status: '500', bodyType: 'String' },
        { exceptionType: 'Exception', status: '400', bodyType: 'String' },
      ],
    });
    expect(code).toContain('handleException(Exception ex)');
    expect(code).toContain('handleException2(Exception ex)');
  });

  it('does not emit a package declaration', () => {
    const code = generateControllerAdvice({
      className: 'GlobalExceptionHandler',
      handlers: [{ exceptionType: 'Exception', status: '500', bodyType: 'String' }],
    });
    expect(code).not.toContain('package ');
  });

  it('adds basePackages attribute when set', () => {
    const code = generateControllerAdvice({
      className: 'H',
      basePackages: ['com.example.a', 'com.example.b'],
      handlers: [{ exceptionType: 'Exception', status: '500', bodyType: 'String' }],
    });
    expect(code).toContain('@ControllerAdvice(basePackages = "com.example.a", "com.example.b")');
  });

  it('supports non-String body types with a TODO stub', () => {
    const code = generateControllerAdvice({
      className: 'H',
      handlers: [{ exceptionType: 'Exception', status: '500', bodyType: 'ErrorResponse' }],
    });
    expect(code).toContain('public ResponseEntity<ErrorResponse> handleException(Exception ex)');
    expect(code).toContain('// TODO: build response body');
    expect(code).toContain('return new ResponseEntity<>(null, HttpStatus.INTERNAL_SERVER_ERROR);');
  });

  it('throws when no handlers are provided', () => {
    expect(() => generateControllerAdvice({ className: 'H', handlers: [] })).toThrow();
  });

  it('throws when all handlers have empty exception types', () => {
    expect(() => generateControllerAdvice({ className: 'H', handlers: [{ exceptionType: '', status: '500', bodyType: 'String' }] })).toThrow();
  });
});
