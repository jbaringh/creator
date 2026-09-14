import { Component, inject } from '@angular/core';
import {
  GenerationHistoryService,
  GenerationRecord,
} from '../../services/generation-history.service';
import { CodeMirrorEditor } from '../code-editor/code-editor';

const PAGE_BADGE: Record<string, string> = {
  pojo: 'bg-primary',
  openapi: 'bg-success',
  controller: 'bg-warning text-dark',
  'openapi-full': 'bg-info text-dark',
  'controller-advice': 'bg-danger text-white',
  exception: 'bg-secondary text-white',
};

@Component({
  selector: 'app-generations-history',
  imports: [CodeMirrorEditor],
  template: `
    <div class="container-fluid py-4">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <span class="fw-bold">Generation History ({{ service.records().length }})</span>
        <button
          class="btn btn-outline-danger btn-sm"
          (click)="clearAll()"
          [disabled]="service.records().length === 0"
        >
          Clear all
        </button>
      </div>

      @if (service.records().length === 0; ) {
        <div class="alert alert-secondary">
          No generations yet. Use any generator page and click Generate — each result will
          appear here.
        </div>
      } @else {
        <div class="d-flex flex-column gap-3">
          @for (rec of service.records(); track rec.id) {
            <div class="card">
              <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div class="d-flex align-items-center gap-2 flex-wrap">
                  <span class="badge {{ badge(rec.page) }}">{{ service.pageLabel(rec.page) }}</span>
                  <span class="text-muted small">{{ formatTime(rec.createdAt) }}</span>
                </div>
                <button class="btn btn-outline-danger btn-sm" (click)="remove(rec)">Remove</button>
              </div>
              <div class="card-body">
                <div class="row g-4">
                  <div class="col-md-6">
                    <div class="d-flex flex-column gap-1 h-100">
                      <span class="fw-semibold small">Input</span>
                      <app-code-editor
                        [code]="rec.input"
                        [language]="'text'"
                        [readOnly]="true"
                      ></app-code-editor>
                    </div>
                  </div>
                  <div class="col-md-6">
                    <div class="d-flex flex-column gap-3">
                      @for (out of rec.outputs; track $index) {
                        <div class="d-flex flex-column gap-1">
                          <div class="d-flex justify-content-between align-items-center">
                            <span class="fw-semibold small">{{ out.label }}</span>
                            <button class="btn btn-outline-secondary btn-sm" (click)="copy(out.code)">
                              Copy
                            </button>
                          </div>
                          <app-code-editor
                            [code]="out.code"
                            [language]="'java'"
                            [readOnly]="true"
                          ></app-code-editor>
                        </div>
                      }
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [],
})
export class GenerationsHistory {
  protected readonly service = inject(GenerationHistoryService);

  protected badge(page: string): string {
    return PAGE_BADGE[page] ?? 'bg-secondary';
  }

  protected formatTime(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  protected remove(rec: GenerationRecord): void {
    this.service.remove(rec.id);
  }

  protected clearAll(): void {
    if (confirm('Clear the entire generation history?')) {
      this.service.clear();
    }
  }

  protected async copy(code: string): Promise<void> {
    await navigator.clipboard.writeText(code);
  }
}
