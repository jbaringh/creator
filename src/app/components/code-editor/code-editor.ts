import {
  AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output,
  ViewChild,
} from '@angular/core';
import { EditorState, Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { java } from '@codemirror/lang-java';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { oneDark } from '@codemirror/theme-one-dark';

export type EditorLanguage = 'java' | 'json' | 'yaml';

@Component({
  selector: 'app-code-editor',
  template: `<div #host class="code-editor-host"></div>`,
  styles: `
    .code-editor-host {
      width: 100%;
      border-radius: 0.375rem;
      overflow: hidden;
      border: 1px solid #343a40;
      background: #282c34;
    }
    .code-editor-host .cm-editor {
      height: 100%;
      min-height: 400px;
      max-height: calc(100vh - 220px);
      font-size: 0.9rem;
      background: transparent;
    }
    .code-editor-host .cm-scroller {
      overflow: auto;
      max-height: calc(100vh - 220px);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
  `,
})
export class CodeMirrorEditor implements AfterViewInit, OnDestroy {
  @Input() code: string = '';
  @Input() language: EditorLanguage = 'java';
  @Input() readOnly: boolean = false;
  @Output() codeChange = new EventEmitter<string>();

  @ViewChild('host') hostRef!: ElementRef<HTMLElement>;

  private view: EditorView | null = null;
  private lastEmitted = '';

  ngAfterViewInit(): void {
    this.view = new EditorView({
      state: EditorState.create({
        doc: this.code,
        extensions: this.buildExtensions(),
      }),
      parent: this.hostRef.nativeElement,
    });
    this.lastEmitted = this.code;
  }

  ngOnDestroy(): void {
    this.view?.destroy();
    this.view = null;
  }

  /**
   * Called by the parent when the [code] input changes.
   * Replaces the editor document without losing scroll position.
   */
  ngOnChanges(): void {
    if (this.view && this.code !== this.lastEmitted) {
      const view = this.view;
      const start = view.state.doc.length;
      view.dispatch({
        changes: { from: 0, to: start, insert: this.code },
        selection: { anchor: 0 },
      });
      this.lastEmitted = this.code;
    }
  }

  private buildExtensions(): Extension[] {
    const lang =
      this.language === 'java' ? java() : this.language === 'yaml' ? yaml() : json();
    return [
      oneDark,
      lang,
      EditorView.lineWrapping,
      EditorView.editable.of(!this.readOnly),
      EditorState.readOnly.of(this.readOnly),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !this.readOnly) {
          const text = update.state.doc.toString();
          if (text !== this.lastEmitted) {
            this.lastEmitted = text;
            this.codeChange.emit(text);
          }
        }
      }),
    ];
  }
}
