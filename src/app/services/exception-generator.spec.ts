import { generateExceptionClass } from './exception-generator';

describe('generateExceptionClass', () => {
  it('generates a basic exception extending RuntimeException', () => {
    const code = generateExceptionClass({ name: 'UserNotFoundException' });
    expect(code).toContain('public class UserNotFoundException extends RuntimeException {');
    expect(code).toContain('public UserNotFoundException(String message) {');
    expect(code).toContain('super(message);');
    expect(code).toContain('public UserNotFoundException(String message, Throwable cause) {');
    expect(code).toContain('super(message, cause);');
  });

  it('uses a custom superclass when provided', () => {
    const code = generateExceptionClass({ name: 'FooException', extendsType: 'Exception' });
    expect(code).toContain('public class FooException extends Exception {');
  });

  it('trims whitespace from the class name', () => {
    const code = generateExceptionClass({ name: '  Foo  ' });
    expect(code).toContain('public class Foo extends RuntimeException {');
  });

  it('throws on an empty class name', () => {
    expect(() => generateExceptionClass({ name: '   ' })).toThrow();
  });

  it('generates fields with Lombok @Getter by default (no hand-written getters)', () => {
    const code = generateExceptionClass({
      name: 'OrderException',
      fields: [
        { name: 'orderId', type: 'String' },
        { name: 'amount', type: 'long' },
      ],
    });
    expect(code).toContain('import lombok.Getter;');
    expect(code).toContain('@Getter');
    expect(code).toContain('private final String orderId;');
    expect(code).toContain('private final long amount;');
    expect(code).toContain('public OrderException(String orderId, long amount) {');
    expect(code).toContain('super(orderId);');
    expect(code).toContain('this.orderId = orderId;');
    expect(code).not.toContain('public String getOrderId() {');
  });

  it('emits hand-written getters when Lombok is disabled', () => {
    const code = generateExceptionClass({
      name: 'OrderException',
      fields: [
        { name: 'orderId', type: 'String' },
        { name: 'amount', type: 'long' },
      ],
      useLombok: false,
    });
    expect(code).not.toContain('@Getter');
    expect(code).not.toContain('import lombok.Getter;');
    expect(code).toContain('public String getOrderId() {');
    expect(code).toContain('public long getAmount() {');
  });

  it('omits the Lombok annotation when there are no fields', () => {
    const code = generateExceptionClass({ name: 'PlainException' });
    expect(code).not.toContain('@Getter');
    expect(code).not.toContain('import lombok.Getter;');
  });

  it('defaults an empty field type to String', () => {
    const code = generateExceptionClass({ name: 'E', fields: [{ name: 'id', type: '' }] });
    expect(code).toContain('private final String id;');
  });
});
