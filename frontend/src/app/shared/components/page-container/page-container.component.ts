import { Component } from '@angular/core';

@Component({
  selector: 'app-page-container',
  imports: [],
  template: `<div class="max-w-lg mx-auto px-4 py-6"><ng-content /></div>`,
})
export class PageContainerComponent {}
