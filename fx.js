(function() {
    "use strict";
    var mq = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    var calm = function() {
        return !!(mq && mq.matches);
    };
    var CELL = 2;
    var COL = [ null, [ 10, 10, 10 ], [ 244, 243, 239 ], [ 36, 0, 255 ] ];
    var B8 = [ 0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21 ];
    var GLYPHS = "!<>-_\\/[]{}=+*^?#01";
    var NS = "http://www.w3.org/2000/svg";
    function bayer(x, y) {
        return (B8[(y & 7) * 8 + (x & 7)] + .5) / 64;
    }
    function hash(x, y, s) {
        var h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1274126177);
        h = Math.imul(h ^ h >>> 15, 2246822519);
        h = Math.imul(h ^ h >>> 13, 3266489917);
        return ((h ^ h >>> 16) >>> 0) / 4294967296;
    }
    function screen() {
        return {
            left: 0,
            top: 0,
            width: document.documentElement.clientWidth || window.innerWidth,
            height: window.innerHeight
        };
    }
    function field(rect, z, abs) {
        if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
        var c = document.createElement("canvas");
        var ctx = c.getContext && c.getContext("2d");
        if (!ctx) return null;
        var w = Math.max(1, Math.ceil(rect.width / CELL));
        var h = Math.max(1, Math.ceil(rect.height / CELL));
        c.width = w;
        c.height = h;
        c.className = "fx";
        c.setAttribute("aria-hidden", "true");
        var s = c.style;
        s.position = abs ? "absolute" : "fixed";
        s.left = Math.round(rect.left + (abs ? window.pageXOffset : 0)) + "px";
        s.top = Math.round(rect.top + (abs ? window.pageYOffset : 0)) + "px";
        s.width = w * CELL + "px";
        s.height = h * CELL + "px";
        if (z) s.zIndex = z;
        var img = ctx.createImageData(w, h);
        var d = img.data;
        document.body.appendChild(c);
        return {
            el: c,
            w: w,
            h: h,
            paint: function(fn) {
                var i = 0, x, y, k;
                for (y = 0; y < h; y++) {
                    for (x = 0; x < w; x++) {
                        k = COL[fn(x, y)];
                        if (k) {
                            d[i] = k[0];
                            d[i + 1] = k[1];
                            d[i + 2] = k[2];
                            d[i + 3] = 255;
                        } else d[i + 3] = 0;
                        i += 4;
                    }
                }
                ctx.putImageData(img, 0, 0);
            },
            kill: function() {
                if (c.parentNode) c.parentNode.removeChild(c);
            }
        };
    }
    function clock(ms, fps, frame, done) {
        var t0 = 0, last = -1, over = false, guard = 0;
        function end() {
            if (over) return;
            over = true;
            clearTimeout(guard);
            if (done) done();
        }
        function tick(now) {
            if (over) return;
            if (!t0) t0 = now;
            var e = now - t0;
            if (e >= ms) {
                end();
                return;
            }
            var f = Math.floor(e * fps / 1e3);
            if (f !== last) {
                last = f;
                frame(e / ms, f);
            }
            requestAnimationFrame(tick);
        }
        guard = setTimeout(end, ms + 120);
        requestAnimationFrame(tick);
        return {
            end: end
        };
    }
    function still(f, n, rate, keep) {
        f.paint(function(x, y) {
            if (keep && keep(x, y)) return 1;
            return hash(x, y, n) < rate ? 2 : 1;
        });
    }
    function tune(rect, o) {
        o = o || {};
        var f = calm() ? null : field(rect, o.z, o.abs);
        if (!f) {
            if (o.done) o.done();
            return null;
        }
        var band = Math.max(8, Math.round(f.h * (o.band || .24)));
        var span = f.h + band + 2;
        var dust = o.dust || .07;
        function cover(t, n) {
            var front = Math.round(t * span);
            f.paint(function(x, y) {
                var d = front - y;
                if (d > band + 1) return 0;
                if (d > band) return hash(x, n, 9) < .72 ? 3 : 0;
                if (d >= 0) return bayer(x, y) < d / band ? 0 : hash(x, y, n) < .34 ? 2 : 1;
                return hash(x, y, n) < dust ? 2 : 1;
            });
        }
        cover(0, 0);
        return clock(o.ms || 300, o.fps || 30, cover, function() {
            f.kill();
            if (o.done) o.done();
        });
    }
    function decay(o) {
        o = o || {};
        var f = calm() ? null : field(screen(), o.z || 120);
        if (!f) {
            if (o.done) o.done();
            return null;
        }
        var dust = o.dust || .07;
        clock(o.ms || 380, o.fps || 24, function(t, n) {
            var cut = t * 1.1;
            var tear = n === 2 || n === 3;
            f.paint(function(x, y) {
                if (tear && hash(0, y >> 2, n) > .91) return hash(x, y, n) < .62 ? 3 : 0;
                return bayer(x, y) < cut ? hash(x, y, n) < dust ? 2 : 1 : 0;
            });
        }, function() {
            still(f, 77, dust);
            if (o.done) o.done();
        });
        return f;
    }
    function develop(el, o) {
        o = o || {};
        var f = calm() ? null : field(el.getBoundingClientRect(), o.z || 2, true);
        if (!f) return;
        var noise = function(n) {
            return function(x, y) {
                return hash(x, y, n) < .5 ? 2 : 1;
            };
        };
        f.paint(noise(0));
        clock(o.ms || 620, o.fps || 24, function(t, n) {
            var k = t * t;
            f.paint(function(x, y) {
                return bayer(x, y) < k ? 0 : hash(x, y, n) < .5 ? 2 : 1;
            });
        }, function() {
            f.kill();
        });
    }
    function decode(el, text, ms, done) {
        if (!el) return;
        clearInterval(el._dec);
        if (calm()) {
            el.textContent = text;
            if (done) done();
            return;
        }
        var steps = Math.max(4, Math.round((ms || 400) / 40)), s = 0;
        el._dec = setInterval(function() {
            s++;
            var solved = Math.floor(s / steps * text.length), out = "";
            for (var i = 0; i < text.length; i++) {
                var ch = text.charAt(i);
                out += i < solved || ch === " " ? ch : GLYPHS.charAt(Math.floor(Math.random() * GLYPHS.length));
            }
            el.textContent = out;
            if (s >= steps) {
                clearInterval(el._dec);
                el.textContent = text;
                if (done) done();
            }
        }, 40);
    }
    function flick(el, cls, ms) {
        if (!el || calm()) return;
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
        clearTimeout(el._flick);
        el._flick = setTimeout(function() {
            el.classList.remove(cls);
        }, ms || 120);
    }
    function trace(a, b, done) {
        var ra = a && a.getBoundingClientRect(), rb = b && b.getBoundingClientRect();
        if (calm() || !ra || !rb || !ra.width || !rb.width) {
            if (done) done();
            return;
        }
        var W = document.documentElement.clientWidth || window.innerWidth;
        var x0 = Math.round(ra.right) + .5;
        var y0 = Math.round(ra.top + ra.height / 2) + .5;
        var y1 = Math.round(rb.top + rb.height / 2) + .5;
        var rail = Math.round(Math.min(W - 8, Math.max(rb.right + 12, x0 + 24))) + .5;
        var x2 = Math.round(rb.right + 3) + .5;
        var pts = [ [ x0, y0 ], [ rail, y0 ], [ rail, y1 ], [ x2, y1 ] ];
        var segs = [], L = 0;
        for (var i = 1; i < pts.length; i++) {
            var l = Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
            segs.push(l);
            L += l;
        }
        var svg = document.createElementNS(NS, "svg");
        svg.setAttribute("class", "fx-trace");
        svg.setAttribute("aria-hidden", "true");
        svg.setAttribute("shape-rendering", "crispEdges");
        var line = document.createElementNS(NS, "polyline");
        line.setAttribute("points", pts.map(function(p) {
            return p.join(",");
        }).join(" "));
        line.setAttribute("stroke-dasharray", L + " " + L);
        line.setAttribute("stroke-dashoffset", L);
        var head = document.createElementNS(NS, "rect");
        head.setAttribute("width", "5");
        head.setAttribute("height", "5");
        head.setAttribute("x", String(Math.round(x0 - 2.5)));
        head.setAttribute("y", String(Math.round(y0 - 2.5)));
        svg.appendChild(line);
        svg.appendChild(head);
        document.body.appendChild(svg);
        function at(d) {
            for (var j = 0; j < segs.length; j++) {
                if (d <= segs[j] || j === segs.length - 1) {
                    var p = pts[j], q = pts[j + 1], k = segs[j] ? Math.min(1, d / segs[j]) : 1;
                    return [ p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k ];
                }
                d -= segs[j];
            }
            return pts[pts.length - 1];
        }
        clock(Math.min(340, 140 + L * .18), 30, function(t) {
            var d = L * t;
            line.setAttribute("stroke-dashoffset", String(L - d));
            var p = at(d);
            head.setAttribute("x", String(Math.round(p[0] - 2.5)));
            head.setAttribute("y", String(Math.round(p[1] - 2.5)));
        }, function() {
            line.setAttribute("stroke-dashoffset", "0");
            if (head.parentNode) svg.removeChild(head);
            if (done) done();
            var pat = [ "4 1", "2 2", "1 3", "1 6", "1 13" ], n = 0;
            var iv = setInterval(function() {
                if (n >= pat.length) {
                    clearInterval(iv);
                    if (svg.parentNode) svg.parentNode.removeChild(svg);
                    return;
                }
                line.setAttribute("stroke-dasharray", pat[n++]);
            }, 60);
        });
    }
    function sweep() {
        var old = document.querySelectorAll(".fx, .fx-trace");
        for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    }
    window.INODE_FX = {
        calm: calm,
        bayer: bayer,
        hash: hash,
        field: field,
        clock: clock,
        still: still,
        screen: screen,
        tune: tune,
        decay: decay,
        develop: develop,
        decode: decode,
        flick: flick,
        trace: trace,
        sweep: sweep,
        CELL: CELL
    };
})();
