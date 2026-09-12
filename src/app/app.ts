import { Component } from '@angular/core';
import { PojoConverter } from './components/pojo-converter/pojo-converter';

@Component({
  selector: 'app-root',
  imports: [PojoConverter],
  template: `<app-pojo-converter />`,
  styles: [],
})
export class App {}
