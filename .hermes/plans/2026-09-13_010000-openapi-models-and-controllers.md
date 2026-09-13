# Plan: OpenAPI → Java models + controllers page

## Goal
A new page where a full OpenAPI 3.x document (YAML or JSON) is pasted/imported and the
app generates **both** Java models (one class per `components.schemas`) and a Spring WebFlux
**controller** (one method per `paths` operation). Reuses the existing model generator
(`openapi-generator.ts`) and the controller style (`controller-generator.ts`).

## Tasks
1. Failing tests for `generateControllerFromOpenApi(doc)`.
2. Implement the OpenAPI→controller generator.
3. Page component `openapi-full-converter`: input pane + Models/Controllers output panes,
   options (Lombok, @JsonInclude), Load sample + Import file + Generate + per-pane Copy.
4. Route `openapi-full` + nav link "OpenAPI → Models & Controllers".
5. Build + test + browser E2E. Commit.

## Controller rules (from `paths`)
- One method per (path, operation). Method name from the path's last segment + verb.
- Path params → `@PathVariable("name") Type name`.
- Query params → `@RequestParam("name") String name` (type from schema if a named ref, else String).
- `requestBody.content.*.schema.$ref` → `@RequestBody TypeName name`.
- 200/201 response `content.*.schema.$ref` → `Mono<RefName>`; array item `$ref` → `Flux<RefName>`;
  no schema → `Mono<Void>`.
- WebFlux return types (Mono/Flux), Spring `@*Mapping`, `@RestController`, sorted imports.
- Method-name collisions across paths: disambiguate by suffixing a counter.
