(function() {
    "use strict";
    var calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    var KEY = "inode.boot";
    var seen = null;
    try {
        seen = sessionStorage.getItem(KEY);
    } catch (e) {
        seen = null;
    }
    if (seen || calm.matches) return;
    try {
        sessionStorage.setItem(KEY, "1");
    } catch (e) {}
    var facts = document.querySelector("[data-facts]");
    var count = facts ? facts.textContent.replace(/\s+/g, " ").trim().toUpperCase() : "";
    var LINES = [ "INODERECORDS", "QUEZON CITY · PHILIPPINES", count, "READY" ].filter(Boolean);
    var el = document.createElement("div");
    el.className = "boot";
    el.setAttribute("aria-hidden", "true");
    var rule = document.createElement("i");
    rule.className = "boot__rule";
    el.appendChild(rule);
    document.documentElement.classList.add("is-booting");
    document.body.appendChild(el);
    var timers = [];
    var done = false;
    function finish() {
        if (done) return;
        done = true;
        for (var t = 0; t < timers.length; t++) clearTimeout(timers[t]);
        el.className = "boot boot--out";
        document.documentElement.classList.remove("is-booting");
        setTimeout(function() {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 420);
        window.removeEventListener("keydown", finish);
        window.removeEventListener("pointerdown", finish);
    }
    window.addEventListener("keydown", finish);
    window.addEventListener("pointerdown", finish);
    LINES.forEach(function(text, n) {
        timers.push(setTimeout(function() {
            var p = document.createElement("p");
            p.className = "boot__line" + (n === LINES.length - 1 ? " boot__line--on" : "");
            p.textContent = text;
            el.insertBefore(p, rule);
        }, 90 + n * 190));
    });
    timers.push(setTimeout(finish, 90 + LINES.length * 190 + 260));
})();