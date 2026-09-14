import { Injectable, signal } from '@angular/core';

export type GeneratorPage = 'pojo' | 'openapi' | 'controller' | 'openapi-full' | 'controller-advice' | 'exception';

export interface GenerationOutput {
  label: string;
  code: string;
}

export interface GenerationRecord {
  id: string;
  createdAt: string; // ISO timestamp
  page: GeneratorPage;
  input: string;
  outputs: GenerationOutput[];
}

const STORAGE_KEY = 'pojo3.generation-history';
const MAX_RECORDS = 200;

const PAGE_LABELS: Record<GeneratorPage, string> = {
  pojo: 'JSON → POJO',
  openapi: 'OpenAPI → POJO',
  controller: 'WebFlux Controller',
  'openapi-full': 'OpenAPI → Full',
  'controller-advice': 'ControllerAdvice',
  exception: 'Exception',
};

@Injectable({ providedIn: 'root' })
export class GenerationHistoryService {
  readonly records = signal<GenerationRecord[]>([]);

  constructor() {
    this.records.set(this.load());
  }

  pageLabel(page: GeneratorPage): string {
    return PAGE_LABELS[page];
  }

  add(page: GeneratorPage, input: string, outputs: GenerationOutput[]): void {
    const record: GenerationRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      page,
      input,
      outputs,
    };
    // Newest first.
    const next = [record, ...this.records()].slice(0, MAX_RECORDS);
    this.records.set(next);
    this.save(next);
  }

  remove(id: string): void {
    const next = this.records().filter((r) => r.id !== id);
    this.records.set(next);
    this.save(next);
  }

  clear(): void {
    this.records.set([]);
    this.save([]);
  }

  private load(): GenerationRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as GenerationRecord[];
    } catch {
      return [];
    }
  }

  private save(records: GenerationRecord[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Quota exceeded or storage unavailable — keep the in-memory list.
    }
  }
}
