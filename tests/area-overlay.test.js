/**
 * @jest-environment jsdom
 */

describe('area-overlay interactions', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = `
      <div id="overlay"></div>
      <div id="selection" style="display:none"></div>
      <div id="hint" style="opacity:1"></div>
    `;
    window.electronAPI = {
      areaSelected: jest.fn(),
      areaCancelled: jest.fn(),
    };
    require('../src/renderer/area-overlay');
  });

  test('draws selection and confirms on mouseup', () => {
    const overlay = document.getElementById('overlay');
    overlay.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 20, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 110, clientY: 220, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 110, clientY: 220, bubbles: true }));

    expect(window.electronAPI.areaSelected).toHaveBeenCalledWith({
      x: 10,
      y: 20,
      width: 100,
      height: 200,
    });
  });

  test('small drag cancels selection and restores hint', () => {
    const overlay = document.getElementById('overlay');
    const selection = document.getElementById('selection');
    const hint = document.getElementById('hint');

    overlay.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 10, bubbles: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 15, clientY: 15, bubbles: true }));

    expect(selection.style.display).toBe('none');
    expect(hint.style.opacity).toBe('1');
    expect(window.electronAPI.areaSelected).not.toHaveBeenCalled();
  });

  test('escape key triggers areaCancelled', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(window.electronAPI.areaCancelled).toHaveBeenCalled();
  });
});
