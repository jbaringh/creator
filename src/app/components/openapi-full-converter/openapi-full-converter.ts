import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  GeneratedOpenApiClass,
  generatePojoClassesFromOpenApi,
} from '../../services/openapi-generator';
import { generateControllerFromOpenApi } from '../../services/openapi-controller-generator';
import { NullIncludeMode } from '../../services/pojo-generator';
import { GenerationHistoryService } from '../../services/generation-history.service';
import { CodeMirrorEditor, EditorLanguage } from '../code-editor/code-editor';

const SAMPLE_SPEC = `openapi: 3.0.0
info:
  title: Petstore
  version: 1.0.0
paths:
  /pets:
    get:
      summary: List pets
      parameters:
        - name: limit
          in: query
          schema:
            type: integer
      responses:
        '200':
          description: A list of pets
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Pet'
    post:
      summary: Create a pet
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Pet'
      responses:
        '201':
          description: Created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pet'
  /pets/{id}:
    get:
      summary: Get one pet
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: A pet
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Pet'
    delete:
      summary: Delete a pet
      parameters:
        - name: id
          in: path
          required: true
          schema:
            type: string
      responses:
        '204':
          description: Deleted
components:
  schemas:
    Pet:
      type: object
      required: [name]
      properties:
        id:
          type: string
          format: uuid
        name:
          type: string
        age:
          type: integer
        tags:
          type: array
          items:
            type: string
`;

export interface ModelCard {
  name: string;
  imports: string[];
  code: string;
}

@Component({
  selector: 'app-openapi-full-converter',
  imports: [FormsModule, CodeMirrorEditor],
  template: `
    <div class="container-fluid py-4">
      <div class="row g-4">
        <div class="col-md-6">
          <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span class="fw-bold">OpenAPI Document</span>
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <select
                  class="form-select form-select-sm"
                  style="width: auto;"
                  [ngModel]="includeMode()"
                  (ngModelChange)="includeMode.set($event)"
                >
                  <option value="">No @JsonInclude</option>
                  <option value="NON_NULL">@JsonInclude (NON_NULL)</option>
                  <option value="NON_EMPTY">@JsonInclude (NON_EMPTY)</option>
                </select>
                <label class="form-check-label small mb-0" for="useLombok3">
                  <input
                    id="useLombok3"
                    class="form-check-input"
                    type="checkbox"
                    [checked]="useLombok()"
                    (change)="useLombok.set(!useLombok())"
                  />
                  Lombok
                </label>
              </div>
            </div>
            <div class="card-body d-flex flex-column">
              <div class="d-flex gap-2 mb-2">
                <button class="btn btn-outline-secondary btn-sm flex-fill" (click)="loadSample()">
                  Load sample
                </button>
                <button class="btn btn-outline-secondary btn-sm flex-fill" (click)="importFile()">
                  Import file
                </button>
                <button
                  class="btn btn-primary btn-sm flex-fill"
                  (click)="generate()"
                  [disabled]="!specInput().trim()"
                >
                  Generate
                </button>
              </div>
              <input
                id="fullOpenapiFileInput"
                type="file"
                accept=".yaml,.yml,.json,application/json"
                class="d-none"
                (change)="onFileSelected($event)"
              />
              <app-code-editor
                [code]="specInput()"
                (codeChange)="specInput.set($event)"
                [language]="'yaml'"
                [readOnly]="false"
              ></app-code-editor>
              @if (error(); ) {
                <div class="alert alert-danger mt-2 mb-0">{{ error() }}</div>
              }
            </div>
          </div>
        </div>

        <div class="col-md-6">
          <div class="d-flex flex-column gap-4">
            <div class="card">
              <div class="card-header d-flex justify-content-between align-items-center">
                <span class="fw-bold">Java Models</span>
                <button
                  class="btn btn-outline-secondary btn-sm"
                  (click)="copyAllModels()"
                  [disabled]="!models().length"
                >
                  Copy all
                </button>
              </div>
              <div class="card-body d-flex flex-column gap-3">
                @if (models().length === 0; ) {
                  <div class="d-flex flex-column gap-1">
                    <app-code-editor
                      [code]="'// Click Generate to see the models here'"
                      [language]="'java'"
                      [readOnly]="true"
                    ></app-code-editor>
                  </div>
                } @else {
                  @for (m of models(); track m.name) {
                    <div class="d-flex flex-column gap-1">
                      <div class="d-flex justify-content-between align-items-center">
                        <span class="fw-semibold small">{{ m.name }}</span>
                        <button class="btn btn-outline-secondary btn-sm" (click)="copyModel(m)">
                          Copy
                        </button>
                      </div>
                      <app-code-editor
                        [code]="m.code"
                        [language]="'java'"
                        [readOnly]="true"
                      ></app-code-editor>
                    </div>
                  }
                }
              </div>
            </div>

            <div class="card">
              <div class="card-header d-flex justify-content-between align-items-center">
                <span class="fw-bold">WebFlux Controller</span>
                <button
                  class="btn btn-outline-secondary btn-sm"
                  (click)="copyControllers()"
                  [disabled]="!controllerCode()"
                >
                  Copy
                </button>
              </div>
              <div class="card-body d-flex">
                <app-code-editor class="w-100"
                                 [code]="controllerCode() || '// Click Generate to see the controller here'"
                                 [language]="'java'"
                                 [readOnly]="true"
                ></app-code-editor>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [],
})
export class OpenApiFullConverter {
  protected readonly specInput = signal('');
  protected readonly models = signal<ModelCard[]>([]);
  protected readonly controllerCode = signal('');
  protected readonly error = signal('');
  protected readonly includeMode = signal<'' | NullIncludeMode>('');
  protected readonly useLombok = signal(true);
  protected readonly sample = SAMPLE_SPEC;

  constructor(private readonly history: GenerationHistoryService) {}

  loadSample(): void {
    this.specInput.set(this.sample);
  }

  importFile(): void {
    const el = document.getElementById('fullOpenapiFileInput') as HTMLInputElement | null;
    el?.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => this.specInput.set(String(reader.result ?? ''));
    reader.onerror = () => this.error.set('Could not read the file');
    reader.readAsText(file);
    input.value = '';
  }

  generate(): void {
    this.error.set('');
    try {
      const generated = generatePojoClassesFromOpenApi(this.specInput(), {
        includeMode: this.includeMode() || undefined,
        useLombok: this.useLombok(),
      });
      this.models.set(
        generated.map((c) => ({
          name: c.name,
          imports: c.imports,
          code: this.renderFile(c),
        })),
      );
      this.controllerCode.set(generateControllerFromOpenApi(this.specInput()));
      this.history.add('openapi-full', this.specInput(), [
        ...this.models().map((m) => ({ label: m.name, code: m.code })),
        { label: 'Controller', code: this.controllerCode() },
      ]);
    } catch (e) {
      this.models.set([]);
      this.controllerCode.set('');
      this.error.set(e instanceof Error ? e.message : 'Unknown error');
    }
  }

  private renderFile(c: GeneratedOpenApiClass): string {
    const importLines = c.imports.map((i) => `import ${i};`).join('\n');
    return `${importLines}\n\n${c.body}`;
  }

  async copyModel(m: ModelCard): Promise<void> {
    await navigator.clipboard.writeText(m.code);
  }

  async copyAllModels(): Promise<void> {
    const all = this.models().map((m) => m.code).join('\n\n');
    await navigator.clipboard.writeText(all);
  }

  async copyControllers(): Promise<void> {
    if (this.controllerCode()) await navigator.clipboard.writeText(this.controllerCode());
  }
}
