(function() {
    "use strict";
    var root = document.documentElement;
    if (!root.classList.contains("tx")) return;
    var FX = window.INODE_FX;
    var o = null;
    try {
        o = JSON.parse(localStorage.getItem("inode.order") || "null");
    } catch (e) {
        o = null;
    }
    var show = function() {
        root.classList.remove("tx");
    };
    if (!FX || !o || !o.ino || FX.calm()) {
        show();
        return;
    }
    try {
        o.seen = 1;
        localStorage.setItem("inode.order", JSON.stringify(o));
    } catch (e) {}
    var items = o.items && o.items.length ? o.items : [];
    var names = [];
    for (var i = 0; i < items.length; i++) {
        var a = String(items[i].artist || "").toUpperCase();
        if (a && names.indexOf(a) < 0) names.push(a);
    }
    var who = items.length > 3 || !names.length ? items.length + " RECORDS" : names.join(" · ");
    var ino = String(o.ino);
    var wrap = document.createElement("div");
    wrap.className = "txo";
    wrap.setAttribute("aria-hidden", "true");
    var log = document.createElement("div");
    log.className = "txo__log";
    wrap.appendChild(log);
    var line = function(text, cls) {
        var p = document.createElement("p");
        p.className = "txo__line" + (cls ? " " + cls : "");
        p.textContent = text;
        log.appendChild(p);
        return p;
    };
    var L1 = line("Writing order");
    var L2 = line(ino, "txo__ino");
    var L3 = line(who);
    var L4 = line("Transmitting", "txo__tx");
    var bar = document.createElement("i");
    bar.className = "txo__bar";
    var fill = document.createElement("b");
    bar.appendChild(fill);
    L4.appendChild(bar);
    var L5 = line("Hold 24:00:00");
    var L6 = line("Transmission complete", "txo__done");
    document.body.appendChild(wrap);
    var bg = FX.field(FX.screen(), 100);
    if (!bg) {
        wrap.parentNode.removeChild(wrap);
        show();
        return;
    }
    var C = FX.CELL;
    var r = log.getBoundingClientRect();
    var box = {
        x0: Math.floor(r.left / C) - 6,
        x1: Math.ceil(r.right / C) + 6,
        y0: Math.floor(r.top / C) - 6,
        y1: Math.ceil(r.bottom / C) + 6
    };
    var vh = window.innerHeight;
    var gap = Math.max(44, vh * .1);
    var base = r.bottom + gap < vh - 32 ? r.bottom + gap : Math.max(32, r.top - gap);
    var yb = Math.round(base / C);
    var x0 = Math.max(0, Math.floor(r.left / C));
    var x1 = bg.w - 1 - x0;
    var wave = 0, tear = 0, filled = 0;
    var BLOCKS = 24;
    function paint(n) {
        var amp = wave > 0 ? wave * Math.min(34, bg.h * .085) : 0;
        var cols = null;
        if (amp > 0) {
            cols = [];
            for (var x = 0; x < bg.w; x++) {
                var j = (FX.hash(x >> 1, 3, n) - .5) * 2;
                var edge = Math.min(1, (x - x0) / 40, (x1 - x) / 40);
                cols.push(edge <= 0 ? 0 : Math.abs(amp * edge * (.55 * Math.sin(x * .09 + n * 1.9) + .3 * Math.sin(x * .031 - n * 1.1) + .35 * j)));
            }
        }
        var tearing = tear > 0;
        bg.paint(function(x, y) {
            if (x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1) return 1;
            if (tearing && FX.hash(0, y >> 2, n + 50) > .9) return FX.hash(x, y, n) < .6 ? 3 : 1;
            if (wave < 0 && y === yb && x >= x0 && x <= x1) return 2;
            if (cols) {
                var c = cols[x], dy = y > yb ? y - yb : yb - y;
                if (c > 0 && dy <= c) {
                    if (c > 6 && dy > c - 1.5 && FX.hash(x, y, n + 9) < .16) return 3;
                    return FX.bayer(x, y) < 1 - dy / (c + 1) * .85 ? 2 : 1;
                }
            }
            return FX.hash(x, y, n) < .06 ? 2 : 1;
        });
        if (tear > 0) tear--;
    }
    var on = function(p) {
        p.classList.add("is-on");
    };
    var revealed = false, t0 = 0, last = -1, next = 0, safety = 0;
    var EVENTS = [ [ 140, function() {
        on(L1);
    } ], [ 320, function() {
        on(L2);
        FX.decode(L2, ino, 560);
    } ], [ 900, function() {
        on(L3);
    } ], [ 1080, function() {
        on(L4);
        wave = 1;
    } ], [ 1760, function() {
        wave = -1;
        filled = BLOCKS;
        fill.style.width = BLOCKS * 9 + "px";
    } ], [ 1840, function() {
        on(L5);
    } ], [ 2040, function() {
        on(L6);
        tear = 2;
        FX.flick(log, "is-tear", 110);
    } ], [ 2560, reveal ] ];
    function tick(now) {
        if (revealed) return;
        if (!t0) t0 = now;
        var e = now - t0;
        while (next < EVENTS.length && e >= EVENTS[next][0]) {
            EVENTS[next++][1]();
            if (revealed) return;
        }
        if (wave > 0) {
            var k = Math.min(1, (e - 1080) / 680);
            var b = Math.floor(k * BLOCKS);
            if (b !== filled) {
                filled = b;
                fill.style.width = b * 9 + "px";
            }
            wave = Math.max(.25, 1 - k * .6);
        }
        var n = Math.floor(e * 24 / 1e3);
        if (n !== last) {
            last = n;
            paint(n);
        }
        requestAnimationFrame(tick);
    }
    function after() {
        var qr = document.querySelector(".done__scan");
        if (!qr) return;
        var go = function() {
            FX.develop(qr, {
                ms: 720
            });
        };
        if (!("IntersectionObserver" in window)) {
            go();
            return;
        }
        var io = new IntersectionObserver(function(es) {
            for (var i = 0; i < es.length; i++) {
                if (es[i].isIntersecting) {
                    io.disconnect();
                    go();
                    return;
                }
            }
        }, {
            threshold: .6
        });
        io.observe(qr);
    }
    function reveal() {
        if (revealed) return;
        revealed = true;
        clearTimeout(safety);
        window.removeEventListener("keydown", reveal);
        window.removeEventListener("pointerdown", reveal);
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        bg.kill();
        show();
        FX.tune(FX.screen(), {
            z: 100,
            ms: 480,
            band: .2,
            dust: .06,
            done: after
        });
    }
    window.addEventListener("keydown", reveal);
    window.addEventListener("pointerdown", reveal);
    safety = setTimeout(reveal, 4500);
    paint(0);
    requestAnimationFrame(tick);
})();
