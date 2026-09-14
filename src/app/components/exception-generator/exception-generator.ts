import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { generateExceptionClass } from '../../services/exception-generator';
import { GenerationHistoryService } from '../../services/generation-history.service';
import { CodeMirrorEditor } from '../code-editor/code-editor';

interface FieldRow {
  id: number;
  name: string;
  type: string;
}

@Component({
  selector: 'app-exception-generator',
  imports: [FormsModule, CodeMirrorEditor],
  template: `
    <div class="container-fluid py-4">
      <div class="row g-4">
        <div class="col-md-5">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span class="fw-bold">Custom Exception</span>
              <button class="btn btn-primary btn-sm" (click)="generate()" [disabled]="!className().trim()">
                Generate
              </button>
            </div>
            <div class="card-body d-flex flex-column gap-3">
              <div>
                <label class="form-label small mb-1">Exception class name</label>
                <input class="form-control form-control-sm"
                       [ngModel]="className()" (ngModelChange)="className.set($event)"
                       placeholder="UserNotFoundException" />
              </div>

              <div>
                <label class="form-label small mb-1">Extends (default: RuntimeException)</label>
                <input class="form-control form-control-sm"
                       [ngModel]="extendsType()" (ngModelChange)="extendsType.set($event)"
                       placeholder="RuntimeException" />
              </div>

              <div class="form-check">
                <input id="exceptionLombok" class="form-check-input" type="checkbox"
                       [checked]="useLombok()" (change)="useLombok.set(!useLombok())" />
                <label class="form-check-label small" for="exceptionLombok">
                  Lombok (@Getter for payload fields)
                </label>
              </div>

              <div class="d-flex justify-content-between align-items-center">
                <span class="fw-semibold small">Payload fields (optional)</span>
                <button class="btn btn-outline-primary btn-sm" (click)="addField()">+ Field</button>
              </div>

              @if (fields().length === 0) {
                <p class="text-muted small mb-0">No payload fields — only the standard constructors are generated.</p>
              }
              @for (f of fields(); track f.id) {
                <div class="row g-2 mb-1">
                  <div class="col-6">
                    <input class="form-control form-control-sm" placeholder="name"
                           [ngModel]="f.name" (ngModelChange)="f.name = $event" />
                  </div>
                  <div class="col-4">
                    <input class="form-control form-control-sm" placeholder="type (e.g. String)"
                           [ngModel]="f.type" (ngModelChange)="f.type = $event" />
                  </div>
                  <div class="col-2 d-flex align-items-center">
                    <button class="btn btn-outline-danger btn-sm" (click)="removeField(f.id)">Remove</button>
                  </div>
                </div>
              }

              @if (error(); ) {
                <div class="alert alert-danger mt-2 mb-0">{{ error() }}</div>
              }
            </div>
          </div>
        </div>

        <div class="col-md-7">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span class="fw-bold">Generated Exception</span>
              <button class="btn btn-outline-secondary btn-sm" (click)="copyCode()" [disabled]="!generatedCode()">Copy</button>
            </div>
            <div class="card-body d-flex">
              <app-code-editor
                [code]="generatedCode() || '// Enter a class name and click Generate'"
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
export class ExceptionGenerator {
  protected readonly className = signal('');
  protected readonly extendsType = signal('');
  protected readonly useLombok = signal(true);
  protected readonly error = signal('');
  protected readonly generatedCode = signal('');

  private nextId = 0;
  protected readonly fields = signal<FieldRow[]>([]);

  constructor(private readonly history: GenerationHistoryService) {}

  addField(): void {
    this.nextId++;
    this.fields.update((fs) => [...fs, { id: this.nextId, name: '', type: 'String' }]);
  }

  removeField(id: number): void {
    this.fields.update((fs) => fs.filter((f) => f.id !== id));
  }

  generate(): void {
    this.error.set('');
    try {
      const code = generateExceptionClass({
        name: this.className(),
        extendsType: this.extendsType() || undefined,
        fields: this.fields().map((f) => ({ name: f.name, type: f.type })),
        useLombok: this.useLombok(),
      });
      this.generatedCode.set(code);
      this.history.add('exception', this.describeInput(), [
        { label: this.className().trim() || 'Exception', code },
      ]);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Unknown error');
      this.generatedCode.set('');
    }
  }

  private describeInput(): string {
    const fields = this.fields()
      .filter((f) => f.name.trim() !== '')
      .map((f) => `${f.type.trim() || 'String'} ${f.name.trim()}`);
    const lines = [
      `class ${this.className().trim() || 'Exception'} extends ${this.extendsType().trim() || 'RuntimeException'}`,
    ];
    if (fields.length) lines.push(`fields: ${fields.join(', ')}`);
    return lines.join('\n');
  }

  async copyCode(): Promise<void> {
    if (this.generatedCode()) {
      await navigator.clipboard.writeText(this.generatedCode());
    }
  }
}
