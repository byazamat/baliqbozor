import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Alert } from './alert.js';
import { Dialog } from './dialog.js';
import { EmptyState } from './empty-state.js';
import { FileUpload } from './file-upload.js';
import { Input, Textarea } from './input.js';
import { isCompletePhone, maskPhoneDigits, PhoneInput, phoneDigits } from './phone-input.js';
import { Select } from './select.js';

afterEach(cleanup);

// Тексты в тестах — не строки интерфейса, а метки для поиска.
const L = { name: 'name', hint: 'hint', error: 'error', phone: 'phone', region: 'region' };

describe('Input / Textarea', () => {
  it('links label, hint and error to the control', () => {
    render(<Input label={L.name} hint={L.hint} error={L.error} required />);
    const input = screen.getByLabelText(/name/);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(`${input.id}-hint ${input.id}-error`);
    expect(input.hasAttribute('required')).toBe(true);
    expect(input.className).toContain('border-danger-600');
  });

  it('valid field has no aria-invalid nor describedby', () => {
    render(<Textarea label={L.name} id="t1" />);
    const textarea = screen.getByLabelText(L.name);
    expect(textarea.id).toBe('t1');
    expect(textarea.getAttribute('aria-invalid')).toBeNull();
    expect(textarea.getAttribute('aria-describedby')).toBeNull();
    expect(textarea.className).toContain('border-border-strong');
  });
});

describe('Select', () => {
  it('renders placeholder and options', () => {
    const onChange = vi.fn();
    render(
      <Select
        label={L.region}
        placeholder="—"
        value=""
        onChange={onChange}
        options={[
          { value: '1', label: 'a' },
          { value: '2', label: 'b', disabled: true },
        ]}
      />,
    );
    const select = screen.getByLabelText<HTMLSelectElement>(L.region);
    expect(select.options).toHaveLength(3);
    expect(select.options[2]?.disabled).toBe(true);
    fireEvent.change(select, { target: { value: '1' } });
    expect(onChange).toHaveBeenCalled();
  });
});

describe('PhoneInput', () => {
  it('helpers normalize, mask and validate', () => {
    expect(phoneDigits('+998 (90) 123-45-67')).toBe('901234567');
    expect(phoneDigits('90 123 45 67 89')).toBe('901234567');
    expect(phoneDigits('998')).toBe('998');
    expect(maskPhoneDigits('901234567')).toBe('90 123 45 67');
    expect(maskPhoneDigits('9012')).toBe('90 12');
    expect(isCompletePhone('+998901234567')).toBe(true);
    expect(isCompletePhone('+99890123456')).toBe(false);
  });

  function Controlled({ initial = '' }: { initial?: string }) {
    const [value, setValue] = useState(initial);
    return (
      <>
        <PhoneInput label={L.phone} value={value} onChange={setValue} error={L.error} />
        <output data-testid="value">{value}</output>
      </>
    );
  }

  it('shows the mask and emits stored format', () => {
    render(<Controlled initial="+998901234567" />);
    const input = screen.getByLabelText<HTMLInputElement>(L.phone);
    expect(input.value).toBe('90 123 45 67');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    fireEvent.change(input, { target: { value: '+998 93 111 22 33' } });
    expect(screen.getByTestId('value').textContent).toBe('+998931112233');
    expect(input.value).toBe('93 111 22 33');

    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByTestId('value').textContent).toBe('');
  });

  it('accepts national digits as value', () => {
    render(<PhoneInput label={L.phone} value="9012" onChange={() => undefined} />);
    expect(screen.getByLabelText<HTMLInputElement>(L.phone).value).toBe('90 12');
  });
});

describe('Alert', () => {
  it('danger is announced as alert, others as status', () => {
    render(
      <>
        <Alert tone="danger" title={L.error} action={<button type="button">{L.name}</button>}>
          {L.hint}
        </Alert>
        <Alert>{L.hint}</Alert>
      </>,
    );
    expect(screen.getByRole('alert').dataset.tone).toBe('danger');
    expect(screen.getByRole('status').dataset.tone).toBe('info');
    expect(screen.getByRole('button', { name: L.name })).toBeDefined();
  });
});

describe('EmptyState', () => {
  it('renders title, description and action', () => {
    render(
      <EmptyState
        title={L.name}
        description={L.hint}
        action={<button type="button">{L.error}</button>}
      />,
    );
    expect(screen.getByText(L.name)).toBeDefined();
    expect(screen.getByText(L.hint)).toBeDefined();
    expect(screen.getByRole('button', { name: L.error })).toBeDefined();
  });
});

describe('Dialog', () => {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          {L.phone}
        </button>
        <Dialog
          open={open}
          onClose={() => setOpen(false)}
          title={L.name}
          footer={
            <button type="button" onClick={() => setOpen(false)}>
              {L.error}
            </button>
          }
        >
          {L.hint}
        </Dialog>
      </>
    );
  }

  it('opens, closes with button and with Escape (cancel)', () => {
    render(<Harness />);
    expect(screen.queryByText(L.hint)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: L.phone }));
    expect(screen.getByText(L.hint)).toBeDefined();
    const dialog = document.querySelector('dialog');
    expect(dialog?.open).toBe(true);
    expect(dialog?.getAttribute('aria-labelledby')).toBe(screen.getByText(L.name).id);

    fireEvent.click(screen.getByRole('button', { name: L.error, hidden: true }));
    expect(dialog?.open).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: L.phone }));
    fireEvent(dialog as HTMLDialogElement, new Event('cancel', { cancelable: true }));
    expect(screen.queryByText(L.hint)).toBeNull();
  });

  it('falls back to the open attribute without showModal', () => {
    const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
    const saved = { showModal: proto.showModal, close: proto.close };
    proto.showModal = undefined;
    proto.close = undefined;
    try {
      const { rerender } = render(<Dialog open title={L.name} onClose={() => undefined} />);
      const dialog = document.querySelector('dialog');
      expect(dialog?.hasAttribute('open')).toBe(true);
      rerender(<Dialog open={false} title={L.name} onClose={() => undefined} />);
      expect(dialog?.hasAttribute('open')).toBe(false);
    } finally {
      Object.assign(proto, saved);
    }
  });
});

describe('FileUpload', () => {
  const file = (name: string) => new File(['x'], name, { type: 'image/png' });

  it('emits chosen files and resets the input', () => {
    const onFiles = vi.fn();
    render(
      <FileUpload
        label={L.name}
        buttonLabel={L.phone}
        hint={L.hint}
        error={L.error}
        accept="image/*"
        onFiles={onFiles}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>(L.phone);
    expect(input.getAttribute('accept')).toBe('image/*');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    fireEvent.change(input, { target: { files: [file('a.png')] } });
    expect(onFiles).toHaveBeenCalledWith([expect.any(File)]);
    fireEvent.change(input, { target: { files: [] } });
    expect(onFiles).toHaveBeenCalledTimes(1);
  });

  it('accepts dropped files (one unless multiple) and ignores drops when disabled', () => {
    const onFiles = vi.fn();
    const { rerender } = render(
      <FileUpload label={L.name} buttonLabel={L.phone} onFiles={onFiles} />,
    );
    const zone = screen.getByText(L.phone).parentElement as HTMLElement;
    const files = [file('a.png'), file('b.png')];
    fireEvent.dragOver(zone);
    expect(zone.dataset.dragging).toBe('true');
    fireEvent.dragLeave(zone);
    expect(zone.dataset.dragging).toBeUndefined();
    fireEvent.drop(zone, { dataTransfer: { files } });
    expect(onFiles).toHaveBeenLastCalledWith([files[0]]);

    rerender(<FileUpload buttonLabel={L.phone} onFiles={onFiles} multiple />);
    expect(screen.queryByText(L.name)).toBeNull();
    fireEvent.drop(zone, { dataTransfer: { files } });
    expect(onFiles).toHaveBeenLastCalledWith(files);

    rerender(<FileUpload label={L.name} buttonLabel={L.phone} onFiles={onFiles} disabled />);
    fireEvent.dragOver(zone);
    fireEvent.drop(zone, { dataTransfer: { files } });
    fireEvent.drop(zone, { dataTransfer: { files: [] } });
    expect(onFiles).toHaveBeenCalledTimes(2);
  });
});
