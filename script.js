const viewport = document.querySelector(".viewport");
const slides = Array.from(document.querySelectorAll(".slide"));
const navItems = Array.from(document.querySelectorAll(".section-nav a"));
const progress = document.querySelector(".progress span");
const directionButtons = document.querySelectorAll("[data-direction]");
const jumpButtons = document.querySelectorAll("[data-jump]");
const internalLinks = Array.from(document.querySelectorAll('a[href^="#"]'));
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const SLIDE_TRANSITION_DURATION = 620;
const SWIPE_UNLOCK_DELAY = 180;
const DRAG_THRESHOLD = 70;

let activeIndex = 0;
let pendingIndex = null;
let swipeLocked = false;
let swipeUnlockTimer = null;
let transitionTimer = null;
let isDragging = false;
let dragStartX = 0;
let dragDirection = 0;
let dragTargetIndex = 0;
let dragPointerId = null;

viewport.style.setProperty("--slide-duration", `${SLIDE_TRANSITION_DURATION}ms`);

const clampIndex = (index) => Math.max(0, Math.min(slides.length - 1, index));
const slideWidth = () => viewport.clientWidth || window.innerWidth;

const slideTransform = (offset) => (
    typeof offset === "number"
        ? `translate3d(${offset}px, 0, 0)`
        : `translate3d(${offset}, 0, 0)`
);

const updateProgress = (index) => {
    const maxIndex = slides.length - 1;
    const ratio = maxIndex > 0 ? clampIndex(index) / maxIndex : 0;
    progress.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
};

const clearSwipeUnlockTimer = () => {
    if (!swipeUnlockTimer) return;
    window.clearTimeout(swipeUnlockTimer);
    swipeUnlockTimer = null;
};

const clearTransitionTimer = () => {
    if (!transitionTimer) return;
    window.clearTimeout(transitionTimer);
    transitionTimer = null;
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

const isTransitioning = () => pendingIndex !== null;

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

const setStaticSlideState = () => {
    slides.forEach((slide, index) => {
        const isActive = index === activeIndex;
        slide.classList.toggle("is-visible", isActive);
        slide.classList.remove("is-preview");
        slide.style.transform = slideTransform(isActive ? 0 : "100%");
    });
};

const setActiveState = () => {
    updateProgress(activeIndex);

    slides.forEach((slide, index) => {
        const isActive = index === activeIndex;
        slide.classList.toggle("is-active", isActive);
        slide.setAttribute("aria-hidden", String(!isActive));

        if (isActive) {
            slide.setAttribute("aria-current", "true");
            animateCounts(slide);
        } else {
            slide.removeAttribute("aria-current");
        }

        const art = slide.querySelector(".chapter-art");
        if (art && !reduceMotion) {
            art.style.transform = `scale(${isActive ? 1.02 : 1.05})`;
        }
    });

    navItems.forEach((item) => {
        const target = item.getAttribute("href");
        const targetIndex = slides.findIndex((slide) => `#${slide.id}` === target);
        item.setAttribute("aria-current", String(targetIndex === activeIndex));
    });
};

const finishTransition = () => {
    if (pendingIndex === null) return;

    clearTransitionTimer();
    activeIndex = clampIndex(pendingIndex);
    pendingIndex = null;
    viewport.classList.remove("is-animating");
    setStaticSlideState();
    setActiveState();
    releaseSwipeInput();
};

const prepareAnimatedSlide = (nextIndex) => {
    const direction = nextIndex > activeIndex ? 1 : -1;
    const currentSlide = slides[activeIndex];
    const nextSlide = slides[nextIndex];

    viewport.classList.add("is-instant");

    slides.forEach((slide) => {
        slide.classList.remove("is-visible", "is-preview");
        slide.style.transform = slideTransform("100%");
    });

    currentSlide.classList.add("is-visible");
    currentSlide.style.transform = slideTransform(0);

    nextSlide.classList.add("is-visible", "is-preview");
    nextSlide.style.transform = slideTransform(`${direction * 100}%`);

    viewport.offsetWidth;
    viewport.classList.remove("is-instant");
    viewport.classList.add("is-animating");

    currentSlide.style.transform = slideTransform(`${direction * -100}%`);
    nextSlide.style.transform = slideTransform(0);
};

const goToSlide = (index, animate = !reduceMotion) => {
    const nextIndex = clampIndex(index);
    const shouldAnimate = animate && nextIndex !== activeIndex;

    clearTransitionTimer();
    pendingIndex = shouldAnimate ? nextIndex : null;
    viewport.classList.toggle("is-instant", !shouldAnimate);
    viewport.classList.toggle("is-animating", shouldAnimate);

    if (!shouldAnimate) {
        activeIndex = nextIndex;
        setStaticSlideState();
        setActiveState();
        releaseSwipeInput();
        return;
    }

    lockSwipeInput();
    updateProgress(nextIndex);
    prepareAnimatedSlide(nextIndex);

    transitionTimer = window.setTimeout(
        finishTransition,
        SLIDE_TRANSITION_DURATION + 80
    );
};

const scrollAdjacent = (direction) => {
    const baseIndex = pendingIndex ?? activeIndex;
    goToSlide(baseIndex + direction);
};

const setupDragPreview = (direction) => {
    const nextIndex = clampIndex(activeIndex + direction);
    dragDirection = nextIndex === activeIndex ? direction : Math.sign(nextIndex - activeIndex);
    dragTargetIndex = nextIndex;

    slides.forEach((slide) => {
        slide.classList.remove("is-visible", "is-preview");
        slide.style.transform = slideTransform("100%");
    });

    const activeSlide = slides[activeIndex];
    activeSlide.classList.add("is-visible");
    activeSlide.style.transform = slideTransform(0);

    if (nextIndex !== activeIndex) {
        const targetSlide = slides[nextIndex];
        targetSlide.classList.add("is-visible", "is-preview");
        targetSlide.style.transform = slideTransform(`${dragDirection * 100}%`);
    }
};

viewport.addEventListener("transitionend", (event) => {
    if (!event.target.classList.contains("slide") || event.propertyName !== "transform") return;
    finishTransition();
});

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

    lockSwipeInput();
    isDragging = true;
    dragPointerId = event.pointerId;
    dragStartX = event.clientX;
    dragDirection = 0;
    dragTargetIndex = activeIndex;

    viewport.classList.add("is-dragging", "is-instant");
    setupDragPreview(1);
    viewport.setPointerCapture(event.pointerId);
});

viewport.addEventListener("pointermove", (event) => {
    if (!isDragging || event.pointerId !== dragPointerId) return;

    const deltaX = event.clientX - dragStartX;
    if (Math.abs(deltaX) < 2) return;

    const direction = deltaX < 0 ? 1 : -1;

    if (direction !== dragDirection) {
        setupDragPreview(direction);
    }

    const activeSlide = slides[activeIndex];
    const targetSlide = slides[dragTargetIndex];
    const atBoundary = dragTargetIndex === activeIndex;
    const resistance = atBoundary ? 0.22 : 1;
    const visibleDelta = deltaX * resistance;

    activeSlide.style.transform = slideTransform(visibleDelta);

    if (!atBoundary) {
        targetSlide.style.transform = slideTransform(dragDirection * slideWidth() + visibleDelta);
    }
});

const endDrag = (event) => {
    if (!isDragging || event.pointerId !== dragPointerId) return;

    const clientX = Number.isFinite(event.clientX) ? event.clientX : dragStartX;
    const deltaX = clientX - dragStartX;
    const threshold = Math.min(slideWidth() * 0.18, DRAG_THRESHOLD);
    const shouldCommit = Math.abs(deltaX) > threshold && dragTargetIndex !== activeIndex;
    const activeSlide = slides[activeIndex];
    const targetSlide = slides[dragTargetIndex];

    isDragging = false;
    dragPointerId = null;
    viewport.classList.remove("is-dragging", "is-instant");
    viewport.classList.add("is-animating");

    if (viewport.hasPointerCapture(event.pointerId)) {
        viewport.releasePointerCapture(event.pointerId);
    }

    pendingIndex = shouldCommit ? dragTargetIndex : activeIndex;
    updateProgress(pendingIndex);

    if (shouldCommit) {
        activeSlide.style.transform = slideTransform(`${dragDirection * -100}%`);
        targetSlide.style.transform = slideTransform(0);
    } else {
        activeSlide.style.transform = slideTransform(0);
        if (dragTargetIndex !== activeIndex) {
            targetSlide.style.transform = slideTransform(`${dragDirection * 100}%`);
        }
    }

    transitionTimer = window.setTimeout(
        finishTransition,
        SLIDE_TRANSITION_DURATION + 80
    );
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
        goToSlide(Number(button.dataset.jump));
    });
});

internalLinks.forEach((item) => {
    item.addEventListener("click", (event) => {
        const target = item.getAttribute("href");
        const targetIndex = slides.findIndex((slide) => `#${slide.id}` === target);

        if (targetIndex < 0) return;

        event.preventDefault();
        if (swipeLocked || isTransitioning() || isDragging) return;
        goToSlide(targetIndex);
    });
});

const syncHash = () => {
    const targetIndex = slides.findIndex((slide) => `#${slide.id}` === window.location.hash);

    if (targetIndex < 0) return;

    clearTransitionTimer();
    pendingIndex = null;
    swipeLocked = false;
    viewport.classList.add("is-instant");
    viewport.classList.remove("is-animating", "is-dragging");
    goToSlide(targetIndex, false);
};

document.addEventListener("keydown", (event) => {
    if (swipeLocked || isTransitioning() || isDragging) return;

    if (event.key === "ArrowRight" || event.key === "PageDown" || event.key.toLowerCase() === "d") {
        scrollAdjacent(1);
    }

    if (event.key === "ArrowLeft" || event.key === "PageUp" || event.key.toLowerCase() === "a") {
        scrollAdjacent(-1);
    }

    if (event.key === "Home") {
        goToSlide(0);
    }

    if (event.key === "End") {
        goToSlide(slides.length - 1);
    }
});

window.addEventListener("resize", () => {
    clearTransitionTimer();
    clearSwipeUnlockTimer();
    pendingIndex = null;
    swipeLocked = false;
    viewport.classList.add("is-instant");
    viewport.classList.remove("is-animating", "is-dragging");
    setStaticSlideState();
    setActiveState();
});

setStaticSlideState();
setActiveState();
window.addEventListener("load", () => window.setTimeout(syncHash, 80));
window.addEventListener("hashchange", syncHash);
