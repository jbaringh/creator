import { generatePojoFromOpenApi, OpenApiOptions } from './openapi-generator';

const spec = (components: Record<string, unknown>) =>
  `openapi: 3.0.0
info:
  title: Test
  version: 1.0.0
paths: {}
components:
  schemas:
${JSON.stringify(components, null, 2).split('\n').map((l) => '    ' + l).join('\n')}
`;

describe('generatePojoFromOpenApi', () => {
  it('generates one class per schema with primitive fields', () => {
    const code = generatePojoFromOpenApi(
      spec({
        Person: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'integer' },
            score: { type: 'number' },
            active: { type: 'boolean' },
          },
        },
      }),
      {},
    );
    expect(code).toContain('public class Person {');
    expect(code).toContain('private String name;');
    expect(code).toContain('private int age;');
    expect(code).toContain('private double score;');
    expect(code).toContain('private boolean active;');
    expect(code).toContain('@JsonProperty("name")');
    expect(code).toContain('@JsonPropertyOrder({"name", "age", "score", "active"})');
  });

  it('supports integer formats int64 -> long and number format float -> float', () => {
    const code = generatePojoFromOpenApi(
      spec({
        Nums: {
          type: 'object',
          properties: {
            big: { type: 'integer', format: 'int64' },
            small: { type: 'number', format: 'float' },
          },
        },
      }),
    );
    expect(code).toContain('private long big;');
    expect(code).toContain('private float small;');
  });

  it('maps date and date-time formats to java.time types', () => {
    const code = generatePojoFromOpenApi(
      spec({
        When: {
          type: 'object',
          properties: {
            birthday: { type: 'string', format: 'date' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      }),
    );
    expect(code).toContain('private java.time.LocalDate birthday;');
    expect(code).toContain('private java.time.OffsetDateTime createdAt;');
    // Date types are fully-qualified in the field; no date import is emitted.
    expect(code).not.toContain('import java.time.LocalDate;');
    expect(code).not.toContain('import java.time.OffsetDateTime;');
  });

  it('generates List<T> for arrays', () => {
    const code = generatePojoFromOpenApi(
      spec({
        WithList: {
          type: 'object',
          properties: {
            tags: { type: 'array', items: { type: 'string' } },
          },
        },
      }),
    );
    expect(code).toContain('private List<String> tags;');
    expect(code).toContain('import java.util.List;');
  });

  it('resolves $ref between schemas into class names', () => {
    const code = generatePojoFromOpenApi(
      spec({
        Order: {
          type: 'object',
          properties: {
            customer: { $ref: '#/components/schemas/Customer' },
          },
        },
        Customer: {
          type: 'object',
          properties: {
            email: { type: 'string' },
          },
        },
      }),
    );
    expect(code).toContain('public class Order {');
    expect(code).toContain('public class Customer {');
    expect(code).toContain('private Customer customer;');
  });

  it('creates nested static classes for inline object properties', () => {
    const code = generatePojoFromOpenApi(
      spec({
        Account: {
          type: 'object',
          properties: {
            address: {
              type: 'object',
              properties: {
                city: { type: 'string' },
              },
            },
          },
        },
      }),
    );
    expect(code).toContain('private Address address;');
    expect(code).toContain('public static class Address {');
    expect(code).toContain('private String city;');
  });

  it('generates an enum for string properties with enum values', () => {
    const code = generatePojoFromOpenApi(
      spec({
        Shape: {
          type: 'object',
          properties: {
            color: { type: 'string', enum: ['red', 'green', 'blue'] },
          },
        },
      }),
    );
    expect(code).toContain('private Color color;');
    expect(code).toContain('public enum Color {');
    expect(code).toContain('RED');
    expect(code).toContain('GREEN');
    expect(code).toContain('BLUE');
  });

  it('merges allOf sub-schemas into the class', () => {
    const code = generatePojoFromOpenApi(
      spec({
        Base: {
          type: 'object',
          properties: { id: { type: 'integer' } },
        },
        Child: {
          allOf: [
            { $ref: '#/components/schemas/Base' },
            { type: 'object', properties: { label: { type: 'string' } } },
          ],
        },
      }),
    );
    expect(code).toContain('public class Child {');
    expect(code).toContain('private int id;');
    expect(code).toContain('private String label;');
  });

  it('uses Lombok annotations when useLombok is true (default)', () => {
    const code = generatePojoFromOpenApi(spec({ A: { type: 'object', properties: { x: { type: 'string' } } } }));
    expect(code).toContain('@Data');
    expect(code).toContain('@NoArgsConstructor');
    expect(code).toContain('@AllArgsConstructor');
    expect(code).toContain('@Builder');
    expect(code).toContain('import lombok.Data;');
  });

  it('omits Lombok and writes getters/setters when useLombok is false', () => {
    const code = generatePojoFromOpenApi(
      spec({ A: { type: 'object', properties: { x: { type: 'string' } } } }),
      { useLombok: false },
    );
    expect(code).not.toContain('@Data');
    expect(code).toContain('public String getX() {');
    expect(code).toContain('public void setX(String x) {');
  });

  it('adds @JsonInclude when includeMode is set, on all classes', () => {
    const code = generatePojoFromOpenApi(
      spec({
        A: { type: 'object', properties: { x: { type: 'string' } } },
        B: { type: 'object', properties: { y: { type: 'string' } } },
      }),
      { includeMode: 'NON_EMPTY' },
    );
    expect(code).toContain('@JsonInclude(JsonInclude.Include.NON_EMPTY)');
    expect(code).toContain('import com.fasterxml.jackson.annotation.JsonInclude;');
  });

  it('parses both YAML and JSON specs', () => {
    const yaml = spec({ A: { type: 'object', properties: { x: { type: 'string' } } } });
    // Build a JSON version directly
    const jsonSpec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'T', version: '1' },
      paths: {},
      components: { schemas: { A: { type: 'object', properties: { x: { type: 'string' } } } } },
    });
    const fromYaml = generatePojoFromOpenApi(yaml);
    const fromJson = generatePojoFromOpenApi(jsonSpec);
    expect(fromYaml).toContain('public class A {');
    expect(fromJson).toContain('public class A {');
    expect(fromYaml).toContain('private String x;');
    expect(fromJson).toContain('private String x;');
  });

  it('throws when no components.schemas present', () => {
    expect(() => generatePojoFromOpenApi('openapi: 3.0.0\ninfo:\n  title: T\n  version: 1\npaths: {}\n')).toThrow();
  });

  it('throws on unparseable input', () => {
    expect(() => generatePojoFromOpenApi('::: not yaml {')).toThrow();
  });
});
