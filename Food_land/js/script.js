/**
 * Makhana Landing Page - Vanilla JS Interactive Effects
 */

document.addEventListener('DOMContentLoaded', () => {

  /* ====================================================
     1. STICKY NAVBAR on Scroll
     ==================================================== */
  const navbar = document.getElementById('navbar');

  // Add scrolled class on scroll down, remove on top
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  /* ====================================================
     2. SCROLL REVEAL ANIMATIONS (Intersection Observer)
     ==================================================== */
  const revealElements = document.querySelectorAll('.reveal');

  const revealOptions = {
    threshold: 0.15, // Trigger when 15% of the element is visible
    rootMargin: "0px 0px -50px 0px"
  };

  const revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;

      // Add active class to start CSS transition
      entry.target.classList.add('active');
      // Unobserve after revealing to prevent repeating animation
      observer.unobserve(entry.target);
    });
  }, revealOptions);

  revealElements.forEach(el => {
    revealObserver.observe(el);
  });


  /* ====================================================
     3. HERO PARALLAX EFFECT on Mouse Move
     ==================================================== */
  const parallaxScene = document.getElementById('parallax-scene');
  const parallaxItems = document.querySelectorAll('.parallax-el');

  // Only apply parallax on non-touch devices (screens wider than 768px usually)
  if (parallaxScene && window.innerWidth > 768) {

    // Variable to track animation frame to prevent excessive re-renders
    let requestId = null;
    let mouseX = 0;
    let mouseY = 0;

    // The update function runs optimally using requestAnimationFrame
    const updateParallax = () => {
      const rect = parallaxScene.getBoundingClientRect();

      // Calculate center of the area
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      // Calculate distance of mouse from center
      const xDiff = mouseX - centerX;
      const yDiff = mouseY - centerY;

      parallaxItems.forEach(item => {
        // Get the requested speed for this specific element
        const speed = parseFloat(item.getAttribute('data-speed')) || 1;

        // Calculate movement coordinates
        const xPos = (xDiff * speed) / 60; // 60 is a dampening factor
        const yPos = (yDiff * speed) / 60;

        // Apply translation
        item.style.transform = `translate(${xPos}px, ${yPos}px)`;
      });

      requestId = null;
    };

    // Listen to mouse movement over the scene
    parallaxScene.addEventListener('mousemove', (e) => {
      const rect = parallaxScene.getBoundingClientRect();

      // Get mouse coordinates relative to the scene container
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;

      // Request animation frame for smooth, performant animation
      if (!requestId) {
        requestId = requestAnimationFrame(updateParallax);
      }
    });

    // Reset objects to origin when mouse leaves the scene smoothly
    parallaxScene.addEventListener('mouseleave', () => {
      if (requestId) {
        cancelAnimationFrame(requestId);
        requestId = null;
      }

      parallaxItems.forEach(item => {
        // Add transition for smooth snap-back
        item.style.transition = 'transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        item.style.transform = `translate(0px, 0px)`;
      });

      // Remove the CSS transition rule after it's done so it doesn't lag the mousemove parallax
      setTimeout(() => {
        parallaxItems.forEach(item => {
          item.style.transition = ''; // Reset back to CSS default or none
        });
      }, 800);
    });
  }

  /* ====================================================
     4. HORIZONTAL REVIEWS CAROUSEL — INFINITE CLONE
     ==================================================== */
  const track = document.getElementById('reviews-track');
  if (track) {
    // Clone all direct children (cards + connectors) to create a seamless duplicate set.
    // The animation shifts by exactly -50%, landing on the start of the clone set.
    const children = Array.from(track.children);
    children.forEach(child => {
      const clone = child.cloneNode(true);
      track.appendChild(clone);
    });
  }

});
