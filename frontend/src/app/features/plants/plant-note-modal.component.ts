import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-plant-note-modal',
  imports: [FormsModule, TranslocoDirective],
  template: `
    @if (open) {
      <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30" (click)="cancel()">
        <div class="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-5"
             (click)="$event.stopPropagation()" *transloco="let t">
          <h2 class="text-[16px] font-medium text-gray-800 mb-3">{{ t('plantDetail.note.title') }}</h2>
          <textarea [(ngModel)]="text" rows="4"
                    [placeholder]="t('plantDetail.note.placeholder')"
                    class="w-full text-[14px] text-gray-800 border-[0.5px] border-gray-200 rounded-lg p-3 outline-none focus:border-gw-green resize-none"></textarea>
          <div class="flex justify-end gap-2 mt-4">
            <button (click)="cancel()"
                    class="text-[13px] text-gray-500 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
              {{ t('plantDetail.note.cancel') }}
            </button>
            <button (click)="save()"
                    [disabled]="!text.trim()"
                    class="text-[13px] font-medium bg-gw-green text-white px-4 py-2 rounded-lg hover:bg-gw-green-dark transition-colors disabled:opacity-40">
              {{ t('plantDetail.note.save') }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class PlantNoteModalComponent {
  @Input() open = false;
  @Output() saved = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();
  text = '';

  save() {
    const txt = this.text.trim();
    if (!txt) return;
    this.saved.emit(txt);
    this.text = '';
  }

  cancel() {
    this.text = '';
    this.cancelled.emit();
  }
}
