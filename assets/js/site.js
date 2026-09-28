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

  /* ------------------------------------------------------------ reveal on scroll */
  const reveals = $$("[data-reveal]");
  if ("IntersectionObserver" in window && !reduceMotion.matches) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    reveals.forEach((el) => io.observe(el));
    // Safety net: never leave content hidden (e.g. printing, odd browsers).
    window.addEventListener("beforeprint", () => reveals.forEach((el) => el.classList.add("is-in")));
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
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
    // Letterbox intro: once per visit, only when motion is welcome.
    if (!reduceMotion.matches && !store.get("trr-intro")) {
      hero.classList.add("intro");
      store.set("trr-intro", "1");
      setTimeout(() => hero.classList.remove("intro"), 1800);
    }

    const slides = $$("[data-slide]", hero);
    const dots = $$("[data-goto]", hero);
    const idxEl = $("[data-scene-index]", hero);
    const nameEl = $("[data-scene-name]", hero);
    const pauseBtn = $("[data-hero-pause]", hero);
    const HOLD = 7000;
    hero.style.setProperty("--hero-ms", HOLD + "ms");
    let current = 0, timer = null, userPaused = reduceMotion.matches, inView = true;

    let prevTimer = 0;
    const show = (i) => {
      // The outgoing photo stays fully visible underneath while the next one
      // fades in on top — no dip to black between slides.
      const prev = slides[current];
      slides.forEach((s) => s.classList.remove("is-prev"));
      prev.classList.add("is-prev");
      prev.classList.remove("is-active");
      clearTimeout(prevTimer);
      prevTimer = setTimeout(() => prev.classList.remove("is-prev"), 2100);
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
    let pinned = false, distance = 0, ticking = false;

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
        reel.style.setProperty("--reel-x", (p * distance).toFixed(1));
        setIndex(p);
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
    // Browsers never trigger native lazy-loading for photos sitting to the side
    // of a horizontal strip, so the strip loads all its frames itself as soon
    // as it comes near the screen (the first three straight away).
    const reelImgs = $$("img", track);
    reelImgs.forEach((img, i) => { if (i < 3) img.loading = "eager"; });
    const loadAll = () => reelImgs.forEach((img) => { img.loading = "eager"; });
    if ("IntersectionObserver" in window) {
      const near = new IntersectionObserver(([e]) => { if (e.isIntersecting) { loadAll(); near.disconnect(); } }, { rootMargin: "150% 0px" });
      near.observe(reel);
    } else loadAll();
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

  /* ------------------------------------------------------------ smooth in-page links */
  if (!reduceMotion.matches) document.documentElement.style.scrollBehavior = "smooth";
})();
