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
];
