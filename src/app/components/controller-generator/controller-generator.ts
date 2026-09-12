import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  EndpointSpec, HttpMethod, ParamLocation,
  generateController,
} from '../../services/controller-generator';

interface ParamRow {
  name: string;
  location: ParamLocation;
  type: string;
}

interface EndpointRow {
  id: number;
  method: HttpMethod;
  path: string;
  params: ParamRow[];
  hasBody: boolean;
  bodyName: string;
  bodyType: string;
  returnType: string;
}

const HTTP_METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'TRACE'];

@Component({
  selector: 'app-controller-generator',
  imports: [FormsModule],
  template: `
    <div class="container-fluid py-4">
      <div class="row g-4">
        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span class="fw-bold">Endpoints</span>
              <div class="d-flex align-items-center gap-2">
                <input
                  class="form-control form-control-sm"
                  style="width: 140px;"
                  [ngModel]="className()"
                  (ngModelChange)="className.set($event)"
                  placeholder="ClassName"
                />
                <button class="btn btn-primary btn-sm" (click)="addEndpoint()">+ Endpoint</button>
              </div>
            </div>
            <div class="card-body">
              @if (endpoints().length === 0) {
                <p class="text-muted mb-0">Click "+ Endpoint" to add your first endpoint.</p>
              }
              @for (ep of endpoints(); track ep.id) {
                <div class="card mb-3">
                  <div class="card-body">
                    <div class="row g-2 mb-2">
                      <div class="col-4">
                        <label class="form-label small mb-1">Method</label>
                        <select class="form-select form-select-sm"
                                [ngModel]="ep.method"
                                (ngModelChange)="ep.method = $event">
                          @for (m of httpMethods; track m) {
                            <option [value]="m">{{ m }}</option>
                          }
                        </select>
                      </div>
                      <div class="col-8">
                        <label class="form-label small mb-1">Path</label>
                        <input class="form-control form-control-sm"
                               [ngModel]="ep.path"
                               (ngModelChange)="ep.path = $event"
                               placeholder="/users/{id}" />
                      </div>
                    </div>

                    <label class="form-label small mb-1">Parameters</label>
                    @for (p of ep.params; track $index) {
                      <div class="row g-2 mb-1">
                        <div class="col-5">
                          <input class="form-control form-control-sm" placeholder="name"
                                 [ngModel]="p.name" (ngModelChange)="p.name = $event" />
                        </div>
                        <div class="col-4">
                          <select class="form-select form-select-sm"
                                  [ngModel]="p.location" (ngModelChange)="p.location = $event">
                            <option value="path">path</option>
                            <option value="query">query</option>
                            <option value="header">header</option>
                          </select>
                        </div>
                        <div class="col-3">
                          <input class="form-control form-control-sm" placeholder="type (e.g. String)"
                                 [ngModel]="p.type" (ngModelChange)="p.type = $event" />
                        </div>
                        <div class="col-12 d-flex justify-content-end">
                          <button class="btn btn-outline-danger btn-sm" (click)="removeParam(ep, $index)">Remove</button>
                        </div>
                      </div>
                    }
                    <button class="btn btn-outline-secondary btn-sm mb-2" (click)="addParam(ep)">+ Param</button>

                    <div class="form-check mb-2">
                      <input type="checkbox" class="form-check-input" [id]="'body' + ep.id"
                             [checked]="ep.hasBody"
                             (change)="ep.hasBody = !ep.hasBody" />
                      <label class="form-check-label small" [for]="'body' + ep.id">Request body</label>
                    </div>
                    @if (ep.hasBody) {
                      <div class="row g-2 mb-2">
                        <div class="col-6">
                          <label class="form-label small mb-1">Body name</label>
                          <input class="form-control form-control-sm" [ngModel]="ep.bodyName"
                                 (ngModelChange)="ep.bodyName = $event" placeholder="body" />
                        </div>
                        <div class="col-6">
                          <label class="form-label small mb-1">Body type</label>
                          <input class="form-control form-control-sm" [ngModel]="ep.bodyType"
                                 (ngModelChange)="ep.bodyType = $event" placeholder="User" />
                        </div>
                      </div>
                    }

                    <div class="row g-2 mb-2">
                      <div class="col-12">
                        <label class="form-label small mb-1">Return type (Java, e.g. User, List&lt;User&gt;, Mono&lt;User&gt;)</label>
                        <input class="form-control form-control-sm" [ngModel]="ep.returnType"
                               (ngModelChange)="ep.returnType = $event" placeholder="User" />
                      </div>
                    </div>

                    <button class="btn btn-outline-danger btn-sm" (click)="removeEndpoint(ep.id)">Remove endpoint</button>
                  </div>
                </div>
              }
            </div>
            <div class="card-footer d-flex justify-content-between align-items-center">
              @if (error(); ) {
                <span class="text-danger small">{{ error() }}</span>
              } @else {
                <span class="text-muted small">Ready</span>
              }
              <button class="btn btn-primary" (click)="generate()" [disabled]="endpoints().length === 0">
                Generate
              </button>
            </div>
          </div>
        </div>

        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span class="fw-bold">Generated Controller</span>
              <button class="btn btn-outline-secondary btn-sm" (click)="copyCode()" [disabled]="!generatedCode()">Copy</button>
            </div>
            <div class="card-body d-flex">
              <pre class="mb-0 bg-dark text-light p-3 rounded overflow-auto w-100"
                   style="max-height: calc(100vh - 200px);">
{{ generatedCode() || '// Click Generate to see the controller here' }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [],
})
export class ControllerGenerator {
  protected readonly className = signal('MyController');
  protected readonly error = signal('');
  protected readonly generatedCode = signal('');
  protected readonly httpMethods = HTTP_METHODS;

  private nextId = 0;
  protected readonly endpoints = signal<EndpointRow[]>([]);

  private newEndpoint(): EndpointRow {
    this.nextId++;
    return {
      id: this.nextId,
      method: 'GET',
      path: '',
      params: [],
      hasBody: false,
      bodyName: 'body',
      bodyType: 'Object',
      returnType: '',
    };
  }

  addEndpoint(): void {
    this.endpoints.update((eps) => [...eps, this.newEndpoint()]);
  }

  removeEndpoint(id: number): void {
    this.endpoints.update((eps) => eps.filter((e) => e.id !== id));
  }

  addParam(ep: EndpointRow): void {
    ep.params.push({ name: '', location: 'query', type: 'String' });
  }

  removeParam(ep: EndpointRow, index: number): void {
    ep.params.splice(index, 1);
  }

  private toSpecs(): EndpointSpec[] {
    return this.endpoints().map((ep) => ({
      method: ep.method,
      path: ep.path || '/',
      params: ep.params
        .filter((p) => p.name.trim() !== '')
        .map((p) => ({
          name: p.name.trim(),
          location: p.location,
          type: p.type.trim() || 'String',
        })),
      requestBody: ep.hasBody
        ? { name: ep.bodyName.trim() || 'body', type: ep.bodyType.trim() || 'Object' }
        : null,
      returnType: ep.returnType.trim() || 'Void',
    }));
  }

  generate(): void {
    this.error.set('');
    try {
      const code = generateController(this.toSpecs(), this.className() || 'MyController');
      this.generatedCode.set(code);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Unknown error');
      this.generatedCode.set('');
    }
  }

  async copyCode(): Promise<void> {
    if (this.generatedCode()) {
      await navigator.clipboard.writeText(this.generatedCode());
    }
  }
}
