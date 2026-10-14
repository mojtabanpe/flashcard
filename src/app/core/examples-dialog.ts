import { Component, input, output } from '@angular/core';
import { DialogFocus } from './dialog-focus';
import { MarkdownPipe } from './markdown.pipe';

@Component({
  selector: 'app-examples-dialog',
  imports: [DialogFocus, MarkdownPipe],
  templateUrl: './examples-dialog.html',
  styleUrl: './examples-dialog.scss',
})
export class ExamplesDialog {
  readonly word = input.required<string>();
  readonly examples = input.required<string>();
  readonly unit = input<string | null>(null);
  readonly dismissed = output<void>();
}
