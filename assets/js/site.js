/* The Reel Romance — interactions. No dependencies.
   Every feature is optional: if a block isn't on the page, its code does nothing,
   and if JS fails entirely the page is still complete (see .no-js in the CSS). */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const mq = (q) => window.matchMedia(q);
  const reduceMotion = mq("(prefers-reduced-motion: reduce)");
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad = (n) => String(n).padStart(2, "0");

  /* ------------------------------------------------------------ natural images
     Photos in galleries / the reel keep their own shape. The build gives a
     ratio hint; once the real file loads we use its true ratio, so swapping
     in a portrait, square or panorama photo just works. */
  function trueRatio(img) {
    const set = () => {
      if (!img.naturalWidth) return;
      const r = img.naturalWidth / img.naturalHeight;
      const hint = parseFloat(getComputedStyle(img).getPropertyValue("--ar")) || 0;
      if (Math.abs(r - hint) > 0.01) {
        img.style.setProperty("--ar", r.toFixed(4));
        document.dispatchEvent(new CustomEvent("media:resize"));
      }
      img.style.backgroundImage = "none";
    };
    if (img.complete) set(); else img.addEventListener("load", set, { once: true });
  }
  $$("img.natural").forEach(trueRatio);
  $$("img.fill").forEach((img) => {
    const done = () => { if (img.naturalWidth) img.style.backgroundImage = "none"; };
    if (img.complete) done(); else img.addEventListener("load", done, { once: true });
  });

  /* ------------------------------------------------------------ split headings into words
     Each word slides up from behind its own mask. *Emphasised* words stay whole:
     they are "written" in ink instead (see [data-ink] in the CSS). */
  function splitWords(el) {
    if (el.dataset.splitDone) return;
    el.dataset.splitDone = "1";
    let n = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((child) => {
        if (child.nodeType === 3) {
          const parts = child.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(" ")); return; }
            const w = document.createElement("span"); w.className = "w";
            const wi = document.createElement("span"); wi.className = "wi"; wi.textContent = p;
            wi.style.setProperty("--wi", n++);
            w.appendChild(wi); frag.appendChild(w);
          });
          child.replaceWith(frag);
        } else if (child.nodeType === 1 && child.tagName !== "EM" && child.tagName !== "BR") {
          walk(child);
        } else if (child.tagName === "EM") {
          child.style.setProperty("--ink-d", `${0.25 + n * 0.055}s`);
          n++;
        }
      });
    };
    walk(el);
  }
  const motionOK = !reduceMotion.matches;
  const splits = motionOK ? $$(".h2, [data-split]") : [];
  splits.forEach(splitWords);

  /* ------------------------------------------------------------ reveal on scroll */
  const reveals = $$("[data-reveal], [data-reveal-img]");
  const headings = $$(".h2");
  if ("IntersectionObserver" in window && motionOK) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add(e.target.matches(".h2") ? "is-split" : "is-in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    reveals.forEach((el) => io.observe(el));
    headings.forEach((el) => io.observe(el));
    // Safety net: never leave content hidden (e.g. printing, odd browsers).
    window.addEventListener("beforeprint", () => {
      reveals.forEach((el) => el.classList.add("is-in"));
      headings.forEach((el) => el.classList.add("is-split"));
    });
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
    headings.forEach((el) => el.classList.add("is-split"));
  }

  /* ------------------------------------------------------------ header */
  const header = $("[data-header]");
  const heroEl = $("[data-hero]") || $("[data-hero-simple]") || $(".lost");
  let lastY = window.scrollY;
  function onScrollHeader() {
    if (!header) return;
    const y = window.scrollY;
    const heroBottom = heroEl ? heroEl.offsetTop + heroEl.offsetHeight - header.offsetHeight : 40;
    header.classList.toggle("is-solid", y > heroBottom - 1 && !heroEl?.classList.contains("lost"));
    const goingDown = y > lastY + 4;
    const goingUp = y < lastY - 4;
    if (goingDown && y > Math.max(320, heroBottom * 0.6)) header.classList.add("is-hidden");
    else if (goingUp || y < 120) header.classList.remove("is-hidden");
    lastY = y;
  }
  window.addEventListener("scroll", onScrollHeader, { passive: true });
  onScrollHeader();
  header?.addEventListener("focusin", () => header.classList.remove("is-hidden"));

  /* ------------------------------------------------------------ menu */
  const menu = $("#menu");
  const menuBtn = $("[data-menu-open]");
  if (menu && menuBtn && typeof menu.showModal === "function") {
    const open = () => {
      menu.showModal();
      document.documentElement.classList.add("menu-open");
      menuBtn.setAttribute("aria-expanded", "true");
    };
    const close = () => {
      menu.close();
    };
    menu.addEventListener("close", () => {
      document.documentElement.classList.remove("menu-open");
      menuBtn.setAttribute("aria-expanded", "false");
      menuBtn.focus({ preventScroll: true });
    });
    menuBtn.addEventListener("click", open);
    $("[data-menu-close]", menu)?.addEventListener("click", close);
    $$(".menu__nav a", menu).forEach((a) => a.addEventListener("click", close));
  } else if (menuBtn) {
    menuBtn.addEventListener("click", () => { location.hash = "#main"; });
  }

  /* ------------------------------------------------------------ hero */
  const hero = $("[data-hero]");
  if (hero) {
    // Opening titles. First visit per session: a film-leader countdown, then the
    // letterbox opens and the title is written in. Any tap/key/scroll skips it.
    const inkEls = $$("[data-ink]", hero);
    const display = $(".hero__display", hero);
    const goLive = (delay) => {
      hero.classList.remove("is-live");
      display?.classList.remove("is-split");
      inkEls.forEach((e) => e.classList.remove("is-inked"));
      hero.style.setProperty("--hero-d", `${delay}s`);
      void hero.offsetWidth; // restart transitions with the new delay
      hero.classList.add("is-live");
      display?.classList.add("is-split");
      inkEls.forEach((e) => e.classList.add("is-inked"));
    };
    if (motionOK && !store.get("trr-intro")) {
      store.set("trr-intro", "1");
      hero.classList.add("intro");
      document.documentElement.classList.add("is-intro");
      const end = () => {
        clearTimeout(timer);
        ["pointerdown", "keydown", "wheel", "touchstart"].forEach((t) => window.removeEventListener(t, skip));
        hero.classList.remove("intro");
        document.documentElement.classList.remove("is-intro");
      };
      const skip = () => { end(); goLive(0.05); };
      const timer = setTimeout(end, 3400);
      ["pointerdown", "keydown", "wheel", "touchstart"].forEach((t) => window.addEventListener(t, skip, { passive: true }));
      requestAnimationFrame(() => goLive(2.8));
    } else {
      requestAnimationFrame(() => goLive(motionOK ? 0.15 : 0));
    }

    const slides = $$("[data-slide]", hero);
    const dots = $$("[data-goto]", hero);
    const idxEl = $("[data-scene-index]", hero);
    const nameEl = $("[data-scene-name]", hero);
    const pauseBtn = $("[data-hero-pause]", hero);
    const HOLD = 7000;
    hero.style.setProperty("--hero-ms", HOLD + "ms");
    let current = 0, timer = null, userPaused = reduceMotion.matches, inView = true;

    const show = (i) => {
      slides[current].classList.remove("is-active");
      current = (i + slides.length) % slides.length;
      slides[current].classList.add("is-active");
      dots.forEach((d, n) => {
        d.classList.toggle("is-active", n === current);
        d.classList.toggle("is-past", n < current);
        // restart the progress animation on the active dot
        const bar = d.firstElementChild; if (n === current && bar) { bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = ""; }
      });
      if (idxEl) idxEl.textContent = pad(current + 1);
      if (nameEl) nameEl.textContent = slides[current].dataset.scene || "";
      // Load the next slide early so crossfades never show a blank frame.
      const next = slides[(current + 1) % slides.length]?.querySelector("img");
      if (next && next.loading === "lazy") next.loading = "eager";
    };
    const stop = () => { clearInterval(timer); timer = null; };
    const start = () => {
      stop();
      if (userPaused || !inView || document.hidden || slides.length < 2) return;
      timer = setInterval(() => show(current + 1), HOLD);
    };
    const setPaused = (p) => {
      userPaused = p;
      hero.classList.toggle("is-paused", p);
      pauseBtn?.setAttribute("aria-label", p ? "Play slideshow" : "Pause slideshow");
      p ? stop() : start();
    };
    dots.forEach((d) => d.addEventListener("click", () => { show(+d.dataset.goto); start(); }));
    pauseBtn?.addEventListener("click", () => setPaused(!userPaused));
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
    if (slides.length < 2) { $(".hero__dots", hero)?.remove(); }
    setPaused(userPaused);

    // Film-camera timecode (HH:MM:SS:FF at 24fps) while the hero is on screen.
    const tc = $("[data-timecode]", hero);
    const t0 = performance.now();
    let raf = 0, lastPaint = 0;
    const tick = (now) => {
      if (now - lastPaint > 80) {
        const s = (now - t0) / 1000;
        const f = Math.floor((s % 1) * 24);
        tc.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(Math.floor(s) % 60)}:${pad(f)}`;
        lastPaint = now;
      }
      raf = requestAnimationFrame(tick);
    };
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => {
        inView = e.isIntersecting;
        cancelAnimationFrame(raf);
        if (inView && tc && !reduceMotion.matches) raf = requestAnimationFrame(tick);
        start();
      }, { threshold: 0.05 }).observe(hero);
    }
  }

  /* ------------------------------------------------------------ reel (selected frames) */
  const reel = $("[data-reel]");
  if (reel) {
    const viewport = $("[data-reel-viewport]", reel);
    const track = $("[data-reel-track]", reel);
    const frames = $$(".reel__frame", track);
    const idx = $("[data-reel-index]", reel);
    const bar = $("[data-reel-progress]", reel);
    const desktop = mq("(min-width: 1024px)");
    let pinned = false, distance = 0, ticking = false, lastX = 0, settle = 0;

    const setIndex = (p) => {
      const i = clamp(Math.round(p * (frames.length - 1)), 0, frames.length - 1);
      if (idx) idx.textContent = pad(i + 1);
      if (bar) bar.style.setProperty("--p", p.toFixed(4));
    };
    const measure = () => {
      pinned = desktop.matches && !reduceMotion.matches;
      reel.classList.toggle("is-pinned", pinned);
      if (pinned) {
        distance = Math.max(0, track.scrollWidth - viewport.clientWidth);
        reel.style.setProperty("--reel-h", `${distance + window.innerHeight}px`);
      } else {
        reel.style.removeProperty("--reel-h");
        reel.style.removeProperty("--reel-x");
      }
      update();
    };
    const update = () => {
      ticking = false;
      if (pinned) {
        const top = reel.getBoundingClientRect().top;
        const p = distance ? clamp(-top / distance, 0, 1) : 0;
        const x = p * distance;
        reel.style.setProperty("--reel-x", x.toFixed(1));
        setIndex(p);
        // frames lean into the direction of travel, then settle
        if (motionOK) {
          const skew = clamp((x - lastX) * 0.06, -5, 5);
          lastX = x;
          track.style.setProperty("--skew", `${(-skew).toFixed(2)}deg`);
          clearTimeout(settle);
          settle = setTimeout(() => track.style.setProperty("--skew", "0deg"), 90);
        }
      } else {
        const max = viewport.scrollWidth - viewport.clientWidth;
        setIndex(max > 0 ? viewport.scrollLeft / max : 0);
      }
    };
    const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener("scroll", request, { passive: true });
    viewport.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", measure);
    desktop.addEventListener?.("change", measure);
    document.addEventListener("media:resize", measure);
    if ("ResizeObserver" in window) new ResizeObserver(measure).observe(track);
    // Frames further along load a little before they're needed.
    $$("img", track).forEach((img, i) => { if (i < 3) img.loading = "eager"; });
    measure();
  }

  /* ------------------------------------------------------------ film player */
  const player = $("#player");
  const frameBox = player && $("[data-player-frame]", player);
  let lastTrigger = null;
  function openFilm(id, trigger) {
    if (!player || typeof player.showModal !== "function") {
      window.open(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, "_blank", "noopener");
      return;
    }
    lastTrigger = trigger;
    frameBox.innerHTML = "";
    const f = document.createElement("iframe");
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;
    f.title = trigger?.getAttribute("aria-label")?.replace(/^Play film: /, "") || "Wedding film";
    f.allow = "autoplay; encrypted-media; picture-in-picture; fullscreen";
    f.referrerPolicy = "strict-origin-when-cross-origin";
    frameBox.appendChild(f);
    player.showModal();
    document.documentElement.classList.add("menu-open");
  }
  if (player) {
    player.addEventListener("close", () => {
      frameBox.innerHTML = "";
      document.documentElement.classList.remove("menu-open");
      lastTrigger?.focus({ preventScroll: true });
    });
    $("[data-player-close]", player)?.addEventListener("click", () => player.close());
    player.addEventListener("click", (e) => { if (e.target === player) player.close(); });
  }
  $$("[data-film]").forEach((b) => b.addEventListener("click", () => openFilm(b.dataset.film, b)));

  /* ------------------------------------------------------------ BTS phone reels */
  const phones = $$(".phone");
  if (phones.length) {
    const autoplay = !reduceMotion.matches && !saveData;
    const videos = phones.map((p) => $("video", p));
    const load = (v) => { if (!v.src && v.dataset.src) { v.preload = "metadata"; v.src = v.dataset.src + "#t=0.1"; } };
    const play = (v) => { load(v); const p = v.play(); p?.catch(() => v.closest(".phone").classList.remove("is-playing")); };

    videos.forEach((v) => {
      const phone = v.closest(".phone");
      v.addEventListener("playing", () => phone.classList.add("is-playing"));
      v.addEventListener("pause", () => phone.classList.remove("is-playing"));
      $("[data-play]", phone).addEventListener("click", () => play(v));
      const soundBtn = $("[data-sound]", phone);
      soundBtn.addEventListener("click", () => {
        const on = v.muted;
        videos.forEach((o) => { o.muted = true; $("[data-sound]", o.closest(".phone")).setAttribute("aria-pressed", "false"); });
        v.muted = !on;
        soundBtn.setAttribute("aria-pressed", String(on));
        soundBtn.setAttribute("aria-label", on ? "Turn sound off" : "Turn sound on");
        if (on) play(v);
      });
    });

    if ("IntersectionObserver" in window) {
      const near = new IntersectionObserver((es) => es.forEach((e) => {
        if (e.isIntersecting) { load(e.target); near.unobserve(e.target); }
      }), { rootMargin: "400px 0px" });
      const vis = new IntersectionObserver((es) => es.forEach((e) => {
        const v = e.target;
        if (e.isIntersecting && e.intersectionRatio >= 0.55) { if (autoplay) play(v); }
        else if (!v.paused) v.pause();
      }), { threshold: [0, 0.55] });
      videos.forEach((v) => { near.observe(v); vis.observe(v); });
    }
  }

  /* ------------------------------------------------------------ services hover preview */
  const list = $("[data-services]");
  const preview = $("[data-services-preview]");
  if (list && preview && mq("(hover: hover) and (pointer: fine)").matches) {
    const img = $("img", preview);
    let x = 0, y = 0, tx = 0, ty = 0, raf = 0, on = false;
    const loop = () => {
      x += (tx - x) * 0.14; y += (ty - y) * 0.14;
      preview.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = on || Math.abs(tx - x) > 0.5 ? requestAnimationFrame(loop) : 0;
    };
    $$(".service", list).forEach((row) => {
      row.addEventListener("mouseenter", (e) => {
        const src = row.dataset.preview;
        if (!src) return;
        if (img.src !== src) img.src = src;
        const w = preview.offsetWidth, h = preview.offsetHeight;
        tx = x = e.clientX + 28; ty = y = e.clientY - h / 2;
        if (x + w > innerWidth - 16) tx = x = e.clientX - w - 28;
        on = true; preview.classList.add("is-on");
        if (!raf) raf = requestAnimationFrame(loop);
      });
      row.addEventListener("mousemove", (e) => {
        const w = preview.offsetWidth, h = preview.offsetHeight;
        tx = e.clientX + 28 + w > innerWidth - 16 ? e.clientX - w - 28 : e.clientX + 28;
        ty = clamp(e.clientY - h / 2, 16, innerHeight - h - 16);
      });
      row.addEventListener("mouseleave", () => { on = false; preview.classList.remove("is-on"); });
    });
  }

  /* ------------------------------------------------------------ enquiry form */
  const form = $("[data-enquiry]");
  if (form) {
    const status = $("[data-status]", form);
    const nameField = $("#f-name", form), emailField = $("#f-email", form);
    const fieldError = (input, show) => {
      const wrap = input.closest(".field"), err = $(".field__error", wrap);
      wrap.classList.toggle("has-error", show);
      input.setAttribute("aria-invalid", String(show));
      if (err) { err.hidden = !show; if (show) input.setAttribute("aria-describedby", err.id); else input.removeAttribute("aria-describedby"); }
    };
    [nameField, emailField].forEach((i) => i?.addEventListener("input", () => fieldError(i, false)));

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const d = new FormData(form);
      const name = (d.get("name") || "").toString().trim();
      const email = (d.get("email") || "").toString().trim();
      let bad = null;
      if (!name) { fieldError(nameField, true); bad = bad || nameField; }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { fieldError(emailField, true); bad = bad || emailField; }
      if (bad) { bad.focus(); status.textContent = "Please check the highlighted field."; return; }

      const services = d.getAll("services").join(", ");
      const val = (k) => (d.get(k) || "").toString().trim();
      const details = [
        ["Names", name], ["Phone", val("phone")], ["Email", email],
        ["Date", val("date")], ["Where", val("place")], ["Looking for", services],
      ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
      const text = [
        "Hi The Reel Romance! We'd love to talk about our wedding.",
        "",
        ...details,
        ...(val("message") ? ["", val("message")] : []),
      ].join("\n");
      const waUrl = `https://wa.me/${form.dataset.whatsapp}?text=${encodeURIComponent(text)}`;

      const endpoint = form.dataset.endpoint;
      if (endpoint) {
        form.classList.add("is-sending");
        status.textContent = "Sending…";
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, phone: d.get("phone"), date: d.get("date"), place: d.get("place"), services, message: d.get("message"), _subject: `Wedding enquiry — ${name}` }),
          });
          if (!res.ok) throw new Error(res.status);
          form.reset();
          status.innerHTML = `Thank you — we've got it and will reply soon. In a hurry? <a href="${waUrl}" target="_blank" rel="noopener" style="text-decoration:underline">Message us on WhatsApp</a>.`;
        } catch {
          status.innerHTML = `That didn't go through. <a href="${waUrl}" target="_blank" rel="noopener" style="text-decoration:underline">Send it on WhatsApp instead</a>.`;
        } finally {
          form.classList.remove("is-sending");
        }
        return;
      }
      status.textContent = "Opening WhatsApp…";
      const w = window.open(waUrl, "_blank", "noopener");
      if (!w) window.location.href = waUrl;
      setTimeout(() => { status.textContent = "Your message is ready in WhatsApp — just press send."; }, 900);
    });
  }

  /* ------------------------------------------------------------ floating enquire pill */
  const pill = $("[data-float-cta]");
  const enquire = $("#enquire");
  if (pill && "IntersectionObserver" in window) {
    const state = { hero: true, form: false, footer: false };
    const sync = () => pill.classList.toggle("is-on", !state.hero && !state.form && !state.footer);
    const watch = (el, key) => el && new IntersectionObserver(([e]) => { state[key] = e.isIntersecting; sync(); }).observe(el);
    watch(heroEl, "hero");
    watch(enquire, "form");
    watch($(".site-footer"), "footer");
    watch($(".cta-band"), "form");
  }

  /* ------------------------------------------------------------ scroll-linked motion
     One animation loop drives everything that follows the scroll position:
     the hero pulling away, photo parallax, the film poster growing, the marquee. */
  const heroMotion = $("[data-hero]");
  const parallax = $$("[data-parallax]");
  const bigPoster = $(".film--big .film__poster");
  const marquee = $("[data-marquee]");
  const mTrack = marquee && $("[data-marquee-track]", marquee);
  if (motionOK) {
    const visible = new Set();
    let lastScroll = -1, vel = 0, mx = 0, dir = 1, prevY = window.scrollY;
    if ("IntersectionObserver" in window) {
      const vio = new IntersectionObserver((es) => {
        es.forEach((e) => (e.isIntersecting ? visible.add(e.target) : visible.delete(e.target)));
        lastScroll = -1; // recompute positions for anything that just came into view
      }, { rootMargin: "20% 0px" });
      [...parallax, bigPoster, marquee].filter(Boolean).forEach((el) => vio.observe(el));
    }
    const frame = () => {
      const y = window.scrollY, vh = window.innerHeight;
      const dy = y - prevY; prevY = y;
      vel += (dy - vel) * 0.2;
      if (dy) dir = dy > 0 ? 1 : -1;
      if (y !== lastScroll) {
        lastScroll = y;
        if (heroMotion) {
          const hp = clamp(y / heroMotion.offsetHeight, 0, 1);
          heroMotion.style.setProperty("--hp", hp.toFixed(4));
        }
        visible.forEach((el) => {
          const r = el.getBoundingClientRect();
          if (el.hasAttribute("data-parallax")) {
            const speed = parseFloat(el.dataset.parallax) || 0.1;
            const off = r.top + r.height / 2 - vh / 2;
            el.style.setProperty("--py", `${(-off * speed).toFixed(1)}px`);
          } else if (el === bigPoster) {
            el.style.setProperty("--fp", clamp((vh * 0.9 - r.top) / (vh * 0.55), 0, 1).toFixed(4));
          }
        });
      }
      if (mTrack && visible.has(marquee)) {
        const third = mTrack.scrollWidth / 3;
        mx -= (0.6 + Math.min(Math.abs(vel) * 0.35, 14)) * dir;
        if (mx <= -third) mx += third;
        if (mx > 0) mx -= third;
        mTrack.style.setProperty("--mx", `${mx.toFixed(1)}px`);
      }
      raf = requestAnimationFrame(frame);
    };
    let raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    });
  }

  /* ------------------------------------------------------------ desktop polish:
     eased wheel scrolling, a cursor that tells you what a thing does, magnetic buttons */
  const finePointer = mq("(hover: hover) and (pointer: fine)").matches;
  const root = document.documentElement;
  let glideTo = null;

  if (motionOK && finePointer) {
    let target = window.scrollY, current = window.scrollY, running = false;
    const maxY = () => root.scrollHeight - window.innerHeight;
    const step = () => {
      current += (target - current) * 0.11;
      if (Math.abs(target - current) < 0.4) { current = target; running = false; }
      window.scrollTo({ top: current, behavior: "instant" });
      if (running) requestAnimationFrame(step);
    };
    const start = () => { if (!running) { running = true; requestAnimationFrame(step); } };
    glideTo = (y) => { if (!running) current = window.scrollY; target = clamp(y, 0, maxY()); start(); };
    window.addEventListener("wheel", (e) => {
      if (e.ctrlKey || e.defaultPrevented || root.classList.contains("menu-open")) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (e.target.closest && e.target.closest("textarea, dialog")) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaMode === 2 ? e.deltaY * window.innerHeight : e.deltaY;
      if (!running) current = target = window.scrollY;
      target = clamp(target + dy, 0, maxY());
      start();
    }, { passive: false });
    window.addEventListener("scroll", () => { if (!running) current = target = window.scrollY; }, { passive: true });

    // cursor
    const cursor = $(".cursor");
    const label = cursor && $(".cursor__label", cursor);
    if (cursor) {
      let cx = -100, cy = -100, tx = -100, ty = -100;
      const loop = () => {
        cx += (tx - cx) * 0.22; cy += (ty - cy) * 0.22;
        cursor.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      window.addEventListener("pointermove", (e) => {
        if (e.pointerType !== "mouse") return;
        tx = e.clientX; ty = e.clientY; cursor.classList.add("is-on");
      }, { passive: true });
      document.addEventListener("pointerleave", () => cursor.classList.remove("is-on"));
      window.addEventListener("pointerdown", () => cursor.classList.add("is-down"));
      window.addEventListener("pointerup", () => cursor.classList.remove("is-down"));
      document.addEventListener("pointerover", (e) => {
        const t = e.target.closest ? e.target : null;
        const labelled = t && t.closest("[data-cursor]");
        const link = t && t.closest("a, button, label, input, textarea, summary");
        cursor.classList.toggle("is-label", !!labelled);
        cursor.classList.toggle("is-link", !labelled && !!link);
        if (labelled) label.textContent = labelled.dataset.cursor;
      });
    }

    // magnetic buttons
    $$(".btn").forEach((b) => {
      b.addEventListener("pointermove", (e) => {
        const r = b.getBoundingClientRect();
        const dx = clamp((e.clientX - r.left - r.width / 2) * 0.28, -10, 10);
        const dy = clamp((e.clientY - r.top - r.height / 2) * 0.4, -8, 8);
        b.classList.add("is-magnet");
        b.style.setProperty("--mx-b", `${dx.toFixed(1)}px`);
        b.style.setProperty("--my-b", `${dy.toFixed(1)}px`);
      });
      b.addEventListener("pointerleave", () => {
        b.classList.remove("is-magnet");
        b.style.setProperty("--mx-b", "0px");
        b.style.setProperty("--my-b", "0px");
      });
    });
  }

  /* ------------------------------------------------------------ in-page links glide */
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest('a[href*="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    const url = new URL(a.href, location.href);
    if (url.pathname !== location.pathname || !url.hash || url.hash === "#") return;
    const el = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (!el) return;
    e.preventDefault();
    const y = el.getBoundingClientRect().top + window.scrollY - (url.hash === "#top" || url.hash === "#main" ? 0 : 0);
    if (glideTo) glideTo(y);
    else window.scrollTo({ top: y, behavior: motionOK ? "smooth" : "auto" });
    history.pushState(null, "", url.hash);
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  });
})();
