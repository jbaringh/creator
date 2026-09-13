import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { generatePojoFromOpenApi } from '../../services/openapi-generator';
import { NullIncludeMode } from '../../services/pojo-generator';
import { CodeMirrorEditor, EditorLanguage } from '../code-editor/code-editor';

const SAMPLE_SPEC = `openapi: 3.0.0
info:
  title: Sample
  version: 1.0.0
paths: {}
components:
  schemas:
    Order:
      type: object
      properties:
        id:
          type: integer
          format: int64
        total:
          type: number
          format: double
        status:
          type: string
          enum: [PENDING, SHIPPED, DELIVERED]
        placedAt:
          type: string
          format: date-time
        customer:
          $ref: '#/components/schemas/Customer'
        items:
          type: array
          items:
            $ref: '#/components/schemas/OrderItem'
    Customer:
      type: object
      properties:
        name:
          type: string
        address:
          type: object
          properties:
            city:
              type: string
            zip:
              type: string
    OrderItem:
      type: object
      properties:
        sku:
          type: string
        quantity:
          type: integer
`;

@Component({
  selector: 'app-openapi-converter',
  imports: [FormsModule, CodeMirrorEditor],
  template: `
    <div class="container-fluid py-4">
      <div class="row g-4">
        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span class="fw-bold">OpenAPI Schema (YAML or JSON)</span>
              <div class="d-flex align-items-center gap-2">
                <select
                  class="form-select form-select-sm"
                  style="width: auto;"
                  [ngModel]="includeMode()"
                  (ngModelChange)="includeMode.set($event)"
                >
                  <option value="">No @JsonInclude</option>
                  <option value="NON_NULL">@JsonInclude(NON_NULL)</option>
                  <option value="NON_EMPTY">@JsonInclude(NON_EMPTY)</option>
                </select>
                <label class="form-check-label small mb-0" for="useLombok2">
                  <input
                    id="useLombok2"
                    class="form-check-input"
                    type="checkbox"
                    [checked]="useLombok()"
                    (change)="useLombok.set(!useLombok())"
                  />
                  Lombok
                </label>
                <button
                  class="btn btn-outline-secondary btn-sm"
                  (click)="loadSample()"
                >
                  Load sample
                </button>
                <button
                  class="btn btn-primary btn-sm"
                  (click)="generate()"
                  [disabled]="!specInput().trim()"
                >
                  Generate
                </button>
              </div>
            </div>
            <div class="card-body d-flex flex-column">
              <app-code-editor
                [code]="specInput()"
                (codeChange)="specInput.set($event)"
                [language]="'yaml'"
                [readOnly]="false"
              ></app-code-editor>
              @if (error(); ) {
                <div class="alert alert-danger mt-3 mb-0">{{ error() }}</div>
              }
            </div>
          </div>
        </div>

        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span class="fw-bold">Generated POJOs</span>
              <button
                class="btn btn-outline-secondary btn-sm"
                (click)="copyCode()"
                [disabled]="!generatedCode()"
              >
                Copy
              </button>
            </div>
            <div class="card-body d-flex">
              <app-code-editor
                [code]="generatedCode() || '// Click Generate to see the POJOs here'"
                [language]="'java'"
                [readOnly]="true"
              ></app-code-editor>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [],
})
export class OpenApiConverter {
  protected readonly specInput = signal('');
  protected readonly generatedCode = signal('');
  protected readonly error = signal('');
  protected readonly includeMode = signal<'' | NullIncludeMode>('');
  protected readonly useLombok = signal(true);
  protected readonly sample = SAMPLE_SPEC;

  loadSample(): void {
    this.specInput.set(this.sample);
  }

  generate(): void {
    this.error.set('');
    try {
      const code = generatePojoFromOpenApi(this.specInput(), {
        includeMode: this.includeMode() || undefined,
        useLombok: this.useLombok(),
      });
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
