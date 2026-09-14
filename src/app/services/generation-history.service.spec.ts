import { TestBed } from '@angular/core/testing';
import { GenerationHistoryService } from './generation-history.service';

describe('GenerationHistoryService', () => {
  let service: GenerationHistoryService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(GenerationHistoryService);
  });

  it('starts empty', () => {
    expect(service.records()).toHaveLength(0);
  });

  it('adds a record and keeps newest first', () => {
    service.add('pojo', '{"a":1}', [{ label: 'A', code: 'class A {}' }]);
    service.add('controller', 'GET /x', [{ label: 'C', code: 'class C {}' }]);

    expect(service.records()).toHaveLength(2);
    expect(service.records()[0].page).toBe('controller');
    expect(service.records()[0].input).toBe('GET /x');
    expect(service.records()[0].outputs[0].code).toBe('class C {}');
  });

  it('persists to localStorage', () => {
    service.add('openapi', 'spec', [{ label: 'X', code: 'class X {}' }]);
    const raw = localStorage.getItem('pojo3.generation-history');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].page).toBe('openapi');
  });

  it('removes a single record', () => {
    service.add('pojo', 'i1', [{ label: 'A', code: 'c' }]);
    service.add('pojo', 'i2', [{ label: 'B', code: 'c' }]);
    const first = service.records()[0].id;
    service.remove(first);
    expect(service.records()).toHaveLength(1);
    expect(service.records()[0].input).toBe('i1');
  });

  it('clears all records', () => {
    service.add('pojo', 'i', [{ label: 'A', code: 'c' }]);
    service.clear();
    expect(service.records()).toHaveLength(0);
    expect(localStorage.getItem('pojo3.generation-history')).toBe('[]');
  });
});
