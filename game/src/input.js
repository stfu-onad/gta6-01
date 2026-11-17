// Keyboard + mouse input: held keys, edge-triggered presses, pointer lock
// mouse-look deltas, and a simple click queue for shooting / punching.
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let clicked = false;
  let locked = false;

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    mouseDX += e.movementX;
    mouseDY += e.movementY;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!locked) canvas.requestPointerLock();
    else clicked = true;
  });

  return {
    down(code) { return keys.has(code); },
    /** True once, on the frame the key went down. */
    wasPressed(code) { return pressed.has(code); },
    consumeClick() { const c = clicked; clicked = false; return c; },
    /** Mouse movement since last read, then resets. */
    takeMouse() {
      const d = { x: mouseDX, y: mouseDY };
      mouseDX = 0; mouseDY = 0;
      return d;
    },
    isLocked() { return locked; },
    lock() { canvas.requestPointerLock(); },
    unlock() { if (document.pointerLockElement) document.exitPointerLock(); },
    /** Call at the end of each frame. */
    endFrame() { pressed.clear(); },
  };
}
