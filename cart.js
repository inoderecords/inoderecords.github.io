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
    var HOLD = 24 * 3600 * 1e3;
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
            artist: li.getAttribute("data-artist") || li.getAttribute("data-title"),
            album: li.getAttribute("data-album") || "",
            detail: li.getAttribute("data-detail") || "",
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
    var esc = function(s) {
        return String(s).replace(/[&<>"']/g, function(c) {
            return {
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;"
            }[c];
        });
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
    var copies = function(k) {
        return k > 1 ? " · " + k + " copies" : "";
    };
    var topbar = document.querySelector(".bar");
    var icon = document.createElement("button");
    icon.type = "button";
    icon.className = "bar__cart";
    icon.setAttribute("aria-expanded", "false");
    icon.setAttribute("aria-label", "Cart");
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">' + '<path d="M3 4h3l2.6 12H20"/><path d="M6.6 6h14.2l-1.9 8H8.3"/>' + '<rect x="9" y="18.6" width="2.6" height="2.6" fill="currentColor" stroke="none"/>' + '<rect x="16.4" y="18.6" width="2.6" height="2.6" fill="currentColor" stroke="none"/></svg>' + '<span class="bar__cart-n" data-cart-badge hidden></span>';
    if (topbar) topbar.appendChild(icon);
    var field = function(id, label, control, hint) {
        return '<div class="cart__field"><label class="order__label" for="' + id + '">' + label + "</label>" + control + (hint ? '<p class="cart__hint">' + hint + "</p>" : "") + "</div>";
    };
    var box = document.createElement("aside");
    box.className = "cart";
    box.hidden = true;
    box.setAttribute("aria-label", "Cart");
    box.innerHTML = '<div class="cart__head"><span class="cart__title" data-cart-n>Cart</span>' + '<button class="cart__close" type="button">Close</button></div>' + '<p class="cart__empty" hidden>Your cart is empty.</p>' + '<form class="cart__panel" method="POST">' + '<input type="text" name="_honey" class="order__hp" tabindex="-1" autocomplete="off">' + '<p class="cart__note" data-note hidden role="status"></p>' + '<ul class="cart__items"></ul>' + '<div class="cart__sum"><span>Total</span><span data-cart-total></span></div>' + '<p class="cart__ship">Plus shipping: Lalamove or LBC, paid by you. Or meet up in Quezon City.</p>' + '<div class="cart__fields">' + field("cart-em", "Email", '<input class="order__email" id="cart-em" type="email" name="email" required ' + 'maxlength="254" autocomplete="email" placeholder="you@gmail.com">', "Your order confirmation goes here.") + field("cart-nm", "Name", '<input class="order__email" id="cart-nm" type="text" name="name" required ' + 'maxlength="120" autocomplete="name" placeholder="Juan Dela Cruz">') + field("cart-ph", "Mobile number", '<input class="order__email" id="cart-ph" type="tel" name="phone" required ' + 'inputmode="tel" autocomplete="tel" pattern="[0-9+ \\-]{7,20}" ' + 'title="A mobile number, like 0917 123 4567" placeholder="0917 123 4567">', "For the courier.") + field("cart-ad", "Delivery address", '<textarea class="order__email order__area" id="cart-ad" name="address" required ' + 'maxlength="500" autocomplete="street-address" rows="3" ' + 'placeholder="Street, barangay, city"></textarea>', "Meeting up in Quezon City instead? Write “QC meetup”.") + "</div>" + '<button class="btn btn--buy order__send" type="submit">Place order</button>' + '<p class="order__fine">Your records are reserved for 24 hours while you pay.</p>' + "</form>";
    document.body.appendChild(box);
    var badge = icon.querySelector("[data-cart-badge]");
    var panel = box.querySelector(".cart__panel");
    var list = box.querySelector(".cart__items");
    var nEl = box.querySelector("[data-cart-n]");
    var tEl = box.querySelector("[data-cart-total]");
    var empty = box.querySelector(".cart__empty");
    var note = box.querySelector("[data-note]");
    var send = box.querySelector(".order__send");
    var closer = box.querySelector(".cart__close");
    function setOpen(open) {
        box.hidden = !open;
        icon.setAttribute("aria-expanded", open ? "true" : "false");
        if (open) closer.focus();
    }
    icon.addEventListener("click", function() {
        setOpen(box.hidden);
    });
    closer.addEventListener("click", function() {
        setOpen(false);
        icon.focus();
    });
    document.addEventListener("keydown", function(e) {
        if (e.key === "Escape" && !box.hidden) {
            setOpen(false);
            icon.focus();
        }
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
            r.btn.textContent = gone ? "SOLD" : k === 0 ? "ADD TO CART" : full ? "IN CART" : "IN CART · ADD ANOTHER";
            r.btn.disabled = gone || full;
            r.btn.classList.toggle("cart__add--in", !gone && k > 0);
            r.btn.classList.toggle("cart__add--gone", gone);
            var tag = document.getElementById(r.id).querySelector(".tag--on");
            if (tag && gone) tag.textContent = "SOLD";
        }
        var n = cart.length;
        badge.hidden = !n;
        badge.textContent = n;
        icon.setAttribute("aria-label", n ? "Cart, " + (n === 1 ? "1 record" : n + " records") : "Cart");
        if (!n) {
            empty.hidden = false;
            panel.hidden = true;
            tEl.textContent = "";
            nEl.textContent = "Cart";
            return;
        }
        empty.hidden = true;
        panel.hidden = false;
        nEl.textContent = "Cart · " + (n === 1 ? "1 record" : n + " records");
        tEl.textContent = peso(total());
        var rows = "";
        for (var i = 0; i < order.length; i++) {
            var r = recs[order[i]];
            var k = count(r.id);
            if (!k) continue;
            rows += '<li class="cart__item"><div class="cart__what">' + '<span class="cart__artist">' + esc(r.artist) + "</span>" + (r.album ? '<span class="cart__album">' + esc(r.album) + "</span>" : "") + '<span class="cart__detail">' + esc(r.detail) + copies(k) + "</span>" + '</div><div class="cart__side"><span class="cart__px">' + peso(r.price * k) + "</span>" + '<button class="cart__rm" type="button" data-rm="' + esc(r.id) + '" ' + 'aria-label="Remove ' + esc(r.title) + '">Remove</button></div></li>';
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
        note.hidden = true;
        save();
        render();
        if (cart.length) closer.focus();
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
    function itemsOf() {
        var out = [];
        for (var i = 0; i < order.length; i++) {
            var r = recs[order[i]];
            var k = count(r.id);
            if (k) out.push({
                artist: r.artist,
                album: r.album,
                detail: r.detail + copies(k),
                price: peso(r.price * k)
            });
        }
        return out;
    }
    var claimed = false;
    var busy = false;
    function setBusy(on) {
        busy = on;
        send.disabled = on;
        send.textContent = on ? "Placing order…" : "Place order";
        panel.setAttribute("aria-busy", on ? "true" : "false");
    }
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
        var reply = "We received your order, " + ino + ": " + lines.join("; ") + ". Total " + peso(total()) + ". " + "Your records are reserved for 24 hours while you pay. " + "To pay, open " + NEXT + " in the browser you ordered from and scan the QR with GCash, Maya or any bank app. " + "Then send your payment screenshot to the shop email shown on that page. " + "Shipping is extra: Lalamove or LBC, paid by you, unless you asked for a Quezon City meetup. INODERECORDS · Quezon City";
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
    function sendOff(ino, until) {
        var at = Date.now();
        var u = until ? Date.parse(until) : NaN;
        try {
            localStorage.setItem("inode.order", JSON.stringify({
                ino: ino,
                items: itemsOf(),
                total: peso(total()),
                at: at,
                until: isNaN(u) ? at + HOLD : u
            }));
            localStorage.removeItem(KEY);
        } catch (e) {}
    }
    panel.addEventListener("submit", function(e) {
        if (!cart.length || busy) {
            e.preventDefault();
            return;
        }
        var ino = "ino 0x" + Math.max(1, Math.round((Date.now() - EPOCH) / 1e3)).toString(16).toUpperCase();
        var lines = buildFields(ino);
        if (!CLAIM.url || claimed) {
            sendOff(ino, "");
            return;
        }
        e.preventDefault();
        setBusy(true);
        note.hidden = true;
        var items = [];
        for (var i = 0; i < order.length; i++) {
            var k = count(order[i]);
            if (k) items.push({
                record: order[i],
                n: k
            });
        }
        var value = function(sel) {
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
                buyer: value("#cart-em"),
                name: value("#cart-nm"),
                phone: value("#cart-ph"),
                address: value("#cart-ad"),
                ino: ino,
                lines: lines,
                rows: itemsOf(),
                total: peso(total())
            })
        }).then(function(r) {
            return r.json();
        }).then(function(res) {
            if (res && res.ok === false && (res.why === "claimed" || res.why === "unknown")) {
                var r = recs[res.record];
                var name = r ? r.artist + (r.album ? ", " + r.album : "") : res.record;
                for (var i = cart.length - 1; i >= 0; i--) {
                    if (cart[i] === res.record) cart.splice(i, 1);
                }
                save();
                note.textContent = "Just sold: " + name + ". We took it out of your cart.";
                note.hidden = false;
                setBusy(false);
                refreshAvail();
                render();
                setOpen(true);
                return;
            }
            if (res && res.ok === false && res.why === "bad cart") {
                note.textContent = "Something in the form didn’t go through. Check your details and try again, or message us.";
                note.hidden = false;
                setBusy(false);
                return;
            }
            if (res && res.ok === true && res.mailed === true) {
                sendOff(ino, res.until);
                window.location.assign("ordered.html");
                return;
            }
            claimed = true;
            sendOff(ino, res && res.until);
            panel.submit();
        }).catch(function() {
            claimed = true;
            sendOff(ino, "");
            panel.submit();
        });
    });
    refreshAvail();
    render();
})();
