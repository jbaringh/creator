import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { generateControllerAdvice } from '../../services/controller-advice-generator';
import { GenerationHistoryService } from '../../services/generation-history.service';
import { CodeMirrorEditor } from '../code-editor/code-editor';

interface HandlerRow {
  id: number;
  exceptionType: string;
  status: string;
  bodyType: string;
  bodyExpression: string;
}

const COMMON_STATUSES = ['200', '201', '400', '401', '403', '404', '409', '415', '422', '429', '500', '503'];

@Component({
  selector: 'app-controller-advice-generator',
  imports: [FormsModule, CodeMirrorEditor],
  template: `
    <div class="container-fluid py-4">
      <div class="row g-4">
        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span class="fw-bold">ControllerAdvice</span>
              <div class="d-flex align-items-center gap-2">
                <button class="btn btn-primary btn-sm" (click)="generate()" [disabled]="handlers().length === 0">
                  Generate
                </button>
              </div>
            </div>
            <div class="card-body d-flex flex-column gap-3">
              <div class="row g-2">
                <div class="col-12">
                  <label class="form-label small mb-1">Class name</label>
                  <input class="form-control form-control-sm"
                         [ngModel]="className()" (ngModelChange)="className.set($event)"
                         placeholder="GlobalExceptionHandler" />
                </div>
              </div>

              <div class="row g-2">
                <div class="col-12">
                  <label class="form-label small mb-1">Base packages (optional, comma-separated)</label>
                  <input class="form-control form-control-sm"
                         [ngModel]="basePackagesInput()" (ngModelChange)="basePackagesInput.set($event)"
                         placeholder="com.example.a, com.example.b" />
                </div>
              </div>

              <div class="d-flex justify-content-between align-items-center">
                <span class="fw-semibold small">Exception handlers</span>
                <button class="btn btn-outline-primary btn-sm" (click)="addHandler()">+ Handler</button>
              </div>

              @if (handlers().length === 0) {
                <p class="text-muted small mb-0">Click "+ Handler" to add your first exception handler.</p>
              }
              @for (h of handlers(); track h.id) {
                <div class="card">
                  <div class="card-body">
                    <div class="row g-2 mb-2">
                      <div class="col-5">
                        <label class="form-label small mb-1">Exception type</label>
                        <input class="form-control form-control-sm"
                               [ngModel]="h.exceptionType" (ngModelChange)="h.exceptionType = $event"
                               placeholder="IllegalArgumentException" />
                      </div>
                      <div class="col-3">
                        <label class="form-label small mb-1">Status</label>
                        <input class="form-control form-control-sm" list="commonStatuses"
                               [ngModel]="h.status" (ngModelChange)="h.status = $event" placeholder="400" />
                      </div>
                      <div class="col-4">
                        <label class="form-label small mb-1">Body type</label>
                        <input class="form-control form-control-sm"
                               [ngModel]="h.bodyType" (ngModelChange)="h.bodyType = $event" placeholder="String" />
                      </div>
                    </div>
                    <div class="row g-2 mb-2">
                      <div class="col-12">
                        <label class="form-label small mb-1">Body expression (optional, for String bodies)</label>
                        <input class="form-control form-control-sm"
                               [ngModel]="h.bodyExpression" (ngModelChange)="h.bodyExpression = $event"
                               placeholder='"An unexpected error occurred: " + ex.getMessage()' />
                      </div>
                    </div>
                    <button class="btn btn-outline-danger btn-sm" (click)="removeHandler(h.id)">Remove</button>
                  </div>
                </div>
              }
              <datalist id="commonStatuses">
                @for (s of commonStatuses; track s) {
                  <option [value]="s"></option>
                }
              </datalist>

              @if (error(); ) {
                <div class="alert alert-danger mt-2 mb-0">{{ error() }}</div>
              }
            </div>
          </div>
        </div>

        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span class="fw-bold">Generated @ControllerAdvice</span>
              <button class="btn btn-outline-secondary btn-sm" (click)="copyCode()" [disabled]="!generatedCode()">Copy</button>
            </div>
            <div class="card-body d-flex">
              <app-code-editor class="w-100"
                [code]="generatedCode() || '// Click Generate to see the advice class here'"
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
export class ControllerAdviceGenerator {
  protected readonly className = signal('GlobalExceptionHandler');
  protected readonly basePackagesInput = signal('');
  protected readonly commonStatuses = COMMON_STATUSES;
  protected readonly error = signal('');
  protected readonly generatedCode = signal('');

  private nextId = 0;
  protected readonly handlers = signal<HandlerRow[]>([]);

  constructor(private readonly history: GenerationHistoryService) {}

  private newHandler(): HandlerRow {
    this.nextId++;
    return { id: this.nextId, exceptionType: '', status: '500', bodyType: 'String', bodyExpression: '' };
  }

  addHandler(): void {
    this.handlers.update((hs) => [...hs, this.newHandler()]);
  }

  removeHandler(id: number): void {
    this.handlers.update((hs) => hs.filter((h) => h.id !== id));
  }

  private basePackages(): string[] {
    return this.basePackagesInput()
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p !== '');
  }

  generate(): void {
    this.error.set('');
    try {
      const code = generateControllerAdvice({
        className: this.className(),
        basePackages: this.basePackages(),
        handlers: this.handlers().map((h) => ({
          exceptionType: h.exceptionType,
          status: h.status,
          bodyType: h.bodyType,
          bodyExpression: h.bodyExpression,
        })),
      });
      this.generatedCode.set(code);
      this.history.add('controller-advice', this.describeInput(), [
        { label: this.className() || 'ControllerAdvice', code },
      ]);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'Unknown error');
      this.generatedCode.set('');
    }
  }

  private describeInput(): string {
    const lines = [
      `@ControllerAdvice${this.basePackages().length ? `(basePackages = ${this.basePackages().join(', ')})` : ''}`,
      `public class ${this.className() || 'ControllerAdvice'}`,
    ];
    for (const h of this.handlers()) {
      const expr = h.bodyType.trim() === 'String' && h.bodyExpression.trim() ? ` body=${h.bodyExpression.trim()}` : '';
      lines.push(`${h.exceptionType || 'Exception'} -> ${h.status || '500'} ${h.bodyType || 'String'}${expr}`);
    }
    return lines.join('\n');
  }

  async copyCode(): Promise<void> {
    if (this.generatedCode()) {
      await navigator.clipboard.writeText(this.generatedCode());
    }
  }
}
