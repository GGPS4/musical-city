import { matchTerm, splitInput, suggest } from '../core/resolve.js';
import { $, esc } from './dom.js';

export const DEMO_INPUT = ['The Beatles', 'David Bowie', 'The Clash', 'The Stooges', 'Punk', 'Psychedelic Rock'];

const PRESETS: { label: string; inputs: string[] }[] = [
  { label: 'The demo city', inputs: DEMO_INPUT },
  { label: 'Sunset Strip', inputs: ["Guns N' Roses", 'Aerosmith', 'AC/DC', 'Van Halen', 'Hard Rock'] },
  { label: 'Indie 2004', inputs: ['Arctic Monkeys', 'The Strokes', 'The Libertines', 'Franz Ferdinand', 'Indie'] },
  { label: 'Desert & grunge', inputs: ['Queens of the Stone Age', 'Kyuss', 'Nirvana', 'Soundgarden', 'Foo Fighters'] },
  { label: '90s punk', inputs: ['Green Day', 'Blink-182', 'The Offspring', 'Rancid', 'Punk'] },
  { label: 'Manchester nights', inputs: ['Joy Division', 'New Order', 'The Smiths', 'Oasis', 'The Stone Roses'] },
  { label: 'CBGB, 1977', inputs: ['Ramones', 'Talking Heads', 'Television', 'Patti Smith', 'Blondie'] },
];

/** Landing screen: chip-style taste input with autocomplete. */
export class Landing {
  private chips: string[] = [];
  private input = $('#taste-input') as HTMLInputElement;
  private chipList = $('#chips');
  private sugg = $('#suggestions');
  private error = $('#taste-error');
  private active = -1;
  private items: { label: string; kind: string }[] = [];

  constructor(private root: HTMLElement, private onSubmit: (inputs: string[]) => void) {
    const form = $('#taste-form', root) as HTMLFormElement;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit();
    });
    this.input.addEventListener('keydown', (e) => this.keydown(e));
    this.input.addEventListener('input', () => this.typed());
    this.input.addEventListener('paste', (e) => {
      const text = e.clipboardData?.getData('text') ?? '';
      if (/[,;\n]/.test(text)) {
        e.preventDefault();
        splitInput(text).forEach((t) => this.addChip(t));
      }
    });
    this.input.addEventListener('blur', () => setTimeout(() => this.closeSuggestions(), 150));
    $('#taste-box', root).addEventListener('click', () => this.input.focus());
    this.chipList.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-remove]');
      if (!b) return;
      this.chips.splice(Number(b.dataset.remove), 1);
      this.renderChips();
      this.input.focus();
    });
    this.sugg.addEventListener('mousedown', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('[data-label]');
      if (!li) return;
      e.preventDefault();
      this.addChip(li.dataset.label ?? '');
      this.input.value = '';
      this.closeSuggestions();
    });
    const presets = $('#presets', root);
    presets.innerHTML = PRESETS.map((p, i) => `<button type="button" class="preset" data-preset="${i}">${esc(p.label)}</button>`).join('');
    presets.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-preset]');
      if (!b) return;
      this.chips = [...PRESETS[Number(b.dataset.preset)].inputs];
      this.input.value = '';
      this.renderChips();
      this.error.textContent = '';
    });
  }

  show(inputs: string[] = []): void {
    this.chips = [...inputs];
    this.renderChips();
    this.root.hidden = false;
    requestAnimationFrame(() => this.root.classList.add('is-visible'));
    setTimeout(() => this.input.focus({ preventScroll: true }), 400);
  }

  hide(): void {
    this.root.classList.remove('is-visible');
    setTimeout(() => (this.root.hidden = true), 500);
  }

  private submit() {
    const pending = splitInput(this.input.value);
    pending.forEach((t) => this.addChip(t));
    this.input.value = '';
    if (!this.chips.length) {
      this.error.textContent = 'Enter at least one artist or genre to build your city.';
      this.input.focus();
      return;
    }
    this.error.textContent = '';
    this.closeSuggestions();
    this.onSubmit([...this.chips]);
  }

  private addChip(text: string) {
    const t = text.trim();
    if (!t || this.chips.some((c) => c.toLowerCase() === t.toLowerCase())) return;
    const m = matchTerm(t);
    this.chips.push(m ? m.label : t);
    this.renderChips();
    this.error.textContent = '';
  }

  private renderChips() {
    this.chipList.innerHTML = this.chips
      .map((c, i) => {
        const m = matchTerm(c);
        const kind = m ? m.kind : 'unknown';
        const title = kind === 'unknown' ? 'Not in our catalogue yet: it will appear as a musical interpretation' : kind === 'genre' ? 'Genre' : 'Artist';
        return `<li class="chip chip--${kind}" title="${esc(title)}">${esc(c)}<button type="button" data-remove="${i}" aria-label="Remove ${esc(c)}">×</button></li>`;
      })
      .join('');
    this.input.placeholder = this.chips.length ? 'Add more…' : 'The Beatles, David Bowie, The Clash, Punk, Psychedelic Rock';
  }

  private typed() {
    const v = this.input.value;
    if (/[,;]/.test(v)) {
      const parts = v.split(/[,;]/);
      const rest = parts.pop() ?? '';
      parts.forEach((p) => this.addChip(p));
      this.input.value = rest.trimStart();
    }
    this.items = suggest(this.input.value).filter((s) => !this.chips.includes(s.label));
    this.active = -1;
    this.renderSuggestions();
  }

  private renderSuggestions() {
    if (!this.items.length || !this.input.value.trim()) {
      this.closeSuggestions();
      return;
    }
    this.sugg.innerHTML = this.items
      .map((s, i) => `<li role="option" data-label="${esc(s.label)}" class="${i === this.active ? 'is-active' : ''}"><span>${esc(s.label)}</span><em>${s.kind}</em></li>`)
      .join('');
    this.sugg.hidden = false;
  }

  private closeSuggestions() {
    this.sugg.hidden = true;
    this.items = [];
  }

  private keydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' && this.items.length) {
      e.preventDefault();
      this.active = (this.active + 1) % this.items.length;
      this.renderSuggestions();
    } else if (e.key === 'ArrowUp' && this.items.length) {
      e.preventDefault();
      this.active = (this.active - 1 + this.items.length) % this.items.length;
      this.renderSuggestions();
    } else if ((e.key === 'Enter' || e.key === 'Tab') && this.active >= 0 && this.items[this.active]) {
      e.preventDefault();
      this.addChip(this.items[this.active].label);
      this.input.value = '';
      this.closeSuggestions();
    } else if (e.key === 'Enter' && this.input.value.trim()) {
      e.preventDefault();
      this.addChip(this.input.value);
      this.input.value = '';
      this.closeSuggestions();
    } else if (e.key === 'Backspace' && !this.input.value && this.chips.length) {
      this.chips.pop();
      this.renderChips();
    } else if (e.key === 'Escape') {
      this.closeSuggestions();
    }
  }
}
