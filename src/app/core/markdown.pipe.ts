import { Pipe, PipeTransform } from '@angular/core';
import { marked } from 'marked';

/**
 * Renders card text as Markdown: fenced code blocks (```), inline code (`code`),
 * bold/italic, lists and line breaks. The returned HTML is bound via
 * `[innerHTML]`, which Angular sanitizes, so script injection is stripped.
 */
@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(value: string | null | undefined): string {
    if (!value) return '';
    return marked.parse(value, { gfm: true, breaks: true, async: false }) as string;
  }
}
