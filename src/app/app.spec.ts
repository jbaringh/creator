import { TestBed } from '@angular/core/testing';
import { provideRouter, withHashLocation } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(routes, withHashLocation())],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the nav bar with all three links', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.navbar')).toBeTruthy();
    const links = el.querySelectorAll('.nav-link');
    expect(links.length).toBe(3);
    const labels = Array.from(links).map((a) => (a as HTMLElement).textContent?.trim());
    expect(labels).toContain('JSON → POJO');
    expect(labels).toContain('WebFlux Controller');
    expect(labels).toContain('OpenAPI → POJO');
  });
});
