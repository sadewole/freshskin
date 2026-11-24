/* FreshSkin marketing — the only script on the page.
 *
 * Kept external (not inlined) so the marketing CSP can stay `script-src 'self'`
 * with no hash and no 'unsafe-inline'. Everything it drives is already correct in
 * the HTML: with JavaScript off the demo reads as three numbered steps and every
 * section is visible.
 */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Scan demo: pace the three steps ---------------------------------------
  var demo = document.getElementById('demo');
  if (demo) {
    var steps = [].slice.call(demo.querySelectorAll('[data-step]'));
    var dots = [].slice.call(demo.querySelectorAll('[data-dot]'));
    var next = demo.querySelector('[data-next]');
    var label = demo.querySelector('[data-next-label]');
    var count = demo.querySelector('[data-count]');
    var at = 0;

    var paintDemo = function () {
      steps.forEach(function (s, i) {
        if (i === at) s.setAttribute('data-active', '');
        else s.removeAttribute('data-active');
      });
      dots.forEach(function (d, i) {
        if (i === at) d.setAttribute('data-on', '');
        else d.removeAttribute('data-on');
      });
      if (count) count.textContent = 'Step ' + (at + 1) + ' of ' + steps.length;
      if (label) label.textContent = at === steps.length - 1 ? 'Start again' : 'Next step';
    };

    demo.setAttribute('data-enhanced', '');
    if (next) {
      next.addEventListener('click', function () {
        at = (at + 1) % steps.length;
        paintDemo();
      });
    }
    paintDemo();
  }

  // --- Reveal on enter: one meaning, "this section has arrived" --------------
  var targets = [].slice.call(document.querySelectorAll('.reveal'));
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
    );
    targets.forEach(function (t) {
      io.observe(t);
    });
  } else {
    targets.forEach(function (t) {
      t.classList.add('is-in');
    });
  }

  // --- Hero bubbles: slow random drift over the headline and the lede --------
  // Three sizes on desktop, one on phones (CSS hides the other two). Letter
  // centres are measured on load/resize, never inside the animation loop, and
  // all movement is transform-only. Pointer drag works even in reduced motion;
  // the automatic drift does not. Paused when the hero or tab is out of view.
  var scene = document.querySelector('[data-bubble-scene]');
  var nodes = scene ? [].slice.call(scene.querySelectorAll('[data-bubble]')) : [];
  if (scene && nodes.length) {
    var chars = [].slice.call(scene.querySelectorAll('[data-char]'));
    var centres = [];
    var box = { left: 0, top: 0, w: 0, h: 0 };
    var homes = [
      { x: 0.42, y: 0.36 },
      { x: 0.72, y: 0.58 },
      { x: 0.26, y: 0.78 },
    ];
    var bubbles = nodes.map(function (el, i) {
      return {
        el: el,
        i: i,
        pos: { x: 0, y: 0 },
        goal: { x: 0, y: 0 },
        home: homes[i] || homes[0],
        radius: 60,
        speed: 0.012 + i * 0.003,
        turnAt: 0,
        active: false,
        dragging: false,
        placed: false,
      };
    });
    var frame = 0;
    var running = false;
    var onScreen = true;

    var nowMs = function () {
      return window.performance && performance.now ? performance.now() : Date.now();
    };
    var clamp = function (v, lo, hi) {
      return Math.max(lo, Math.min(hi, v));
    };
    var limits = function (b) {
      // A little slack beyond the text block, so the drops roam over the whole
      // headline-and-lede field rather than sticking to a tight rectangle.
      var padX = Math.min(30, box.w * 0.05);
      var padY = Math.min(20, box.h * 0.07);
      var reach = b.radius * 0.42;
      var minX = reach - padX;
      var minY = reach - padY;
      return {
        minX: minX,
        maxX: Math.max(minX, box.w - reach + padX),
        minY: minY,
        maxY: Math.max(minY, box.h - reach + padY),
      };
    };

    var measure = function () {
      var sr = scene.getBoundingClientRect();
      box.left = sr.left;
      box.top = sr.top;
      box.w = sr.width;
      box.h = sr.height;
      centres = chars.map(function (el) {
        var r = el.getBoundingClientRect();
        return {
          el: el,
          x: r.left + r.width / 2 - box.left,
          y: r.top + r.height / 2 - box.top,
          on: el.classList.contains('is-near'),
        };
      });
      bubbles.forEach(function (b) {
        b.active = b.el.getClientRects().length > 0;
        if (!b.active) return;
        b.radius = b.el.getBoundingClientRect().width / 2 || 60;
        var lim = limits(b);
        if (!b.placed) {
          b.pos.x = clamp(box.w * b.home.x, lim.minX, lim.maxX);
          b.pos.y = clamp(box.h * b.home.y, lim.minY, lim.maxY);
          b.goal.x = b.pos.x;
          b.goal.y = b.pos.y;
          b.placed = true;
        } else {
          b.pos.x = clamp(b.pos.x, lim.minX, lim.maxX);
          b.pos.y = clamp(b.pos.y, lim.minY, lim.maxY);
          b.goal.x = clamp(b.goal.x, lim.minX, lim.maxX);
          b.goal.y = clamp(b.goal.y, lim.minY, lim.maxY);
        }
      });
    };

    var paint = function () {
      bubbles.forEach(function (b) {
        if (!b.active) return;
        b.el.style.transform =
          'translate3d(' +
          b.pos.x.toFixed(1) +
          'px,' +
          b.pos.y.toFixed(1) +
          'px,0) translate(-50%,-50%)';
      });
      for (var i = 0; i < centres.length; i++) {
        var c = centres[i];
        var hit = false;
        for (var j = 0; j < bubbles.length; j++) {
          var b = bubbles[j];
          if (!b.active) continue;
          var dx = c.x - b.pos.x;
          var dy = c.y - b.pos.y;
          var reach = b.radius * (c.el.classList.contains('hero__char--lede') ? 1.05 : 1.15);
          if (dx * dx + dy * dy < reach * reach) {
            hit = true;
            break;
          }
        }
        if (hit !== c.on) {
          c.on = hit;
          if (hit) c.el.classList.add('is-near');
          else c.el.classList.remove('is-near');
        }
      }
    };

    var pick = function (b, now) {
      var lim = limits(b);
      b.goal.x = lim.minX + Math.random() * (lim.maxX - lim.minX);
      b.goal.y = lim.minY + Math.random() * (lim.maxY - lim.minY);
      b.turnAt = now + 2200 + Math.random() * 2600 + b.i * 350;
    };

    var tick = function (now) {
      if (!running) return;
      bubbles.forEach(function (b) {
        if (!b.active || b.dragging) return;
        if (now >= b.turnAt) pick(b, now);
        b.pos.x += (b.goal.x - b.pos.x) * b.speed;
        b.pos.y += (b.goal.y - b.pos.y) * b.speed;
      });
      paint();
      frame = window.requestAnimationFrame(tick);
    };

    var run = function () {
      if (reduce || !onScreen || document.hidden || running) return;
      var live = bubbles.some(function (b) {
        return b.active && !b.dragging;
      });
      if (!live) return;
      running = true;
      frame = window.requestAnimationFrame(tick);
    };

    var halt = function () {
      running = false;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };

    var dragTo = function (b, ev) {
      var lim = limits(b);
      b.pos.x = clamp(ev.clientX - box.left, lim.minX, lim.maxX);
      b.pos.y = clamp(ev.clientY - box.top, lim.minY, lim.maxY);
      b.goal.x = b.pos.x;
      b.goal.y = b.pos.y;
      paint();
    };

    bubbles.forEach(function (b) {
      var el = b.el;
      el.addEventListener('pointerdown', function (ev) {
        if (!b.active) return;
        b.dragging = true;
        el.classList.add('is-dragged');
        if (el.setPointerCapture) el.setPointerCapture(ev.pointerId);
        dragTo(b, ev);
        ev.preventDefault();
      });
      el.addEventListener('pointermove', function (ev) {
        if (b.dragging) dragTo(b, ev);
      });
      var release = function (ev) {
        if (!b.dragging) return;
        b.dragging = false;
        el.classList.remove('is-dragged');
        if (
          el.releasePointerCapture &&
          el.hasPointerCapture &&
          el.hasPointerCapture(ev.pointerId)
        ) {
          el.releasePointerCapture(ev.pointerId);
        }
        // Let it rest where it was dropped before drifting again.
        b.turnAt = nowMs() + 900 + Math.random() * 1200;
        run();
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
    });

    measure();
    paint();
    scene.setAttribute('data-ready', '');
    if (!reduce) {
      bubbles.forEach(function (b) {
        pick(b, nowMs());
      });
      run();
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(
          function (entries) {
            onScreen = entries[0].isIntersecting;
            if (onScreen) run();
            else halt();
          },
          { threshold: 0.05 }
        ).observe(scene);
      }
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) halt();
        else run();
      });
    }

    var remeasure = function () {
      measure();
      paint();
    };
    window.addEventListener('resize', remeasure, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  }

  // --- How It Works: interactive routine timeline pills ---------------------
  var hiwPills = [].slice.call(document.querySelectorAll('.how-it-works__pills button[data-day]'));
  if (hiwPills.length) {
    hiwPills.forEach(function (btn) {
      btn.addEventListener('click', function () {
        hiwPills.forEach(function (b) {
          b.classList.remove('pill--active');
          b.classList.add('pill--inactive');
          b.setAttribute('aria-pressed', 'false');
        });
        btn.classList.remove('pill--inactive');
        btn.classList.add('pill--active');
        btn.setAttribute('aria-pressed', 'true');
      });
    });
  }
})();
