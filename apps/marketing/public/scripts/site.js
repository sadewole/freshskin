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

    var paint = function () {
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
        paint();
      });
    }
    paint();
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
})();
