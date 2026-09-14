import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/pojo-converter/pojo-converter').then((m) => m.PojoConverter),
    title: 'JSON to POJO',
  },
  {
    path: 'controller',
    loadComponent: () =>
      import('./components/controller-generator/controller-generator').then(
        (m) => m.ControllerGenerator,
      ),
    title: 'WebFlux Controller',
  },
  {
    path: 'openapi',
    loadComponent: () =>
      import('./components/openapi-converter/openapi-converter').then(
        (m) => m.OpenApiConverter,
      ),
    title: 'OpenAPI to POJO',
  },
  {
    path: 'openapi-full',
    loadComponent: () =>
      import('./components/openapi-full-converter/openapi-full-converter').then(
        (m) => m.OpenApiFullConverter,
      ),
    title: 'OpenAPI to Models & Controller',
  },
  {
    path: 'history',
    loadComponent: () =>
      import('./components/generations-history/generations-history').then(
        (m) => m.GenerationsHistory,
      ),
    title: 'Generation History',
  },
  {
    path: 'controller-advice',
    loadComponent: () =>
      import('./components/controller-advice-generator/controller-advice-generator').then(
        (m) => m.ControllerAdviceGenerator,
      ),
    title: 'ControllerAdvice Stubs',
  },
  {
    path: 'exception',
    loadComponent: () =>
      import('./components/exception-generator/exception-generator').then(
        (m) => m.ExceptionGenerator,
      ),
    title: 'Custom Exception',
  },
];
