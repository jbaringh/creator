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
