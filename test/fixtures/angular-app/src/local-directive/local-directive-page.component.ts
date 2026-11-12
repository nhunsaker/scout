import { Component } from "@angular/core";
import { ExFieldDirective } from "./field.directive";

@Component({
  selector: "app-local-directive-page",
  imports: [ExFieldDirective],
  template: "<ex-field></ex-field><x-widget></x-widget>",
})
export class LocalDirectivePageComponent {}
