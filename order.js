(function() {
    "use strict";
    var forms = document.querySelectorAll(".order__form");
    if (!forms.length) return;
    var EPOCH = Date.UTC(2026, 0, 1);
    for (var i = 0; i < forms.length; i++) {
        (function(f) {
            f.addEventListener("submit", function() {
                var ino = "ino 0x" + Math.max(1, Math.round((Date.now() - EPOCH) / 1e3)).toString(16).toUpperCase();
                var num = f.querySelector('[name="order"]');
                var sub = f.querySelector('[name="_subject"]');
                if (num) num.value = ino;
                if (sub) sub.value += " · " + ino;
                var price = (f.querySelector('[name="price"]') || {
                    value: ""
                }).value;
                var at = Date.now();
                try {
                    localStorage.setItem("inode.order", JSON.stringify({
                        ino: ino,
                        items: [ {
                            artist: (f.querySelector('[name="record"]') || {
                                value: ""
                            }).value,
                            album: "",
                            detail: "",
                            price: price
                        } ],
                        total: price,
                        at: at,
                        until: at + 24 * 3600 * 1e3
                    }));
                } catch (e) {}
            });
        })(forms[i]);
    }
    var strips = document.querySelectorAll(".order");
    for (var j = 0; j < strips.length; j++) {
        (function(d) {
            d.addEventListener("toggle", function() {
                if (!d.open) return;
                var inp = d.querySelector(".order__email");
                if (inp) inp.focus();
            });
        })(strips[j]);
    }
})();