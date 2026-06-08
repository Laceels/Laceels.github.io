const viewport = document.querySelector(".viewport");
const slides = Array.from(document.querySelectorAll(".slide"));
const navItems = Array.from(document.querySelectorAll(".section-nav a"));
const progress = document.querySelector(".progress span");
const directionButtons = document.querySelectorAll("[data-direction]");
const jumpButtons = document.querySelectorAll("[data-jump]");
const internalLinks = Array.from(document.querySelectorAll('a[href^="#"]'));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SLIDE_SCROLL_DURATION = 680;
const SWIPE_UNLOCK_DELAY = 160;

let activeIndex = 0;
let ticking = false;
let navigationLocked = false;
let lastViewportWidth = viewport.clientWidth;
let swipeLocked = false;
let swipeUnlockTimer = null;
let scrollAnimationFrame = null;
let pendingIndex = null;
let isDragging = false;
let dragStartX = 0;
let dragStartScroll = 0;
let dragPointerId = null;

const easeInOutQuart = (value) => (
    value < 0.5
        ? 8 * value * value * value * value
        : 1 - Math.pow(-2 * value + 2, 4) / 2
);

const clearSwipeUnlockTimer = () => {
    if (!swipeUnlockTimer) return;
    window.clearTimeout(swipeUnlockTimer);
    swipeUnlockTimer = null;
};

const lockSwipeInput = () => {
    swipeLocked = true;
    clearSwipeUnlockTimer();
};

const releaseSwipeInput = () => {
    clearSwipeUnlockTimer();
    swipeUnlockTimer = window.setTimeout(() => {
        swipeLocked = false;
        swipeUnlockTimer = null;
    }, reduceMotion ? 0 : SWIPE_UNLOCK_DELAY);
};

const isTransitioning = () => navigationLocked || Boolean(scrollAnimationFrame);

const cancelScrollAnimation = () => {
    if (!scrollAnimationFrame) return;
    cancelAnimationFrame(scrollAnimationFrame);
    scrollAnimationFrame = null;
    pendingIndex = null;
    navigationLocked = false;
    releaseSwipeInput();
    viewport.classList.remove("is-animating");
};

const animateViewportTo = (targetLeft, duration, targetIndex) => {
    const startLeft = viewport.scrollLeft;
    const distance = targetLeft - startLeft;
    const startedAt = performance.now();

    viewport.classList.add("is-animating");

    const step = (now) => {
        const elapsed = now - startedAt;
        const progressValue = Math.min(1, elapsed / duration);
        const eased = easeInOutQuart(progressValue);

        viewport.scrollLeft = startLeft + distance * eased;
        requestStateUpdate();

        if (progressValue < 1) {
            scrollAnimationFrame = requestAnimationFrame(step);
            return;
        }

        viewport.scrollLeft = targetLeft;
        scrollAnimationFrame = null;
        pendingIndex = null;
        viewport.classList.remove("is-animating");
        navigationLocked = false;
        activeIndex = targetIndex;
        setActiveState();
        releaseSwipeInput();
    };

    scrollAnimationFrame = requestAnimationFrame(step);
};

const scrollToSlide = (index, behaviorOverride) => {
    const nextIndex = Math.max(0, Math.min(slides.length - 1, index));
    const behavior = behaviorOverride || (reduceMotion ? "auto" : "smooth");
    const targetLeft = nextIndex * viewport.clientWidth;
    const isAlreadyThere = Math.abs(viewport.scrollLeft - targetLeft) < 1;

    cancelScrollAnimation();

    if (isAlreadyThere) {
        pendingIndex = null;
        navigationLocked = false;
        activeIndex = nextIndex;
        viewport.scrollLeft = targetLeft;
        setActiveState();
        releaseSwipeInput();
        return;
    }

    navigationLocked = behavior === "smooth";

    if (navigationLocked) {
        lockSwipeInput();
        pendingIndex = nextIndex;
        animateViewportTo(targetLeft, SLIDE_SCROLL_DURATION, nextIndex);
        return;
    }

    pendingIndex = null;
    activeIndex = nextIndex;
    viewport.scrollTo({
        left: targetLeft,
        behavior: "auto"
    });

    setActiveState();
};

const currentSlideIndex = () => Math.round(viewport.scrollLeft / viewport.clientWidth);

const scrollAdjacent = (direction) => {
    const baseIndex = pendingIndex ?? currentSlideIndex();
    scrollToSlide(baseIndex + direction);
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

const updateProgress = () => {
    const maxScroll = viewport.scrollWidth - viewport.clientWidth;
    const ratio = maxScroll > 0 ? viewport.scrollLeft / maxScroll : 0;
    progress.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
};

const requestStateUpdate = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
        if (isTransitioning() || isDragging) {
            updateProgress();
        } else {
            setActiveState();
        }
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

    if (swipeLocked || isTransitioning() || isDragging) {
        if (swipeLocked && !isTransitioning() && !isDragging) {
            releaseSwipeInput();
        }
        return;
    }

    scrollAdjacent(delta > 0 ? 1 : -1);
}, { passive: false });

viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("a, button, video, input, textarea, select")) return;
    if (swipeLocked || isTransitioning()) return;

    cancelScrollAnimation();
    lockSwipeInput();
    isDragging = true;
    dragPointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartScroll = viewport.scrollLeft;
    navigationLocked = true;

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
    scrollToSlide(currentSlideIndex());
};

viewport.addEventListener("pointerup", endDrag);
viewport.addEventListener("pointercancel", endDrag);

directionButtons.forEach((button) => {
    button.addEventListener("click", () => {
        if (swipeLocked || isTransitioning() || isDragging) return;
        scrollAdjacent(Number(button.dataset.direction));
    });
});

jumpButtons.forEach((button) => {
    button.addEventListener("click", () => {
        if (swipeLocked || isTransitioning() || isDragging) return;
        scrollToSlide(Number(button.dataset.jump));
    });
});

internalLinks.forEach((item) => {
    item.addEventListener("click", (event) => {
        const target = item.getAttribute("href");
        const targetIndex = slides.findIndex((slide) => `#${slide.id}` === target);

        if (targetIndex < 0) return;

        event.preventDefault();
        if (swipeLocked || isTransitioning() || isDragging) return;
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
        if (swipeLocked || isTransitioning() || isDragging) return;
        scrollAdjacent(1);
    }

    if (event.key === "ArrowLeft" || event.key === "PageUp" || event.key.toLowerCase() === "a") {
        if (swipeLocked || isTransitioning() || isDragging) return;
        scrollAdjacent(-1);
    }

    if (event.key === "Home") {
        if (swipeLocked || isTransitioning() || isDragging) return;
        scrollToSlide(0);
    }

    if (event.key === "End") {
        if (swipeLocked || isTransitioning() || isDragging) return;
        scrollToSlide(slides.length - 1);
    }
});

window.addEventListener("resize", () => {
    const previousWidth = lastViewportWidth || viewport.clientWidth;
    const resizedIndex = Math.round(viewport.scrollLeft / previousWidth);

    lastViewportWidth = viewport.clientWidth;
    navigationLocked = false;
    swipeLocked = false;
    clearSwipeUnlockTimer();
    activeIndex = Math.max(0, Math.min(slides.length - 1, resizedIndex));

    viewport.scrollTo({ left: activeIndex * viewport.clientWidth, behavior: "auto" });
    requestStateUpdate();
});

setActiveState();
window.addEventListener("load", () => window.setTimeout(syncHash, 80));
window.addEventListener("hashchange", syncHash);
