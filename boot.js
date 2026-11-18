/*
  The boot: a short instrument start-up before the page shows.

  It is the one moment on the page that costs the visitor time, so it is kept
  honest about that:

  - under a second and a half, total
  - once per tab, not once per page view. Nobody should sit through it twice,
    and someone arriving from a Marketplace link is already impatient
  - it never runs for a reader who asked for reduced motion
  - clicking, tapping or pressing a key skips it immediately
  - every line is a fact, not flavour text. The counts come from the page
    itself, so the boot cannot drift out of step with the shelf

  Built here rather than written into index.html on purpose: markup would
  strand a black screen over the shop for anyone this file never reaches.
*/
(function () {
  'use strict';

  var calm = window.matchMedia('(prefers-reduced-motion: reduce)');
  var KEY = 'inode.boot';

  var seen = null;
  try { seen = sessionStorage.getItem(KEY); } catch (e) { seen = null; }
  if (seen || calm.matches) return;
  try { sessionStorage.setItem(KEY, '1'); } catch (e) { /* private window */ }

  // Read the count off the page rather than out of stock.json, so this can
  // never announce a shelf we do not have. The footer already states it; this
  // is that same sentence, not a second copy of the number free to drift.
  var facts = document.querySelector('[data-facts]');
  var count = facts ? facts.textContent.replace(/\s+/g, ' ').trim().toUpperCase() : '';

  var LINES = [
    'INODERECORDS',
    'QUEZON CITY · PHILIPPINES',
    count,
    'READY'
  ].filter(Boolean);

  var el = document.createElement('div');
  el.className = 'boot';
  el.setAttribute('aria-hidden', 'true');

  var rule = document.createElement('i');
  rule.className = 'boot__rule';
  el.appendChild(rule);

  document.documentElement.classList.add('is-booting');
  document.body.appendChild(el);

  var timers = [];
  var done = false;

  function finish() {
    if (done) return;
    done = true;
    for (var t = 0; t < timers.length; t++) clearTimeout(timers[t]);
    el.className = 'boot boot--out';
    document.documentElement.classList.remove('is-booting');
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 420);
    window.removeEventListener('keydown', finish);
    window.removeEventListener('pointerdown', finish);
  }

  // any input gets you past it at once
  window.addEventListener('keydown', finish);
  window.addEventListener('pointerdown', finish);

  LINES.forEach(function (text, n) {
    timers.push(setTimeout(function () {
      var p = document.createElement('p');
      p.className = 'boot__line' + (n === LINES.length - 1 ? ' boot__line--on' : '');
      p.textContent = text;
      el.insertBefore(p, rule);
    }, 90 + n * 190));
  });

  timers.push(setTimeout(finish, 90 + LINES.length * 190 + 260));
})();
