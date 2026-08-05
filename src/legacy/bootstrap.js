// ===== legacy bootstrap 1 =====



(function() {
  if (typeof CustomEvent === 'function') return;
  function CustomEvent(event, params) {
    params = params || { bubbles: false, cancelable: false, detail: null };
    var evt = document.createEvent('CustomEvent');
    evt.initCustomEvent(event, params.bubbles, params.cancelable, params.detail);
    return evt;
  }
  CustomEvent.prototype = window.Event && window.Event.prototype;
  window.CustomEvent = CustomEvent;
})();


// ===== legacy bootstrap 2 =====

(function() {
  // Function to set or update viewport meta tag
  function ensureViewportMeta() {
    var viewportMeta = document.querySelector('meta[name="viewport"]');

    if (!viewportMeta) {
      // Create viewport meta tag if it doesn't exist
      viewportMeta = document.createElement('meta');
      viewportMeta.name = 'viewport';
      document.head.insertBefore(viewportMeta, document.head.firstChild);
    }

    // Set viewport to prevent iOS auto-zoom
    // width=device-width: Use device width
    // initial-scale=1.0: Initial zoom level
    // maximum-scale=1.0: Prevent zooming beyond 1.0
    // user-scalable=no: Disable user scaling (prevents pinch zoom and auto-zoom on input focus)
    viewportMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';
  }

  // Run immediately if DOM is already ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureViewportMeta);
  } else {
    ensureViewportMeta();
  }

  // Also ensure it's set when head is ready (in case script runs before head)
  if (!document.head) {
    var observer = new MutationObserver(function(mutations) {
      if (document.head) {
        ensureViewportMeta();
        observer.disconnect();
      }
    });
    observer.observe(document.documentElement, { childList: true });
  }
})();


// ===== legacy bootstrap 3 =====

(function installMekoraInputCompatibility() {
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = function () {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = function () {};
  }

  if ('PointerEvent' in window) return;

  function createPointerEvent(type, source, pointerId, pointerType) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    const values = {
      pointerId: pointerId,
      pointerType: pointerType,
      isPrimary: true,
      clientX: source.clientX || 0,
      clientY: source.clientY || 0,
      pageX: source.pageX || source.clientX || 0,
      pageY: source.pageY || source.clientY || 0,
      buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1
    };
    Object.keys(values).forEach(function (key) {
      try {
        Object.defineProperty(event, key, { value: values[key], enumerable: true });
      } catch (e) {}
    });
    return event;
  }

  const touchTargets = new Map();

  document.addEventListener('touchstart', function (event) {
    Array.from(event.changedTouches || []).forEach(function (touch) {
      const target = document.elementFromPoint(touch.clientX, touch.clientY) || event.target;
      touchTargets.set(touch.identifier, target);
      target.dispatchEvent(createPointerEvent('pointerdown', touch, touch.identifier + 2, 'touch'));
    });
  }, { passive: false });

  document.addEventListener('touchmove', function (event) {
    Array.from(event.changedTouches || []).forEach(function (touch) {
      const target = touchTargets.get(touch.identifier) || event.target;
      target.dispatchEvent(createPointerEvent('pointermove', touch, touch.identifier + 2, 'touch'));
    });
    if (touchTargets.size) event.preventDefault();
  }, { passive: false });

  function finishTouches(type, event) {
    Array.from(event.changedTouches || []).forEach(function (touch) {
      const target = touchTargets.get(touch.identifier) || event.target;
      target.dispatchEvent(createPointerEvent(type, touch, touch.identifier + 2, 'touch'));
      touchTargets.delete(touch.identifier);
    });
  }

  document.addEventListener('touchend', function (event) {
    finishTouches('pointerup', event);
  }, { passive: false });

  document.addEventListener('touchcancel', function (event) {
    finishTouches('pointercancel', event);
  }, { passive: false });

  let mouseTarget = null;
  document.addEventListener('mousedown', function (event) {
    mouseTarget = event.target;
    mouseTarget.dispatchEvent(createPointerEvent('pointerdown', event, 1, 'mouse'));
  });
  document.addEventListener('mousemove', function (event) {
    if (mouseTarget) {
      mouseTarget.dispatchEvent(createPointerEvent('pointermove', event, 1, 'mouse'));
    }
  });
  document.addEventListener('mouseup', function (event) {
    if (mouseTarget) {
      mouseTarget.dispatchEvent(createPointerEvent('pointerup', event, 1, 'mouse'));
      mouseTarget = null;
    }
  });
})();

