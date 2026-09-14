import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  template: `
    <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
      <div class="container-fluid">
        <span class="navbar-brand">Java Code Generator</span>
        <ul class="navbar-nav">
          <li class="nav-item">
            <a class="nav-link" routerLink="" routerLinkActive="active">JSON → POJO</a>
          </li>
          <li class="nav-item">
            <a class="nav-link" routerLink="controller" routerLinkActive="active">
              WebFlux Controller
            </a>
          </li>
          <li class="nav-item">
            <a
              class="nav-link"
              routerLink="controller-advice"
              routerLinkActive="active"
            >
              Advice
            </a>
          </li>
          <li class="nav-item">
            <a
              class="nav-link"
              routerLink="exception"
              routerLinkActive="active"
            >
              Exception
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" routerLink="openapi" routerLinkActive="active">
              OpenAPI → POJO
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" routerLink="openapi-full" routerLinkActive="active">
              OpenAPI → Full
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" routerLink="history" routerLinkActive="active">
              History
            </a>
          </li>
        </ul>
      </div>
    </nav>
    <router-outlet />
  `,
  styles: [],
})
export class App {}
