import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Badge } from './badge.js';
import { Button } from './button.js';

afterEach(cleanup);

const SAVE = 'save';
const DELETE = 'delete';
const DRAFT = 'draft';

describe('Button', () => {
  it('renders primary md button with type=button by default', () => {
    render(<Button>{SAVE}</Button>);
    const button = screen.getByRole('button', { name: 'save' });
    expect(button.getAttribute('type')).toBe('button');
    expect(button.className).toContain('bg-brand-700');
    expect(button.className).toContain('min-h-11');
  });

  it('applies variant, size, fullWidth and merges className', () => {
    render(
      <Button variant="danger" size="lg" fullWidth type="submit" className="px-8">
        {DELETE}
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'delete' });
    expect(button.getAttribute('type')).toBe('submit');
    expect(button.className).toContain('bg-danger-600');
    expect(button.className).toContain('min-h-14');
    expect(button.className).toContain('w-full');
    expect(button.className).toContain('px-8');
    expect(button.className).not.toContain('px-6');
  });
});

describe('Badge', () => {
  it('renders neutral tone by default', () => {
    render(<Badge>{DRAFT}</Badge>);
    const badge = screen.getByText('draft');
    expect(badge.dataset.tone).toBe('neutral');
    expect(badge.className).toContain('text-status-neutral-fg');
  });

  it.each(['info', 'success', 'warning', 'danger'] as const)('renders %s tone', (tone) => {
    render(<Badge tone={tone}>{tone}</Badge>);
    expect(screen.getByText(tone).className).toContain(`bg-status-${tone}-bg`);
  });
});
