import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useUnsavedChangesWarning } from './useUnsavedChangesWarning';

describe('useUnsavedChangesWarning', () => {
  const message = 'You have unsaved changes.';

  beforeEach(() => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    vi.spyOn(window.history, 'back').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not register listeners when the form is clean', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => useUnsavedChangesWarning(false, message));

    expect(addEventListenerSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));
    expect(window.history.pushState).not.toHaveBeenCalled();
  });

  it('registers beforeunload and history guard when dirty', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => useUnsavedChangesWarning(true, message));

    expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    expect(window.history.pushState).toHaveBeenCalled();
  });

  it('prevents navigation when a same-origin link click is cancelled', () => {
    renderHook(() => useUnsavedChangesWarning(true, message));

    const anchor = document.createElement('a');
    anchor.href = '/en';
    anchor.textContent = 'Home';
    document.body.appendChild(anchor);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefault = vi.spyOn(clickEvent, 'preventDefault');
    const stopPropagation = vi.spyOn(clickEvent, 'stopPropagation');

    document.dispatchEvent(clickEvent);

    expect(window.confirm).toHaveBeenCalledWith(message);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();

    anchor.remove();
  });

  it('re-pushes history when back navigation is cancelled', () => {
    renderHook(() => useUnsavedChangesWarning(true, message));

    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(window.confirm).toHaveBeenCalledWith(message);
    expect(window.history.pushState).toHaveBeenCalledTimes(2);
    expect(window.history.back).not.toHaveBeenCalled();
  });

  it('navigates back when popstate confirmation is accepted', () => {
    vi.mocked(window.confirm).mockReturnValue(true);

    renderHook(() => useUnsavedChangesWarning(true, message));

    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(window.history.back).toHaveBeenCalled();
  });
});
