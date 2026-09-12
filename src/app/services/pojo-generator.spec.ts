import { generatePojo } from './pojo-generator';

describe('generatePojo', () => {
  it('generates a Java class with @JsonProperty annotations and Lombok by default', () => {
    const json = { userId: 42, username: 'alice', isActive: true };
    const code = generatePojo(json, 'User');
    expect(code).toContain('public class User');
    expect(code).toContain('@JsonProperty("userId")');
    expect(code).toContain('private int userId;');
    expect(code).toContain('private String username;');
    expect(code).toContain('private boolean isActive;');
    expect(code).toContain('@JsonPropertyOrder');
    expect(code).toContain('@Data');
    expect(code).toContain('@NoArgsConstructor');
    expect(code).toContain('@AllArgsConstructor');
    expect(code).toContain('@Builder');
    expect(code).toContain('import lombok.Data;');
    expect(code).not.toContain('public int getUserId()');
  });

  it('generates explicit getters/setters when useLombok is false', () => {
    const json = { userId: 42, username: 'alice', isActive: true };
    const code = generatePojo(json, 'User', { useLombok: false });
    expect(code).toContain('public class User');
    expect(code).toContain('@JsonProperty("userId")');
    expect(code).toContain('private int userId;');
    expect(code).toContain('@JsonPropertyOrder');
    expect(code).toContain('public int getUserId()');
    expect(code).toContain('public void setUserId(int userId)');
    expect(code).not.toContain('@Data');
    expect(code).not.toContain('import lombok.');
  });

  it('handles nested objects by generating inner classes with Lombok', () => {
    const json = { id: 1, address: { street: 'Main', city: 'Springfield' } };
    const code = generatePojo(json, 'Order');
    expect(code).toContain('public class Order');
    expect(code).toContain('private Address address;');
    expect(code).toContain('public static class Address');
    expect(code).toContain('private String street;');
    expect(code).toContain('private String city;');
    // nested class gets @JsonPropertyOrder and Lombok
    const nestedIdx = code.indexOf('public static class Address');
    const before = code.slice(Math.max(0, nestedIdx - 200), nestedIdx);
    expect(before).toContain('@JsonPropertyOrder({"street", "city"})');
    expect(before).toContain('@Data');
    expect(before).toContain('@Builder');
  });

  it('handles arrays as List types', () => {
    const json = { id: 1, tags: ['a', 'b'] };
    const code = generatePojo(json, 'Item');
    expect(code).toContain('private List<String> tags;');
    expect(code).toContain('import java.util.List;');
  });

  it('handles arrays of objects by generating inner classes', () => {
    const json = { items: [{ item1: 'bob' }, { item2: 'Betty' }] };
    const code = generatePojo(json, 'MyClass');
    expect(code).toContain('private List<Items> items;');
    expect(code).toContain('public static class Items');
    expect(code).toContain('private String item1;');
    expect(code).toContain('private String item2;');
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

  it('adds @JsonInclude(NON_NULL) at class level when includeMode is NON_NULL', () => {
    const json = { id: 1, optional: null };
    const code = generatePojo(json, 'Thing', { includeMode: 'NON_NULL' });
    expect(code).toContain('@JsonInclude(JsonInclude.Include.NON_NULL)');
    expect(code).toContain('import com.fasterxml.jackson.annotation.JsonInclude;');
    expect(code).toContain('private Object optional;');
    expect(code).not.toContain('@JsonIgnore');
  });

  it('adds @JsonInclude(NON_EMPTY) at class level when includeMode is NON_EMPTY', () => {
    const json = { id: 1, optional: null };
    const code = generatePojo(json, 'Thing', { includeMode: 'NON_EMPTY' });
    expect(code).toContain('@JsonInclude(JsonInclude.Include.NON_EMPTY)');
    expect(code).toContain('import com.fasterxml.jackson.annotation.JsonInclude;');
    expect(code).toContain('private Object optional;');
  });

  it('adds @JsonInclude to nested classes when includeMode is set', () => {
    const json = { id: 1, nested: { a: null, b: 2 } };
    const code = generatePojo(json, 'Thing', { includeMode: 'NON_NULL' });
    expect(code).toContain('@JsonInclude(JsonInclude.Include.NON_NULL)');
    const nestedIdx = code.indexOf('public static class Nested');
    const before = code.slice(Math.max(0, nestedIdx - 200), nestedIdx);
    expect(before).toContain('@JsonInclude(JsonInclude.Include.NON_NULL)');
  });

  it('omits @JsonInclude when includeMode is not set', () => {
    const json = { id: 1, optional: null };
    const code = generatePojo(json, 'Thing');
    expect(code).not.toContain('@JsonInclude');
    expect(code).not.toContain('import com.fasterxml.jackson.annotation.JsonInclude;');
  });

  it('throws on invalid JSON', () => {
    expect(() => generatePojo('not json', 'Bad')).toThrow();
  });
});
