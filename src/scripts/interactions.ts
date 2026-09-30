/**
 * Site-wide interactions. With ClientRouter the DOM is swapped on navigation,
 * so everything is (re)initialised on `astro:page-load` and torn down on
 * `astro:before-swap` via an AbortController.
 */

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = () => window.matchMedia("(pointer: fine)").matches;

let controller: AbortController | null = null;

/* ---------- Live clock (Buggenhout = Europe/Brussels) ---------- */

const clockFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function tickClocks() {
  const now = clockFormat.format(new Date());
  document.querySelectorAll<HTMLElement>("[data-clock]").forEach((el) => {
    el.textContent = now;
  });
}

setInterval(tickClocks, 1000);

/* ---------- Scroll reveal ---------- */

function initReveal(signal: AbortSignal) {
  const items = document.querySelectorAll<HTMLElement>("[data-reveal]");
  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  items.forEach((el) => io.observe(el));
  signal.addEventListener("abort", () => io.disconnect());
}

/* ---------- Magnetic elements ---------- */

function initMagnetic(signal: AbortSignal) {
  if (!finePointer() || reducedMotion()) return;
  document.querySelectorAll<HTMLElement>("[data-magnetic]").forEach((el) => {
    const strength = Number(el.dataset.magnetic) || 0.3;
    el.style.transition = "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)";
    el.addEventListener(
      "pointermove",
      (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - (r.left + r.width / 2)) * strength;
        const y = (e.clientY - (r.top + r.height / 2)) * strength;
        el.style.transform = `translate(${x}px, ${y}px)`;
      },
      { signal },
    );
    el.addEventListener(
      "pointerleave",
      () => {
        el.style.transform = "";
      },
      { signal },
    );
  });
}

/* ---------- Copy to clipboard ---------- */

function initCopy(signal: AbortSignal) {
  document.querySelectorAll<HTMLElement>("[data-copy]").forEach((btn) => {
    const feedback = btn.querySelector<HTMLElement>("[data-copy-feedback]");
    const original = feedback?.textContent ?? "";
    let timer: number | undefined;
    btn.addEventListener(
      "click",
      async () => {
        try {
          await navigator.clipboard.writeText(btn.dataset.copy ?? "");
          if (feedback) feedback.textContent = "Copied ✓";
        } catch {
          if (feedback) feedback.textContent = "Press ⌘C / Ctrl+C";
        }
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          if (feedback) feedback.textContent = original;
        }, 1800);
      },
      { signal },
    );
  });
}

/* ---------- Parallax: [data-parallax="speed"] drifts as it crosses the viewport ---------- */

function initParallax(signal: AbortSignal) {
  if (reducedMotion()) return;
  const items = [...document.querySelectorAll<HTMLElement>("[data-parallax]")];
  if (!items.length) return;

  let frame = 0;
  const update = () => {
    frame = 0;
    const vh = window.innerHeight;
    for (const el of items) {
      const box = el.parentElement!.getBoundingClientRect();
      if (box.bottom < 0 || box.top > vh) continue;
      const speed = Number(el.dataset.parallax) || 0.1;
      const offset = (box.top + box.height / 2 - vh / 2) * speed;
      const limit = box.height * speed;
      el.style.transform = `translate3d(0, ${Math.max(-limit, Math.min(limit, -offset))}px, 0)`;
    }
  };
  const request = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  update();
  window.addEventListener("scroll", request, { passive: true, signal });
  window.addEventListener("resize", request, { signal });
  signal.addEventListener("abort", () => cancelAnimationFrame(frame));
}

/* ---------- Back to top ---------- */

function initBackToTop(signal: AbortSignal) {
  document.querySelectorAll("[data-to-top]").forEach((btn) =>
    btn.addEventListener(
      "click",
      () =>
        window.scrollTo({
          top: 0,
          behavior: reducedMotion() ? "auto" : "smooth",
        }),
      { signal },
    ),
  );
}

document.addEventListener("astro:page-load", () => {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;

  tickClocks();
  initReveal(signal);
  initMagnetic(signal);
  initParallax(signal);
  initCopy(signal);
  initBackToTop(signal);
});

document.addEventListener("astro:before-swap", () => controller?.abort());
