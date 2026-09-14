import { generateController, EndpointSpec } from './controller-generator';

describe('generateController', () => {
  const base: EndpointSpec = {
    method: 'GET',
    path: '/users/{id}',
    params: [{ name: 'id', location: 'path', type: 'String' }],
    requestBody: null,
    returnType: 'User',
  };

  it('generates a @RestController class with a Mono return', () => {
    const code = generateController([base], 'UserController');
    expect(code).toContain('@RestController');
    expect(code).toContain('public class UserController');
    expect(code).toContain('Mono<User>');
    expect(code).toContain('@GetMapping("/users/{id}")');
    expect(code).toContain('@PathVariable("id") String id');
    expect(code).toContain('import org.springframework.web.bind.annotation.RestController;');
    expect(code).toContain('import org.springframework.web.bind.annotation.GetMapping;');
    expect(code).toContain('import org.springframework.web.bind.annotation.PathVariable;');
    expect(code).toContain('import reactor.core.publisher.Mono;');
  });

  it('generates POST with @RequestBody', () => {
    const ep: EndpointSpec = {
      method: 'POST',
      path: '/users',
      params: [],
      requestBody: { name: 'user', type: 'User' },
      returnType: 'User',
    };
    const code = generateController([ep], 'UserController');
    expect(code).toContain('@PostMapping("/users")');
    expect(code).toContain('@RequestBody User user');
    expect(code).toContain('import org.springframework.web.bind.annotation.PostMapping;');
    expect(code).toContain('import org.springframework.web.bind.annotation.RequestBody;');
  });

  it('generates PUT, DELETE, PATCH, HEAD, OPTIONS, TRACE', () => {
    const code = generateController(
      [
        { method: 'PUT',    path: '/x', params: [], requestBody: null, returnType: 'T' },
        { method: 'DELETE', path: '/x', params: [], requestBody: null, returnType: 'Void' },
        { method: 'PATCH',  path: '/x', params: [], requestBody: null, returnType: 'T' },
        { method: 'HEAD',   path: '/x', params: [], requestBody: null, returnType: 'Void' },
        { method: 'OPTIONS',path: '/x', params: [], requestBody: null, returnType: 'Void' },
        { method: 'TRACE',  path: '/x', params: [], requestBody: null, returnType: 'Void' },
      ],
      'C',
    );
    expect(code).toContain('@PutMapping("/x")');
    expect(code).toContain('@DeleteMapping("/x")');
    expect(code).toContain('@PatchMapping("/x")');
    expect(code).toContain('@HeadMapping("/x")');
    expect(code).toContain('@OptionsMapping("/x")');
    expect(code).toContain('@RequestMapping(method = RequestMethod.TRACE, path = "/x")');
  });

  it('uses Flux when returnType already contains Flux', () => {
    const ep: EndpointSpec = {
      method: 'GET',
      path: '/users',
      params: [],
      requestBody: null,
      returnType: 'Flux<User>',
    };
    const code = generateController([ep], 'UserController');
    expect(code).toContain('Flux<User>');
    expect(code).toContain('import reactor.core.publisher.Flux;');
    expect(code).not.toContain('Mono<Flux<User>>');
  });

  it('wraps List<T> return in Flux', () => {
    const ep: EndpointSpec = {
      method: 'GET',
      path: '/users',
      params: [],
      requestBody: null,
      returnType: 'List<User>',
    };
    const code = generateController([ep], 'UserController');
    expect(code).toContain('Flux<User>');
    expect(code).toContain('import reactor.core.publisher.Flux;');
    expect(code).toContain('import java.util.List;');
  });

  it('wraps scalar return in Mono', () => {
    const ep: EndpointSpec = {
      method: 'GET',
      path: '/ping',
      params: [],
      requestBody: null,
      returnType: 'String',
    };
    const code = generateController([ep], 'PingController');
    expect(code).toContain('Mono<String>');
    expect(code).toContain('import reactor.core.publisher.Mono;');
  });

  it('handles query params and request headers', () => {
    const ep: EndpointSpec = {
      method: 'GET',
      path: '/search',
      params: [
        { name: 'q', location: 'query', type: 'String' },
        { name: 'X-Tenant', location: 'header', type: 'String' },
      ],
      requestBody: null,
      returnType: 'Result',
    };
    const code = generateController([ep], 'SearchController');
    expect(code).toContain('@RequestParam("q") String q');
    expect(code).toContain('@RequestHeader("X-Tenant") String X_Tenant');
    expect(code).toContain('import org.springframework.web.bind.annotation.RequestParam;');
    expect(code).toContain('import org.springframework.web.bind.annotation.RequestHeader;');
  });

  it('generates multiple endpoints in one class', () => {
    const code = generateController(
      [
        { method: 'GET',  path: '/a', params: [], requestBody: null, returnType: 'A' },
        { method: 'POST', path: '/b', params: [], requestBody: null, returnType: 'B' },
      ],
      'Multi',
    );
    expect(code).toContain('@GetMapping("/a")');
    expect(code).toContain('@PostMapping("/b")');
    expect(code.match(/@GetMapping|@PostMapping/g)!.length).toBe(2);
  });

  it('throws on empty endpoint list', () => {
    expect(() => generateController([], 'C')).toThrow();
  });

  it('throws on invalid HTTP method', () => {
    const bad = { method: 'FETCH' as any, path: '/x', params: [], requestBody: null, returnType: 'T' };
    expect(() => generateController([bad], 'C')).toThrow();
  });

  it('emits a class-level @RequestMapping when basePath is set', () => {
    const code = generateController([base], 'UserController', '/api/v1');
    expect(code).toContain('@RestController');
    expect(code).toContain('@RequestMapping("/api/v1")');
    expect(code).toContain('@GetMapping("/users/{id}")');
    expect(code).toContain('import org.springframework.web.bind.annotation.RequestMapping;');
  });

  it('strips a trailing slash from basePath', () => {
    const code = generateController([base], 'UserController', '/api/v1/');
    expect(code).toContain('@RequestMapping("/api/v1")');
  });

  it('omits @RequestMapping when basePath is empty', () => {
    const code = generateController([base], 'UserController', '');
    expect(code).not.toContain('@RequestMapping');
  });
});
