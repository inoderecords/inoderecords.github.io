(function() {
    "use strict";
    var root = document.querySelector("[data-crate]");
    if (!root) return;
    var canvas = root.querySelector(".crate__canvas");
    var items = Array.prototype.slice.call(root.querySelectorAll(".rec"));
    if (!canvas || items.length === 0) return;
    var calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    var N = items.length;
    var VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}";
    var FRAG = [ "precision highp float;", "uniform vec2  uRes;", "uniform sampler2D uT0, uT1, uT2, uT3;", "uniform vec4  uD;", "uniform vec4  uVar;", "uniform vec4  uRev;", "uniform float uOut;", "uniform float uSpin;", "uniform float uTime;", "uniform float uCell;", "uniform sampler2D uP1, uP2;", "uniform float uDiscN;", "uniform float uDiscMix;", "uniform float uReveal;", "uniform float uGap;", "uniform float uZoom;", "uniform float uShift;", "uniform float uTilt;", "const vec3 LUMA=vec3(0.299,0.587,0.114);", "const float HALF=0.50;", "const float SLEEVE_Z=0.028;", "const float R_REC=0.455;", "const float REC_Z=0.007;", "float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }", "float vnoise(vec2 p){", "  vec2 i=floor(p), f=fract(p);", "  f=f*f*(3.0-2.0*f);", "  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),", "             mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x), f.y);", "}", "vec4 discPhoto(sampler2D tex, vec2 q, float rr){", "  return texture2D(tex, (q/rr)*0.5+0.5);", "}", "void drawDisc(sampler2D tex, float dx, float zb, float rr, float rz, float dim,", "              vec3 lo, vec3 ld, inout float best, inout float g,", "              inout vec3 rgb, inout float solid){", "  vec3 q=lo-vec3(dx, 0.0, zb);", "  int face=0; float bt=best; vec4 px=vec4(0.0);", "  for(int i=0;i<2;i++){", "    float z=(i==0)? rz : -rz;", "    if(abs(ld.z)>1e-5){", "      float tt=(z-q.z)/ld.z;", "      if(tt>0.0 && tt<bt){", "        vec2 w=(q+ld*tt).xy;", "        if(length(w)<=rr){", "          vec4 sm=discPhoto(tex, w, rr);", "          if(sm.a>0.5){ bt=tt; face=(i==0)?1:2; px=sm; }", "        }", "      }", "    }", "  }", "  float a=dot(ld.xy,ld.xy);", "  if(a>1e-6){", "    float bq=2.0*dot(q.xy,ld.xy);", "    float cq=dot(q.xy,q.xy)-rr*rr;", "    float dsc=bq*bq-4.0*a*cq;", "    if(dsc>0.0){", "      float sq=sqrt(dsc);", "      for(int k=0;k<2;k++){", "        float tt=(k==0)?(-bq-sq)/(2.0*a):(-bq+sq)/(2.0*a);", "        if(tt>0.0 && tt<bt && abs(q.z+ld.z*tt)<=rz){ bt=tt; face=3; }", "      }", "    }", "  }", "  if(face==0) return;", "  best=bt;", "  vec3 p=q+ld*bt;", "  if(face==3){ g=0.24*dim; rgb=vec3(0.075)*dim; }", "  else if(face==2){ g=0.13*dim; rgb=vec3(0.048)*dim; }", "  else {", "    float sh=0.055*pow(clamp(length(p.xy)/rr, 0.0, 1.0), 1.6);", "    vec3 cc=px.rgb+vec3(sh);", "    g=min(1.0, dot(cc, LUMA)*1.28)*dim;", "    rgb=cc*dim;", "  }", "  solid=uDiscMix;", "}", "float b0(vec2 a){ a=floor(a); return fract(a.x*0.5+a.y*a.y*0.75); }", "float b1(vec2 a){ return b0(a*0.5)*0.25+b0(a); }", "float b2(vec2 a){ return b1(a*0.5)*0.25+b0(a); }", "float b3(vec2 a){ return b2(a*0.5)*0.25+b0(a); }", "bool hitBox(vec3 ro, vec3 rd, vec3 b, out float t, out vec3 n){", "  vec3 m=1.0/rd, k=abs(m)*b;", "  vec3 t1=-m*ro-k, t2=-m*ro+k;", "  float tN=max(max(t1.x,t1.y),t1.z);", "  float tF=min(min(t2.x,t2.y),t2.z);", "  if(tN>tF||tF<0.0) return false;", "  t=tN;", "  n=-sign(rd)*step(t1.yzx,t1.xyz)*step(t1.zxy,t1.xyz);", "  return true;", "}", "vec3 cover(sampler2D tex, vec2 uv, float rev, out float edge, out float tone, out float solid){", "  edge=0.0; solid=0.0;", "  vec3 c=texture2D(tex, uv).rgb;", "  float lum=dot(c, LUMA);", "  float BAND=0.17;", "  float front=(1.0+2.0*BAND)*(1.0-rev)-BAND;", "  float d=(1.0-uv.y)-front;", "  if(d < -BAND){", "    float s=hash(floor(uv*160.0)+floor(uTime*18.0));", "    tone=0.06+0.10*s;", "    return c;", "  }", "  float k=clamp((d+BAND)/BAND, 0.0, 1.0);", "  edge=1.0-smoothstep(0.0, 0.10, abs(d));", "  float s=hash(floor(uv*220.0)+floor(uTime*24.0));", "  tone=mix(0.10+0.80*s, lum, k*k);", "  solid=smoothstep(0.58, 1.0, k);", "  return c;", "}", "void place(float d, out vec3 c, out float yaw, out float scl, out float dim){", "  float a=abs(d);", "  float s=smoothstep(0.0, 1.0, min(a, 1.0));", "  float x=sign(d)*(a<=1.0 ? s*uGap : uGap+(a-1.0)*uGap*0.42);", "  x -= uShift*(1.0-smoothstep(0.0, 0.55, a));", "  c=vec3(x, 0.0, -s*0.58);", "  yaw=-sign(d)*s*1.26;", "  scl=mix(1.0, 0.72, s);", "  dim=mix(1.0, 0.84, s);", "}", "void drawSleeve(float d, float variant, float rev, sampler2D tex,", "                vec3 ro, vec3 rd, inout float best, inout float g, inout float blue,", "                inout vec3 rgb, inout float solid){", "  if(abs(d) > 2.3) return;", "  vec3 c; float yaw, scl, dim;", "  place(d, c, yaw, scl, dim);", "  vec3 o=ro-c;", "  float cy=cos(-yaw), sy=sin(-yaw);", "  vec3 lo=vec3(o.x*cy+o.z*sy, o.y, -o.x*sy+o.z*cy);", "  vec3 ld=vec3(rd.x*cy+rd.z*sy, rd.y, -rd.x*sy+rd.z*cy);", "  bool jewel = variant>3.5;", "  float xH=HALF*scl;", "  float yH=(jewel ? HALF*0.88 : HALF)*scl;", "  float zH=(jewel ? 0.062 : SLEEVE_Z)*scl;", "  float t; vec3 n;", "  if(hitBox(lo, ld, vec3(xH,yH,zH), t, n) && t<best){", "    best=t;", "    vec3 p=lo+ld*t;", "    float gg;", "    if(n.z>0.5){", "      vec2 cuv=vec2((p.x/xH)*0.5+0.5, (p.y/yH)*0.5+0.5);", "      float e, tn, sol;", "      vec3 cc=cover(tex, cuv, rev, e, tn, sol);", "      blue=e*dim; solid=sol;", "      if(jewel){", "        float sh=0.5+0.5*sin((p.x*3.0+p.y*1.4)*2.0+uSpin*0.7);", "        float hi=0.10+0.16*sh*uOut;", "        tn=mix(tn, 1.0, hi);", "        cc=mix(cc, vec3(1.0), hi);", "        if(p.x < -xH*0.84){ tn=0.88; cc=vec3(0.86); }", "      } else {", "        float wear=0.94+0.10*vnoise(p.xy*7.0);", "        tn*=wear; cc*=wear;", "        float ex=1.0-smoothstep(xH-0.022*scl, xH, max(abs(p.x),abs(p.y)));", "        tn=mix(0.82, tn, ex);", "        cc=mix(vec3(0.80), cc, ex);", "      }", "      gg=tn; rgb=cc*dim;", "    } else if(abs(n.x)>0.5){", "      blue=0.0; solid=0.0;", "      gg = n.x>0.0 ? 0.30 : 0.62;", "      if(n.x>0.0 && !jewel) gg=mix(0.30, 0.04, smoothstep(0.0,0.35,uOut));", "    } else {", "      blue=0.0; solid=0.0;", "      gg = n.y>0.0 ? 0.52 : 0.18;", "    }", "    g=gg*dim;", "  }", "  if(!jewel && uDiscN>0.5 && uOut>0.004 && abs(d)<0.5){", "    float rr=R_REC*scl, rz=REC_Z*scl;", "    float z0=-(SLEEVE_Z+REC_Z+0.004)*scl;", "    drawDisc(uP1, uOut*uReveal*scl, z0, rr, rz, dim, lo, ld, best, g, rgb, solid);", "    if(uDiscN>1.5){", "      drawDisc(uP2, uOut*uReveal*1.55*scl, z0-0.02*scl, rr, rz, dim, lo, ld, best, g, rgb, solid);", "    }", "  }", "}", "void main(){", "  vec2 frag=gl_FragCoord.xy;", "  vec2 uv=(frag*2.0-uRes)/uRes.y*uZoom;", "  float D=4.4;", "  float ct=cos(uTilt), st=sin(uTilt);", "  vec3 ro=vec3(0.0, 0.0, D);", "  vec3 rd=normalize(vec3(uv, -D));", "  ro=vec3(ro.x, ro.y*ct-ro.z*st, ro.y*st+ro.z*ct);", "  rd=vec3(rd.x, rd.y*ct-rd.z*st, rd.y*st+rd.z*ct);", "  float best=1e9, g=0.0, blue=0.0, solid=0.0;", "  vec3 rgb=vec3(0.0);", "  drawSleeve(uD.x, uVar.x, uRev.x, uT0, ro, rd, best, g, blue, rgb, solid);", "  drawSleeve(uD.y, uVar.y, uRev.y, uT1, ro, rd, best, g, blue, rgb, solid);", "  drawSleeve(uD.z, uVar.z, uRev.z, uT2, ro, rd, best, g, blue, rgb, solid);", "  drawSleeve(uD.w, uVar.w, uRev.w, uT3, ro, rd, best, g, blue, rgb, solid);", "  float dth=b3(frag/uCell)*0.92+0.04;", "  vec3 ink=vec3(0.039,0.039,0.039), paper=vec3(0.957,0.953,0.937);", "  vec3 col=mix(mix(ink, paper, step(dth, g)), rgb, clamp(solid, 0.0, 1.0));", "  col=mix(col, vec3(0.141,0.0,1.0), clamp(blue,0.0,1.0)*0.92);", "  gl_FragColor=vec4(col,1.0);", "}" ].join("\n");
    function compile(gl, type, src) {
        var s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            if (window.console) console.warn("crate:", gl.getShaderInfoLog(s));
            return null;
        }
        return s;
    }
    var DPR_MAX = 2;
    var CELL_CSS = 2;
    var MAX_PX = 26e5;
    var HALF = .5, R_REC = .455;
    var FULL = .9;
    function pullOf(open) {
        return Math.max(.12, Math.min(FULL, HALF - open * R_REC));
    }
    var gl = null, prog = null, U = {}, texOf = {}, blank = null;
    function initGL() {
        try {
            var o = {
                antialias: false,
                alpha: false,
                depth: false,
                powerPreference: "low-power"
            };
            gl = canvas.getContext("webgl", o) || canvas.getContext("experimental-webgl", o);
        } catch (e) {
            gl = null;
        }
        if (!gl) return false;
        var vs = compile(gl, gl.VERTEX_SHADER, VERT);
        var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
        if (!vs || !fs) return false;
        prog = gl.createProgram();
        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            if (window.console) console.warn("crate:", gl.getProgramInfoLog(prog));
            return false;
        }
        gl.useProgram(prog);
        var buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ -1, -1, 3, -1, -1, 3 ]), gl.STATIC_DRAW);
        var loc = gl.getAttribLocation(prog, "p");
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        [ "uRes", "uD", "uVar", "uRev", "uOut", "uSpin", "uTime", "uGap", "uZoom", "uShift", "uTilt", "uCell", "uDiscN", "uDiscMix", "uReveal", "uT0", "uT1", "uT2", "uT3", "uP1", "uP2" ].forEach(function(k) {
            U[k] = gl.getUniformLocation(prog, k);
        });
        gl.uniform1i(U.uT0, 0);
        gl.uniform1i(U.uT1, 1);
        gl.uniform1i(U.uT2, 2);
        gl.uniform1i(U.uT3, 3);
        gl.uniform1i(U.uP1, 4);
        gl.uniform1i(U.uP2, 5);
        blank = mkTex();
        return true;
    }
    function mkTex(fmt) {
        var f = fmt || gl.RGB;
        var px = f === gl.RGBA ? [ 0, 0, 0, 0 ] : [ 28, 28, 28 ];
        var t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, f, 1, 1, 0, f, gl.UNSIGNED_BYTE, new Uint8Array(px));
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return t;
    }
    function upload(src, fmt, onFirst) {
        if (texOf[src]) return;
        var t = mkTex(fmt);
        texOf[src] = t;
        var img = new Image;
        img.onload = function() {
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, fmt, fmt, gl.UNSIGNED_BYTE, img);
            ready[src] = true;
            if (onFirst) onFirst();
            kick();
        };
        img.src = src;
    }
    function loadArt() {
        items.forEach(function(el) {
            var cover = el.getAttribute("data-art");
            if (cover) {
                upload(cover, gl.RGB, function() {
                    if (!live) {
                        live = true;
                        root.setAttribute("data-live", "yes");
                    }
                });
            }
            (el.getAttribute("data-discs") || "").split(",").filter(Boolean).forEach(function(d) {
                upload(d, gl.RGBA, null);
            });
        });
    }
    var ready = {};
    var live = false;
    var data = items.map(function(el, i) {
        return {
            el: el,
            i: i,
            variant: parseFloat(el.getAttribute("data-variant")) || 0,
            art: el.getAttribute("data-art") || "",
            discs: (el.getAttribute("data-discs") || "").split(",").filter(Boolean),
            open: parseFloat(el.getAttribute("data-open")),
            rev: 1,
            revving: false,
            seen: false
        };
    });
    var pos = 0;
    var aim = 0;
    var vel = 0;
    var out = 0, aimOut = 0;
    var spin = 0;
    var tilt = .06, aimTilt = .06;
    var settleAt = 0;
    var dragging = false;
    var running = false, last = 0;
    var cell = CELL_CSS;
    function size() {
        var r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return;
        var dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
        var w = r.width * dpr;
        var h = r.height * dpr;
        var px = w * h;
        if (px > MAX_PX) {
            var k = Math.sqrt(MAX_PX / px);
            w *= k;
            h *= k;
        }
        w = Math.max(1, Math.round(w));
        h = Math.max(1, Math.round(h));
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
            gl.viewport(0, 0, w, h);
        }
        cell = Math.max(1, Math.round(CELL_CSS * (w / r.width)));
        gl.uniform2f(U.uRes, canvas.width, canvas.height);
    }
    function frame(now) {
        var dt = Math.min(now - last || 16, 48);
        last = now;
        var moving = false;
        if (!dragging) {
            var k = 120, c = 2 * Math.sqrt(k), s = dt / 1e3;
            vel += ((aim - pos) * k - vel * c) * s;
            pos += vel * s;
            if (Math.abs(aim - pos) > 8e-4 || Math.abs(vel) > 8e-4) moving = true; else {
                pos = aim;
                vel = 0;
            }
        } else {
            moving = true;
        }
        var settled = !dragging && !moving;
        var SETTLE = 260;
        var counting = false;
        if (settled) {
            if (!settleAt) settleAt = now;
            if (now - settleAt > SETTLE) aimOut = calm.matches ? .55 : .92; else counting = true;
        } else {
            settleAt = 0;
            aimOut = 0;
        }
        var od = aimOut - out;
        if (Math.abs(od) > .002) {
            out += od * Math.min(1, dt / 190);
            moving = true;
        } else out = aimOut;
        var cur = data[clamp(Math.round(pos), 0, N - 1)];
        if (settled && !cur.seen) {
            cur.seen = true;
            if (!calm.matches) {
                cur.rev = 0;
                cur.revving = true;
            }
        }
        for (var i = 0; i < N; i++) {
            var d = data[i];
            if (d.revving && d.rev < 1) {
                d.rev = Math.min(1, d.rev + dt / 820);
                if (d.rev >= 1) d.revving = false;
                moving = true;
            }
        }
        if (Math.abs(aimTilt - tilt) > 5e-4) {
            tilt += (aimTilt - tilt) * Math.min(1, dt / 220);
            moving = true;
        }
        draw(now);
        var alive = moving || counting;
        if (alive) requestAnimationFrame(frame); else running = false;
    }
    function kick() {
        if (running || !gl) return;
        running = true;
        last = 0;
        requestAnimationFrame(frame);
    }
    function draw(now) {
        size();
        gl.useProgram(prog);
        var base = Math.floor(pos) - 1;
        var D = [ 99, 99, 99, 99 ], V = [ 0, 0, 0, 0 ], R = [ 0, 0, 0, 0 ];
        for (var s = 0; s < 4; s++) {
            var idx = base + s;
            gl.activeTexture(gl.TEXTURE0 + s);
            if (idx < 0 || idx >= N) {
                gl.bindTexture(gl.TEXTURE_2D, blank);
                continue;
            }
            var d = data[idx];
            D[s] = idx - pos;
            V[s] = d.variant;
            R[s] = d.rev;
            gl.bindTexture(gl.TEXTURE_2D, d.art && texOf[d.art] || blank);
        }
        gl.uniform4f(U.uD, D[0], D[1], D[2], D[3]);
        gl.uniform4f(U.uVar, V[0], V[1], V[2], V[3]);
        gl.uniform4f(U.uRev, R[0], R[1], R[2], R[3]);
        var aspect = canvas.width / Math.max(1, canvas.height);
        var centre = data[clamp(Math.round(pos), 0, N - 1)];
        var nd = centre.variant > 3.5 ? 0 : Math.min(2, centre.discs.length);
        gl.activeTexture(gl.TEXTURE0 + 4);
        gl.bindTexture(gl.TEXTURE_2D, nd > 0 && texOf[centre.discs[0]] || blank);
        gl.activeTexture(gl.TEXTURE0 + 5);
        gl.bindTexture(gl.TEXTURE_2D, nd > 1 && texOf[centre.discs[1]] || blank);
        var pull = pullOf(isNaN(centre.open) ? 0 : centre.open);
        var far = nd ? (pull * nd - (nd - 1) * pull * .45) * out + R_REC : HALF;
        var half = (HALF + Math.max(HALF, far)) / 2;
        var shift = Math.max(0, (far - HALF) / 2);
        var zoom = Math.max(.62, half * 1.14 / aspect);
        gl.uniform1f(U.uOut, out);
        gl.uniform1f(U.uSpin, spin);
        gl.uniform1f(U.uTime, now / 1e3);
        gl.uniform1f(U.uDiscN, nd);
        gl.uniform1f(U.uReveal, pull);
        gl.uniform1f(U.uDiscMix, calm.matches ? 1 : smoothstep(.42, .94, out));
        gl.uniform1f(U.uTilt, tilt);
        gl.uniform1f(U.uCell, cell);
        gl.uniform1f(U.uZoom, zoom);
        gl.uniform1f(U.uShift, shift);
        var halfW = zoom * aspect;
        gl.uniform1f(U.uGap, Math.max(half + .58, .86 * halfW));
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    function clamp(v, lo, hi) {
        return v < lo ? lo : v > hi ? hi : v;
    }
    function smoothstep(a, b, x) {
        var t = clamp((x - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
    }
    var dots = root.querySelector(".crate__dots");
    var posEl = root.querySelector("[data-pos]");
    var provA = root.querySelector("[data-prov-a]");
    var provB = root.querySelector("[data-prov-b]");
    var prevBtn = root.querySelector('[data-step="-1"]');
    var nextBtn = root.querySelector('[data-step="1"]');
    var stage = root.querySelector(".crate__stage");
    var stillImg = null;
    function paint() {
        var n = clamp(Math.round(aim), 0, N - 1);
        items.forEach(function(el, i) {
            var on = i === n;
            el.classList.toggle("is-on", on);
            el.setAttribute("aria-hidden", on ? "false" : "true");
            el.inert = !on;
        });
        if (dots) {
            Array.prototype.forEach.call(dots.children, function(li, i) {
                li.classList.toggle("is-on", i === n);
                var b = li.querySelector("button");
                if (b) b.setAttribute("aria-current", i === n ? "true" : "false");
            });
        }
        if (prevBtn) prevBtn.disabled = n <= 0;
        if (nextBtn) nextBtn.disabled = n >= N - 1;
        root.setAttribute("data-at", String(n + 1));
        if (posEl) posEl.textContent = (n + 1 < 10 ? "0" : "") + (n + 1);
        if (provA) provA.textContent = items[n].getAttribute("data-prov1") || "";
        if (provB) provB.textContent = items[n].getAttribute("data-prov2") || "";
        if (!live && stillImg && data[n].art) stillImg.src = data[n].art;
    }
    function go(n, immediate) {
        n = clamp(n, 0, N - 1);
        if (n === aim && !immediate) return;
        aim = n;
        if (immediate) {
            pos = n;
            vel = 0;
        }
        paint();
        kick();
    }
    var step = function(dir) {
        go(aim + dir);
    };
    if (prevBtn) prevBtn.addEventListener("click", function() {
        step(-1);
    });
    if (nextBtn) nextBtn.addEventListener("click", function() {
        step(1);
    });
    if (dots) {
        dots.addEventListener("click", function(e) {
            var b = e.target.closest ? e.target.closest("button[data-go]") : null;
            if (b) go(parseInt(b.getAttribute("data-go"), 10));
        });
    }
    window.addEventListener("keydown", function(e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        var t = e.target;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        var k = e.key;
        if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown") {
            step(1);
            e.preventDefault();
        } else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp") {
            step(-1);
            e.preventDefault();
        } else if (k === "Home") {
            go(0);
            e.preventDefault();
        } else if (k === "End") {
            go(N - 1);
            e.preventDefault();
        } else if (k >= "1" && k <= "9") {
            var n = parseInt(k, 10) - 1;
            if (n < N) {
                go(n);
                e.preventDefault();
            }
        }
    });
    var wheelAcc = 0, wheelLock = false, wheelIdle = null;
    stage.addEventListener("wheel", function(e) {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.4) return;
        e.preventDefault();
        clearTimeout(wheelIdle);
        wheelIdle = setTimeout(function() {
            wheelLock = false;
            wheelAcc = 0;
        }, 140);
        if (wheelLock) return;
        wheelAcc += e.deltaY + e.deltaX;
        if (Math.abs(wheelAcc) < 42) return;
        step(wheelAcc > 0 ? 1 : -1);
        wheelAcc = 0;
        wheelLock = true;
    }, {
        passive: false
    });
    var dragFrom = 0, dragPos = 0, dragId = null, moved = 0;
    stage.addEventListener("pointerdown", function(e) {
        if (e.button !== undefined && e.button !== 0) return;
        if (e.target.closest && e.target.closest("button, a")) return;
        dragging = true;
        dragId = e.pointerId;
        dragFrom = e.clientX;
        dragPos = pos;
        moved = 0;
        vel = 0;
        settleAt = 0;
        aimOut = 0;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add("is-dragging");
        kick();
    });
    stage.addEventListener("pointermove", function(e) {
        if (!dragging || e.pointerId !== dragId) return;
        var dx = e.clientX - dragFrom;
        moved = Math.max(moved, Math.abs(dx));
        var unit = Math.max(120, stage.clientHeight * .52);
        pos = clamp(dragPos - dx / unit, -.35, N - 1 + .35);
        kick();
    });
    function endDrag(e) {
        if (!dragging || e && e.pointerId !== dragId) return;
        dragging = false;
        stage.classList.remove("is-dragging");
        if (moved < 6) {
            var r = stage.getBoundingClientRect();
            var halfW = r.height * .3;
            var dx = (e ? e.clientX : 0) - (r.left + r.width / 2);
            if (Math.abs(dx) > halfW) step(dx > 0 ? 1 : -1); else {
                go(aim, false);
                kick();
            }
        } else {
            go(Math.round(pos));
        }
    }
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    if (!calm.matches) {
        window.addEventListener("pointermove", function(e) {
            if (dragging) return;
            aimTilt = .06 + (e.clientY / window.innerHeight - .5) * .16;
            kick();
        }, {
            passive: true
        });
    }
    window.addEventListener("resize", kick);
    document.addEventListener("visibilitychange", function() {
        if (!document.hidden) kick();
    });
    root.setAttribute("data-crate", "on");
    document.documentElement.classList.add("has-crate");
    if (initGL()) {
        loadArt();
    } else {
        root.setAttribute("data-live", "no");
        stillImg = document.createElement("img");
        stillImg.className = "crate__still";
        stillImg.alt = "";
        stillImg.decoding = "async";
        stage.appendChild(stillImg);
    }
    var start = 0;
    if (location.hash) {
        var want = items.findIndex(function(el) {
            return "#" + el.id === location.hash;
        });
        if (want >= 0) start = want;
    }
    go(start, true);
    kick();
})();