/*
  The cart: several records, one claim.

  Without this file the page sells one record per email, through the plain
  <details> form, and that stays the no-script path. With it, the per-record
  form folds away and every record gets ADD TO CART instead; a strip along
  the bottom keeps the running total, and one PLACE ORDER sends a single
  email carrying every record, the total, and one order number.

  Everything the cart knows comes off the DOM: the FormSubmit action and the
  redirect from the first hidden form, the titles and prices from the <li>
  data attributes. localStorage only remembers ids, so a stale cart can
  never carry yesterday's price; it re-reads the shelf on every load, and a
  record that left the page leaves the cart.
*/
(function () {
  'use strict';

  var seed = document.querySelector('.order__form');
  if (!seed) return; /* orders are off: the Messenger page needs no cart */

  var ACTION = seed.getAttribute('action');
  var NEXT = (seed.querySelector('[name="_next"]') || { value: '' }).value;
  var EPOCH = Date.UTC(2026, 0, 1);
  var KEY = 'inode.cart';

  /* ── the shelf, as data ─────────────────────────────────────────────── */

  var recs = {};
  var order = []; /* page order, for stable listing */
  var lis = document.querySelectorAll('.rec[data-title]');
  for (var i = 0; i < lis.length; i++) {
    var li = lis[i];
    recs[li.id] = {
      id: li.id,
      title: li.getAttribute('data-title'),
      price: parseInt(li.getAttribute('data-price'), 10) || 0,
      qty: parseInt(li.getAttribute('data-qty'), 10) || 1,
      btn: null,
    };
    order.push(li.id);
  }

  function load() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || '[]');
      /* ids only, each counted no higher than what is on the shelf */
      var n = {};
      var out = [];
      for (var i = 0; i < c.length; i++) {
        var id = c[i];
        if (!recs[id]) continue;
        n[id] = (n[id] || 0) + 1;
        if (n[id] <= recs[id].qty) out.push(id);
      }
      return out;
    } catch (e) {
      return [];
    }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) {}
  }

  var cart = load();

  var peso = function (n) { return '₱' + n.toLocaleString('en-US'); };
  var count = function (id) {
    var k = 0;
    for (var i = 0; i < cart.length; i++) if (cart[i] === id) k++;
    return k;
  };
  var total = function () {
    var t = 0;
    for (var i = 0; i < cart.length; i++) t += recs[cart[i]].price;
    return t;
  };

  /* ── the strip ──────────────────────────────────────────────────────── */

  var bar = document.createElement('aside');
  bar.className = 'cart';
  bar.hidden = true;
  bar.innerHTML =
    '<button class="cart__sum" type="button" aria-expanded="false">' +
    'CART · <span data-cart-n></span> · <span data-cart-total></span>' +
    '<span class="cart__hint" aria-hidden="true">+</span></button>' +
    '<form class="cart__panel" method="POST" hidden>' +
    '<input type="text" name="_honey" class="order__hp" tabindex="-1" autocomplete="off">' +
    '<ul class="cart__items"></ul>' +
    '<label class="order__label" for="cart-em">Your email</label>' +
    '<input class="order__email" id="cart-em" type="email" name="email" required ' +
    'autocomplete="email" placeholder="you@gmail.com">' +
    '<button class="btn btn--buy order__send" type="submit">PLACE ORDER</button>' +
    '<p class="order__claim">An order is a claim · first confirmed payment gets it</p>' +
    '</form>';
  document.body.appendChild(bar);

  var sum = bar.querySelector('.cart__sum');
  var panel = bar.querySelector('.cart__panel');
  var list = bar.querySelector('.cart__items');
  var nEl = bar.querySelector('[data-cart-n]');
  var tEl = bar.querySelector('[data-cart-total]');
  var hint = bar.querySelector('.cart__hint');

  sum.addEventListener('click', function () {
    var open = panel.hidden;
    panel.hidden = !open;
    sum.setAttribute('aria-expanded', open ? 'true' : 'false');
    hint.textContent = open ? '−' : '+';
    if (open) {
      var em = panel.querySelector('.order__email');
      if (em) em.focus();
    }
  });

  /* ── the buttons ────────────────────────────────────────────────────── */

  for (var j = 0; j < order.length; j++) {
    (function (r) {
      var li = document.getElementById(r.id);
      var buy = li.querySelector('.rec__buy');
      if (!buy) return;
      var d = buy.querySelector('.order');
      if (d) d.hidden = true; /* the no-script form folds away */
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn--buy cart__add';
      b.addEventListener('click', function () {
        if (count(r.id) >= r.qty) return;
        cart.push(r.id);
        save();
        render();
      });
      r.btn = b;
      buy.appendChild(b);
    })(recs[order[j]]);
  }

  /* ── one picture of the state ───────────────────────────────────────── */

  function render() {
    for (var i = 0; i < order.length; i++) {
      var r = recs[order[i]];
      if (!r.btn) continue;
      var k = count(r.id);
      var full = k >= r.qty;
      r.btn.textContent = k === 0 ? 'ADD TO CART' : full ? 'IN CART' : 'IN CART · ADD ANOTHER';
      r.btn.disabled = full;
      r.btn.classList.toggle('cart__add--in', k > 0);
    }

    if (!cart.length) {
      bar.hidden = true;
      panel.hidden = true;
      sum.setAttribute('aria-expanded', 'false');
      hint.textContent = '+';
      document.body.classList.remove('has-cart');
      return;
    }

    bar.hidden = false;
    document.body.classList.add('has-cart');
    nEl.textContent = cart.length === 1 ? '1 record' : cart.length + ' records';
    tEl.textContent = peso(total());

    var rows = '';
    for (var i = 0; i < order.length; i++) {
      var r = recs[order[i]];
      var k = count(r.id);
      if (!k) continue;
      rows +=
        '<li class="cart__item"><span class="cart__what">' +
        r.title + (k > 1 ? ' ×' + k : '') +
        '</span><span class="cart__px">' + peso(r.price * k) + '</span>' +
        '<button class="cart__rm" type="button" data-rm="' + r.id + '" ' +
        'aria-label="Remove ' + r.title + '">×</button></li>';
    }
    list.innerHTML = rows;
  }

  list.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rm]');
    if (!b) return;
    var id = b.getAttribute('data-rm');
    for (var i = cart.length - 1; i >= 0; i--) {
      if (cart[i] === id) { cart.splice(i, 1); break; }
    }
    save();
    render();
  });

  /* ── the one email ──────────────────────────────────────────────────── */

  panel.addEventListener('submit', function () {
    var ino =
      'ino 0x' +
      Math.max(1, Math.round((Date.now() - EPOCH) / 1000)).toString(16).toUpperCase();

    var lines = [];
    for (var i = 0; i < order.length; i++) {
      var r = recs[order[i]];
      var k = count(r.id);
      if (k) lines.push(r.title + (k > 1 ? ' ×' + k : '') + ' — ' + peso(r.price * k));
    }
    var what = cart.length === 1 ? recs[cart[0]].title : cart.length + ' records';
    var sub = 'Order · ' + what + ' · ' + peso(total()) + ' · ' + ino;
    var reply =
      'We received your order: ' + lines.join('; ') + '. Total ' + peso(total()) + '. ' +
      'An order is a claim and the first confirmed payment gets the record. ' +
      'The payment steps, the GCash details, and where to send your screenshot are at ' +
      NEXT + '. INODERECORDS · Quezon City';

    var add = function (n, v) {
      var inp = document.createElement('input');
      inp.type = 'hidden';
      inp.name = n;
      inp.value = v;
      panel.appendChild(inp);
    };
    add('_subject', sub);
    add('_template', 'table');
    add('_next', NEXT);
    add('_autoresponse', reply);
    add('order', ino);
    add('records', lines.join('\n'));
    add('total', peso(total()));
    panel.setAttribute('action', ACTION);

    try {
      sessionStorage.setItem('inode.order', JSON.stringify({
        ino: ino,
        record: lines.join(' · '),
        price: peso(total()),
      }));
      localStorage.removeItem(KEY); /* the claim is placed; the cart is done */
    } catch (e) { /* private window: ordered.html shows the generic copy */ }
  });

  render();
})();
