(function() {
    "use strict";
    var seed = document.querySelector(".order__form");
    if (!seed) return;
    var ACTION = seed.getAttribute("action");
    var NEXT = (seed.querySelector('[name="_next"]') || {
        value: ""
    }).value;
    var EPOCH = Date.UTC(2026, 0, 1);
    var KEY = "inode.cart";
    var CLAIM = {
        url: document.body.getAttribute("data-claim-url") || "",
        key: document.body.getAttribute("data-claim-key") || ""
    };
    var recs = {};
    var order = [];
    var lis = document.querySelectorAll(".rec[data-title]");
    for (var i = 0; i < lis.length; i++) {
        var li = lis[i];
        recs[li.id] = {
            id: li.id,
            title: li.getAttribute("data-title"),
            price: parseInt(li.getAttribute("data-price"), 10) || 0,
            shelf: parseInt(li.getAttribute("data-qty"), 10) || 1,
            qty: parseInt(li.getAttribute("data-qty"), 10) || 1,
            btn: null
        };
        order.push(li.id);
    }
    function load() {
        try {
            var c = JSON.parse(localStorage.getItem(KEY) || "[]");
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
        try {
            localStorage.setItem(KEY, JSON.stringify(cart));
        } catch (e) {}
    }
    var cart = load();
    var peso = function(n) {
        return "₱" + n.toLocaleString("en-US");
    };
    var count = function(id) {
        var k = 0;
        for (var i = 0; i < cart.length; i++) if (cart[i] === id) k++;
        return k;
    };
    var total = function() {
        var t = 0;
        for (var i = 0; i < cart.length; i++) t += recs[cart[i]].price;
        return t;
    };
    var topbar = document.querySelector(".bar");
    var icon = document.createElement("button");
    icon.type = "button";
    icon.className = "bar__cart";
    icon.setAttribute("aria-expanded", "false");
    icon.setAttribute("aria-label", "Cart");
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' + '<path d="M3 4h3l2.6 12H20"/><path d="M6.6 6h14.2l-1.9 8H8.3"/>' + '<rect x="9" y="18.6" width="2.6" height="2.6" fill="currentColor" stroke="none"/>' + '<rect x="16.4" y="18.6" width="2.6" height="2.6" fill="currentColor" stroke="none"/></svg>' + '<span class="bar__cart-n" data-cart-badge hidden></span>';
    if (topbar) topbar.appendChild(icon);
    var box = document.createElement("aside");
    box.className = "cart";
    box.hidden = true;
    box.innerHTML = '<div class="cart__head"><span data-cart-n>CART</span><span data-cart-total></span>' + '<button class="cart__close" type="button" aria-label="Close cart">×</button></div>' + '<p class="cart__empty" hidden>CART IS EMPTY</p>' + '<form class="cart__panel" method="POST">' + '<input type="text" name="_honey" class="order__hp" tabindex="-1" autocomplete="off">' + '<ul class="cart__items"></ul>' + '<p class="cart__note" data-note hidden role="status"></p>' + '<label class="order__label" for="cart-em">Your email</label>' + '<input class="order__email" id="cart-em" type="email" name="email" required ' + 'autocomplete="email" placeholder="you@gmail.com">' + '<label class="order__label" for="cart-nm">Your name</label>' + '<input class="order__email" id="cart-nm" type="text" name="name" required ' + 'maxlength="120" autocomplete="name" placeholder="Juan Dela Cruz">' + '<label class="order__label" for="cart-ad">Ship to</label>' + '<textarea class="order__email order__area" id="cart-ad" name="address" required ' + 'maxlength="500" autocomplete="street-address" rows="3" ' + 'placeholder="Street · barangay · city (Lalamove or LBC, shouldered by you) · or say QC meetup"></textarea>' + '<button class="btn btn--buy order__send" type="submit">PLACE ORDER</button>' + '<p class="order__claim">An order is a claim · first confirmed payment gets it</p>' + "</form>";
    document.body.appendChild(box);
    var badge = icon.querySelector("[data-cart-badge]");
    var panel = box.querySelector(".cart__panel");
    var list = box.querySelector(".cart__items");
    var nEl = box.querySelector("[data-cart-n]");
    var tEl = box.querySelector("[data-cart-total]");
    var empty = box.querySelector(".cart__empty");
    var note = box.querySelector("[data-note]");
    function setOpen(open) {
        box.hidden = !open;
        icon.setAttribute("aria-expanded", open ? "true" : "false");
        if (open && cart.length) {
            var em = panel.querySelector(".order__email");
            if (em) em.focus();
        }
    }
    icon.addEventListener("click", function() {
        setOpen(box.hidden);
    });
    box.querySelector(".cart__close").addEventListener("click", function() {
        setOpen(false);
        icon.focus();
    });
    document.addEventListener("keydown", function(e) {
        if (e.key === "Escape" && !box.hidden) setOpen(false);
    });
    function pop(el, cls) {
        if (!el) return;
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
        setTimeout(function() {
            el.classList.remove(cls);
        }, 380);
    }
    for (var j = 0; j < order.length; j++) {
        (function(r) {
            var li = document.getElementById(r.id);
            var buy = li.querySelector(".rec__buy");
            if (!buy) return;
            var d = buy.querySelector(".order");
            if (d) d.hidden = true;
            var b = document.createElement("button");
            b.type = "button";
            b.className = "btn btn--buy cart__add";
            b.addEventListener("click", function() {
                if (count(r.id) >= r.qty) return;
                cart.push(r.id);
                save();
                render();
                pop(badge, "pop");
                pop(b, "cart__add--flash");
            });
            r.btn = b;
            buy.appendChild(b);
        })(recs[order[j]]);
    }
    function render() {
        for (var i = 0; i < order.length; i++) {
            var r = recs[order[i]];
            if (!r.btn) continue;
            var k = count(r.id);
            var gone = r.qty <= 0;
            var full = !gone && k >= r.qty;
            r.btn.textContent = gone ? "CLAIMED" : k === 0 ? "ADD TO CART" : full ? "IN CART" : "IN CART · ADD ANOTHER";
            r.btn.disabled = gone || full;
            r.btn.classList.toggle("cart__add--in", !gone && k > 0);
            r.btn.classList.toggle("cart__add--gone", gone);
            var tag = document.getElementById(r.id).querySelector(".tag--on");
            if (tag && gone) tag.textContent = "CLAIMED";
        }
        var n = cart.length;
        badge.hidden = !n;
        badge.textContent = n;
        icon.setAttribute("aria-label", n ? "Cart · " + n : "Cart");
        if (!n) {
            empty.hidden = false;
            panel.hidden = true;
            tEl.textContent = "";
            nEl.textContent = "CART";
            return;
        }
        empty.hidden = true;
        panel.hidden = false;
        nEl.textContent = "CART · " + (n === 1 ? "1 record" : n + " records");
        tEl.textContent = peso(total());
        var rows = "";
        for (var i = 0; i < order.length; i++) {
            var r = recs[order[i]];
            var k = count(r.id);
            if (!k) continue;
            rows += '<li class="cart__item"><span class="cart__what">' + r.title + (k > 1 ? " ×" + k : "") + '</span><span class="cart__px">' + peso(r.price * k) + "</span>" + '<button class="cart__rm" type="button" data-rm="' + r.id + '" ' + 'aria-label="Remove ' + r.title + '">×</button></li>';
        }
        list.innerHTML = rows;
    }
    list.addEventListener("click", function(e) {
        var b = e.target.closest("[data-rm]");
        if (!b) return;
        var id = b.getAttribute("data-rm");
        for (var i = cart.length - 1; i >= 0; i--) {
            if (cart[i] === id) {
                cart.splice(i, 1);
                break;
            }
        }
        save();
        render();
    });
    function refreshAvail(then) {
        if (!CLAIM.url) {
            if (then) then();
            return;
        }
        fetch(CLAIM.url + "/rest/v1/shop_availability?select=record,free", {
            headers: {
                apikey: CLAIM.key,
                Authorization: "Bearer " + CLAIM.key
            }
        }).then(function(r) {
            return r.json();
        }).then(function(rows) {
            if (!rows || !rows.length) {
                if (then) then();
                return;
            }
            for (var i = 0; i < rows.length; i++) {
                var r = recs[rows[i].record];
                if (!r) continue;
                var free = parseInt(rows[i].free, 10);
                if (!isNaN(free)) r.qty = Math.max(0, Math.min(r.shelf, free));
            }
            cart = load();
            save();
            render();
            if (then) then();
        }).catch(function() {
            if (then) then();
        });
    }
    var claimed = false;
    function buildFields(ino) {
        var old = panel.querySelectorAll("[data-gen]");
        for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
        var lines = [];
        for (var i = 0; i < order.length; i++) {
            var r = recs[order[i]];
            var k = count(r.id);
            if (k) lines.push(r.title + (k > 1 ? " ×" + k : "") + " · " + peso(r.price * k));
        }
        var what = cart.length === 1 ? recs[cart[0]].title : cart.length + " records";
        var reply = "We received your order: " + lines.join("; ") + ". Total " + peso(total()) + ". " + "An order is a claim and the first confirmed payment gets the record. " + "The payment steps, the GCash details, and where to send your screenshot are at " + NEXT + ". INODERECORDS · Quezon City";
        var add = function(n, v) {
            var inp = document.createElement("input");
            inp.type = "hidden";
            inp.name = n;
            inp.value = v;
            inp.setAttribute("data-gen", "");
            panel.appendChild(inp);
        };
        add("_subject", "Order · " + what + " · " + peso(total()) + " · " + ino);
        add("_template", "table");
        add("_next", NEXT);
        add("_autoresponse", reply);
        add("order", ino);
        add("records", lines.join("\n"));
        add("total", peso(total()));
        panel.setAttribute("action", ACTION);
        return lines;
    }
    function sendOff(ino, lines) {
        try {
            sessionStorage.setItem("inode.order", JSON.stringify({
                ino: ino,
                record: lines.join(" · "),
                price: peso(total())
            }));
            localStorage.removeItem(KEY);
        } catch (e) {}
    }
    panel.addEventListener("submit", function(e) {
        if (!cart.length) {
            e.preventDefault();
            return;
        }
        var ino = "ino 0x" + Math.max(1, Math.round((Date.now() - EPOCH) / 1e3)).toString(16).toUpperCase();
        var lines = buildFields(ino);
        if (!CLAIM.url || claimed) {
            sendOff(ino, lines);
            return;
        }
        e.preventDefault();
        note.hidden = true;
        var items = [];
        for (var i = 0; i < order.length; i++) {
            var k = count(order[i]);
            if (k) items.push({
                record: order[i],
                n: k
            });
        }
        var field = function(sel) {
            var el = panel.querySelector(sel);
            return el ? el.value : "";
        };
        fetch(CLAIM.url + "/functions/v1/order", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                items: items,
                buyer: field("#cart-em"),
                name: field("#cart-nm"),
                address: field("#cart-ad"),
                ino: ino,
                lines: lines,
                total: peso(total())
            })
        }).then(function(r) {
            return r.json();
        }).then(function(res) {
            if (res && res.ok === false && (res.why === "claimed" || res.why === "unknown")) {
                var r = recs[res.record];
                var name = r ? r.title : res.record;
                for (var i = cart.length - 1; i >= 0; i--) {
                    if (cart[i] === res.record) cart.splice(i, 1);
                }
                save();
                note.textContent = "JUST CLAIMED BY SOMEONE ELSE · " + name + " · taken out of your cart";
                note.hidden = false;
                refreshAvail();
                render();
                setOpen(true);
                return;
            }
            if (res && res.ok === true && res.mailed === true) {
                sendOff(ino, lines);
                window.location.assign("ordered.html");
                return;
            }
            claimed = true;
            sendOff(ino, lines);
            panel.submit();
        }).catch(function() {
            claimed = true;
            sendOff(ino, lines);
            panel.submit();
        });
    });
    refreshAvail();
    render();
})();
