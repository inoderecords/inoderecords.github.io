/*
  The order number: an inode for the sale.

  The shop is named for the on-disk record that points at where a file
  lives, so an order gets the same shape: `ino 0x5B81A`, the seconds since
  2026 in hex. Generated at the moment of submission, stamped into the
  hidden field and the subject (so the shop email carries it) and into
  sessionStorage (so ordered.html can show it after FormSubmit's captcha
  round trip, which stays in the same tab).

  Without JavaScript the order still goes through; it just travels without
  a number and the shop assigns one in the reply. The page never blocks a
  sale on a nicety.
*/
(function () {
  'use strict';

  var forms = document.querySelectorAll('.order__form');
  if (!forms.length) return;

  var EPOCH = Date.UTC(2026, 0, 1);

  for (var i = 0; i < forms.length; i++) {
    (function (f) {
      f.addEventListener('submit', function () {
        var ino =
          'ino 0x' +
          Math.max(1, Math.round((Date.now() - EPOCH) / 1000)).toString(16).toUpperCase();
        var num = f.querySelector('[name="order"]');
        var sub = f.querySelector('[name="_subject"]');
        if (num) num.value = ino;
        if (sub) sub.value += ' · ' + ino;
        try {
          sessionStorage.setItem('inode.order', JSON.stringify({
            ino: ino,
            record: (f.querySelector('[name="record"]') || { value: '' }).value,
            price: (f.querySelector('[name="price"]') || { value: '' }).value
          }));
        } catch (e) { /* private window: ordered.html shows the generic copy */ }
      });
    })(forms[i]);
  }

  // Opening a strip puts the caret in the email field: one less tap.
  var strips = document.querySelectorAll('.order');
  for (var j = 0; j < strips.length; j++) {
    (function (d) {
      d.addEventListener('toggle', function () {
        if (!d.open) return;
        var inp = d.querySelector('.order__email');
        if (inp) inp.focus();
      });
    })(strips[j]);
  }
})();
