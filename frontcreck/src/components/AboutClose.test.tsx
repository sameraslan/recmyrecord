import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AboutClose } from './AboutClose';

const router = { back: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/nav-history', () => ({ previousPath: () => null }));

/** A pointerdown on the About layer at an offset inside its padding box (clientWidth 500). */
function pressLayer(offsetX: number) {
  const layer = screen.getByTestId('layer');
  Object.defineProperty(layer, 'clientWidth', { configurable: true, value: 500 });
  const e = new MouseEvent('pointerdown', { bubbles: true });
  Object.defineProperty(e, 'offsetX', { value: offsetX });
  layer.dispatchEvent(e);
}

describe('AboutClose', () => {
  afterEach(() => {
    cleanup();
    router.push.mockClear();
  });

  it('closes on a press on the backdrop', () => {
    render(
      <div className="about-page" data-testid="layer">
        <AboutClose />
      </div>,
    );
    pressLayer(120);
    expect(router.push).toHaveBeenCalledWith('/');
  });

  it('ignores a press on the backdrop scrollbar', () => {
    render(
      <div className="about-page" data-testid="layer">
        <AboutClose />
      </div>,
    );
    pressLayer(508);
    expect(router.push).not.toHaveBeenCalled();
  });
});
