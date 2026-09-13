import { generateControllerFromOpenApi } from './openapi-controller-generator';

function doc(paths: Record<string, unknown>) {
  return {
    openapi: '3.0.0',
    info: { title: 'Petstore', version: '1.0.0' },
    paths,
    components: {
      schemas: {
        Pet: { type: 'object', properties: { name: { type: 'string' } } },
        Error: { type: 'object', properties: { message: { type: 'string' } } },
      },
    },
  };
}

describe('generateControllerFromOpenApi', () => {
  it('throws when there are no paths', () => {
    expect(() => generateControllerFromOpenApi({ openapi: '3.0.0', paths: {} })).toThrow(/no operations/i);
  });

  it('throws when the document is not an object', () => {
    expect(() => generateControllerFromOpenApi(null as unknown as object)).toThrow(/not an object/i);
  });

  it('generates a GET endpoint with @GetMapping', () => {
    const code = generateControllerFromOpenApi(
      doc({ '/pets': { get: { responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } } } } },
    );
    expect(code).toContain('@RestController');
    expect(code).toContain('@GetMapping("/pets")');
    expect(code).toContain('public Mono<Pet> getPets()');
    expect(code).toContain('import reactor.core.publisher.Mono;');
    expect(code).toContain('import org.springframework.web.bind.annotation.GetMapping;');
  });

  it('generates a POST with @RequestBody from $ref', () => {
    const code = generateControllerFromOpenApi(
      doc({
        '/pets': {
          post: {
            requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
            responses: { 201: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
          },
        },
      }),
    );
    expect(code).toContain('@PostMapping("/pets")');
    expect(code).toContain('@RequestBody Pet pet');
    expect(code).toContain('import org.springframework.web.bind.annotation.RequestBody;');
    expect(code).toContain('public Mono<Pet> createPets(@RequestBody Pet pet)');
  });

  it('generates a DELETE returning Mono<Void> when no response schema', () => {
    const code = generateControllerFromOpenApi(
      doc({ '/pets/{id}': { delete: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: {} } } } },
    );
    expect(code).toContain('@DeleteMapping("/pets/{id}")');
    expect(code).toContain('@PathVariable("id") String id');
    expect(code).toContain('public Mono<Void> deleteId(@PathVariable("id") String id)');
    expect(code).toContain('import org.springframework.web.bind.annotation.PathVariable;');
  });

  it('generates a list endpoint returning Flux<T>', () => {
    const code = generateControllerFromOpenApi(
      doc({
        '/pets': {
          get: {
            parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer' } }],
            responses: { 200: { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Pet' } } } } } },
          },
        },
      }),
    );
    expect(code).toContain('public Flux<Pet> getPets(@RequestParam("limit") int limit)');
    expect(code).toContain('import reactor.core.publisher.Flux;');
    expect(code).toContain('import org.springframework.web.bind.annotation.RequestParam;');
  });

  it('handles query params of $ref type using String fallback and multiple endpoints in one controller', () => {
    const code = generateControllerFromOpenApi(
      doc({
        '/pets': { get: { responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } } } },
        '/pets/{id}': { get: { parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } } } },
      }),
    );
    expect(code).toContain('public Mono<Pet> getPets()');
    expect(code).toContain('public Mono<Pet> getId(@PathVariable("id") String id)');
  });

  it('uses the info title to derive the controller class name', () => {
    const code = generateControllerFromOpenApi(
      doc({ '/x': { get: { responses: { 200: {} } } } }),
    );
    // "Petstore" -> "Petstore" controller
    expect(code).toContain('public class Petstore');
  });

  it('disambiguates colliding method names with a numeric suffix', () => {
    // Two different paths that both end in /items -> both would derive "getItems".
    const code = generateControllerFromOpenApi(
      doc({
        '/orders/items': { get: { responses: { 200: {} } } },
        '/invoices/items': { get: { responses: { 200: {} } } },
      }),
    );
    const matches = code.match(/public Mono<Void> (getItems\d*)\(/g) || [];
    expect(matches.length).toBe(2);
    expect(matches[0]).not.toEqual(matches[1]);
    expect(code).toContain('getItems');
    expect(code).toContain('getItems2');
  });
});
