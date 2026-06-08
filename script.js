const viewport = document.querySelector(".viewport");
const slides = Array.from(document.querySelectorAll(".slide"));
const navItems = Array.from(document.querySelectorAll(".section-nav a"));
const progress = document.querySelector(".progress span");
const directionButtons = document.querySelectorAll("[data-direction]");
const jumpButtons = document.querySelectorAll("[data-jump]");
const internalLinks = Array.from(document.querySelectorAll('a[href^="#"]'));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let activeIndex = 0;
let ticking = false;
let navigationLocked = false;
let lastViewportWidth = viewport.clientWidth;
let wheelLocked = false;
let isDragging = false;
let dragStartX = 0;
let dragStartScroll = 0;
let dragPointerId = null;

const scrollToSlide = (index, behaviorOverride) => {
    const nextIndex = Math.max(0, Math.min(slides.length - 1, index));
    const behavior = behaviorOverride || (reduceMotion ? "auto" : "smooth");

    navigationLocked = false;
    activeIndex = nextIndex;
    navigationLocked = behavior === "smooth";

    viewport.scrollTo({
        left: nextIndex * viewport.clientWidth,
        behavior
    });

    if (!navigationLocked) {
        setActiveState();
        return;
    }

    window.setTimeout(() => {
        navigationLocked = false;
        setActiveState();
    }, reduceMotion ? 0 : 520);
};

const currentSlideIndex = () => Math.round(viewport.scrollLeft / viewport.clientWidth);

const scrollAdjacent = (direction) => {
    navigationLocked = false;
    scrollToSlide(currentSlideIndex() + direction);
};

const setActiveState = () => {
    const maxScroll = viewport.scrollWidth - viewport.clientWidth;
    const ratio = maxScroll > 0 ? viewport.scrollLeft / maxScroll : 0;
    const measuredIndex = Math.round(viewport.scrollLeft / viewport.clientWidth);

    if (!navigationLocked) {
        activeIndex = measuredIndex;
    }

    progress.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;

    slides.forEach((slide, index) => {
        const isActive = index === activeIndex;
        slide.classList.toggle("is-active", isActive);
        if (isActive) {
            slide.setAttribute("aria-current", "true");
        } else {
            slide.removeAttribute("aria-current");
        }

        const art = slide.querySelector(".chapter-art");
        if (art && !reduceMotion) {
            const offset = index - viewport.scrollLeft / viewport.clientWidth;
            art.style.transform = `translateX(${offset * 28}px) scale(${isActive ? 1.02 : 1.05})`;
        }
    });

    navItems.forEach((item) => {
        const target = item.getAttribute("href");
        const targetIndex = slides.findIndex((slide) => `#${slide.id}` === target);
        item.setAttribute("aria-current", String(targetIndex === activeIndex));
    });
};

const requestStateUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
        setActiveState();
        ticking = false;
    });
};

const animateCounts = (slide) => {
    const counters = slide.querySelectorAll("[data-count]");
    counters.forEach((counter) => {
        if (counter.dataset.done === "true") return;
        counter.dataset.done = "true";

        const target = Number(counter.dataset.count);
        const duration = reduceMotion ? 1 : 900;
        const start = performance.now();

        const step = (now) => {
            const progressValue = Math.min(1, (now - start) / duration);
            counter.textContent = Math.round(target * progressValue);
            if (progressValue < 1) {
                requestAnimationFrame(step);
            }
        };

        requestAnimationFrame(step);
    });
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
        if (entry.isIntersecting) {
            entry.target.classList.add("has-entered");
            animateCounts(entry.target);
        }
    });
}, {
    root: viewport,
    threshold: 0.55
});

slides.forEach((slide) => observer.observe(slide));

viewport.addEventListener("scroll", requestStateUpdate, { passive: true });

viewport.addEventListener("wheel", (event) => {
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;

    if (Math.abs(delta) < 8) return;

    event.preventDefault();

    if (wheelLocked) return;

    wheelLocked = true;
    scrollAdjacent(delta > 0 ? 1 : -1);

    window.setTimeout(() => {
        wheelLocked = false;
    }, reduceMotion ? 120 : 420);
}, { passive: false });

viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("a, button, video, input, textarea, select")) return;

    isDragging = true;
    dragPointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartScroll = viewport.scrollLeft;
    navigationLocked = false;

    viewport.classList.add("is-dragging");
    viewport.setPointerCapture(event.pointerId);
});

viewport.addEventListener("pointermove", (event) => {
    if (!isDragging || event.pointerId !== dragPointerId) return;

    const deltaX = event.clientX - dragStartX;
    viewport.scrollLeft = dragStartScroll - deltaX;
    requestStateUpdate();
});

const endDrag = (event) => {
    if (!isDragging || event.pointerId !== dragPointerId) return;

    isDragging = false;
    dragPointerId = null;
    viewport.classList.remove("is-dragging");
    if (viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
    }
    scrollToSlide(currentSlideIndex(), "auto");
};

viewport.addEventListener("pointerup", endDrag);
viewport.addEventListener("pointercancel", endDrag);

directionButtons.forEach((button) => {
    button.addEventListener("click", () => {
        scrollAdjacent(Number(button.dataset.direction));
    });
});

jumpButtons.forEach((button) => {
    button.addEventListener("click", () => {
        scrollToSlide(Number(button.dataset.jump));
    });
});

internalLinks.forEach((item) => {
    item.addEventListener("click", (event) => {
        const target = item.getAttribute("href");
        const targetIndex = slides.findIndex((slide) => `#${slide.id}` === target);

        if (targetIndex < 0) return;

        event.preventDefault();
        scrollToSlide(targetIndex);
    });
});

const syncHash = () => {
    const targetIndex = slides.findIndex((slide) => `#${slide.id}` === window.location.hash);

    if (targetIndex < 0) return;

    navigationLocked = false;
    scrollToSlide(targetIndex, "auto");
};

document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "PageDown" || event.key.toLowerCase() === "d") {
        scrollAdjacent(1);
    }

    if (event.key === "ArrowLeft" || event.key === "PageUp" || event.key.toLowerCase() === "a") {
        scrollAdjacent(-1);
    }

    if (event.key === "Home") {
        scrollToSlide(0);
    }

    if (event.key === "End") {
        scrollToSlide(slides.length - 1);
    }
});

window.addEventListener("resize", () => {
    const previousWidth = lastViewportWidth || viewport.clientWidth;
    const resizedIndex = Math.round(viewport.scrollLeft / previousWidth);

    lastViewportWidth = viewport.clientWidth;
    navigationLocked = false;
    activeIndex = Math.max(0, Math.min(slides.length - 1, resizedIndex));

    viewport.scrollTo({ left: activeIndex * viewport.clientWidth, behavior: "auto" });
    requestStateUpdate();
});

setActiveState();
window.addEventListener("load", () => window.setTimeout(syncHash, 80));
window.addEventListener("hashchange", syncHash);
