import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { generatePojo } from '../../services/pojo-generator';

@Component({
  selector: 'app-pojo-converter',
  imports: [FormsModule],
  template: `
    <div class="container-fluid py-4">
      <div class="row g-4">
        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span class="fw-bold">JSON Input</span>
              <div class="d-flex align-items-center gap-2">
                <input
                  class="form-control form-control-sm"
                  style="width: 120px;"
                  [ngModel]="className()"
                  (ngModelChange)="className.set($event)"
                  placeholder="ClassName"
                />
                <select
                  class="form-select form-select-sm"
                  style="width: auto;"
                  [ngModel]=\"includeMode()\"
                  (ngModelChange)=\"includeMode.set($event)\"
                >
                  <option value=\"\">No @JsonInclude</option>
                  <option value=\"NON_NULL\">@JsonInclude(NON_NULL)</option>
                  <option value=\"NON_EMPTY\">@JsonInclude(NON_EMPTY)</option>
                </select>
                <label class="form-check-label small mb-0" for="useLombok">
                  <input
                    id="useLombok"
                    class="form-check-input"
                    type="checkbox"
                    [checked]="useLombok()"
                    (change)="useLombok.set(!useLombok())"
                  />
                  Lombok
                </label>
                <button
                  class="btn btn-primary btn-sm"
                  (click)="generate()"
                  [disabled]="!jsonInput().trim()"
                >
                  Generate
                </button>
              </div>
            </div>
            <div class="card-body d-flex flex-column">
              <textarea
                class="form-control font-monospace"
                rows="20"
                [(ngModel)]="jsonInput"
                placeholder='Paste your JSON object here…&#10;&#10;{ "id": 1, "name": "Alice" }'
              ></textarea>
              @if (error(); ) {
                <div class="alert alert-danger mt-3 mb-0">{{ error() }}</div>
              }
            </div>
          </div>
        </div>

        <div class="col-md-6">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-center">
              <span class="fw-bold">Generated POJO</span>
              <button
                class="btn btn-outline-secondary btn-sm"
                (click)="copyCode()"
                [disabled]="!generatedCode()"
              >
                Copy
              </button>
            </div>
            <div class="card-body d-flex">
              <pre
                class="mb-0 bg-dark text-light p-3 rounded overflow-auto w-100"
                style="max-height: calc(100vh - 200px);"
              >{{ generatedCode() || '// Click Generate to see the POJO here' }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [],
})
export class PojoConverter {
  protected readonly jsonInput = signal('');
  protected readonly generatedCode = signal('');
  protected readonly error = signal('');
  protected readonly includeMode = signal<'' | 'NON_NULL' | 'NON_EMPTY'>('');
  protected readonly useLombok = signal(true);
  protected readonly className = signal('MyClass');

  generate(): void {
    this.error.set('');
    try {
      const code = generatePojo(this.jsonInput(), this.className(), {
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
