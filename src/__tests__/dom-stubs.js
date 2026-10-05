// jsdom gives elements no layout, and Leaflet measures its container before it
// will initialise. These stubs give every element a real box so a genuine
// Leaflet map can be created inside a test.
Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, value: 1024 });
Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, value: 768 });
Object.defineProperty(window.HTMLElement.prototype, 'offsetWidth', { configurable: true, value: 1024 });
Object.defineProperty(window.HTMLElement.prototype, 'offsetHeight', { configurable: true, value: 768 });

window.HTMLElement.prototype.getBoundingClientRect = function () {
  return {
    x: 0, y: 0, top: 0, left: 0, right: 1024, bottom: 768,
    width: 1024, height: 768, toJSON() {},
  };
};

window.URL.createObjectURL = window.URL.createObjectURL || (() => 'blob:stub');
window.URL.revokeObjectURL = window.URL.revokeObjectURL || (() => {});

export {};
