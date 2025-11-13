/* ============================================================
   Workout App — Unified Script (Audio-First, End-to-End Hooks)
   Date: 2025-11-07
   Updated: Added support for new userWorkouts format with scadenza
   Notes:
   - Contains the complete, working audio layer (Cloud TTS, Synth TTS,
     Beppe pre-recorded, Beep/Transition SFX) + iOS unlock.
   - Includes playExercise/startExerciseTimer/resumeTimer and essential
     app wiring to ensure audio cues fire at 60s/30s/10s/5s and boundaries.
   - UPDATED: Now handles userWorkouts format: { scadenza, workouts: [...] }
   ============================================================ */

/* -------------------- Global State -------------------- */
let workouts = {};
let selectedWorkout = {};
let currentStep = 0;
let interval = null;
let isPaused = false;
let savedTimeLeft = null;
let lastSpeakTime = 0;
let currentSpeakId = 0;
let wakeLock = null; // Screen wake lock to keep screen on during workout

/* -------------------- Configuration Constants -------------------- */
// Viewport metric update delays (iOS Safari needs multiple passes for accurate measurements)
const VIEWPORT_UPDATE_DELAYS = {
  FIRST: 250,   // First retry after initial calculation
  SECOND: 750   // Second retry to ensure stability
};

// Carousel configuration
const CAROUSEL_CONFIG = {
  MIN_HEIGHT: 140,           // Minimum carousel height in pixels
  MAX_HEIGHT: 280,           // Maximum carousel height in pixels
  HEIGHT_PERCENTAGE: 0.45    // Percentage of sheet height for carousel (45%)
};

// Training selector configuration
const TRAINING_CONFIG = {
  IMAGE_HEIGHT_PERCENTAGE: 0.42  // Hero image takes 42% of visible height
};

// Audio timing thresholds
const AUDIO_CUES = {
  LONG_WARNING: 60,    // Long exercises get cue at 60 seconds
  MEDIUM_WARNING: 30,  // Medium exercises get cue at 30 seconds
  SHORT_WARNING: 10,   // Short warning at 10 seconds
  FINAL_WARNING: 5     // Final countdown at 5 seconds
};

/* Singletons */
const ttsAudio = new Audio();
ttsAudio.id = "tts-audio";
ttsAudio.preload = "auto";
ttsAudio.playsInline = true;
ttsAudio.setAttribute("playsinline", "");
ttsAudio.setAttribute("webkit-playsinline", "");
document.body.appendChild(ttsAudio);

/* -------------------- Wake Lock (Keep Screen On) -------------------- */
/**
 * Request screen wake lock to prevent screen from turning off during workout
 */
async function requestWakeLock() {
  try {
    // Check if Wake Lock API is supported
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('✅ Screen wake lock activated - screen will stay on');
      
      // Listen for wake lock release
      wakeLock.addEventListener('release', () => {
        console.log('🔓 Wake lock released');
      });
    } else {
      console.log('⚠️ Wake Lock API not supported on this browser');
      // Fallback: iOS Safari doesn't support Wake Lock API
      // But we can use a video element trick
      enableIOSScreenWakeLock();
    }
  } catch (err) {
    console.error('❌ Failed to activate wake lock:', err);
    // Try iOS fallback
    enableIOSScreenWakeLock();
  }
}

/**
 * Release the wake lock (allow screen to turn off normally)
 */
async function releaseWakeLock() {
  if (wakeLock !== null) {
    try {
      await wakeLock.release();
      wakeLock = null;
      console.log('🔓 Screen wake lock released - screen can turn off normally');
    } catch (err) {
      console.error('❌ Failed to release wake lock:', err);
    }
  }
  // Also disable iOS fallback
  disableIOSScreenWakeLock();
}

/**
 * iOS Safari fallback: Use a tiny looping video to keep screen awake
 */
let iosWakeLockVideo = null;
function enableIOSScreenWakeLock() {
  if (!iosWakeLockVideo) {
    // Create a 1x1 transparent video that loops
    iosWakeLockVideo = document.createElement('video');
    iosWakeLockVideo.setAttribute('muted', '');
    iosWakeLockVideo.setAttribute('playsinline', '');
    iosWakeLockVideo.setAttribute('loop', '');
    iosWakeLockVideo.style.position = 'fixed';
    iosWakeLockVideo.style.opacity = '0';
    iosWakeLockVideo.style.width = '1px';
    iosWakeLockVideo.style.height = '1px';
    iosWakeLockVideo.style.pointerEvents = 'none';
    
    // Tiny base64 video (1 frame, transparent)
    iosWakeLockVideo.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAu1tZGF0AAACrQYF//+p3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE0OCByMjYwMSBhMGIxMGMxIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAxNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAD2WIhAAR//73n74i1R7AYWvoAAADAAADAAADAAADAAADAAAGKjAAH//73n74i1R7AYWvoAAAAwAAAwAAAwAAAwAAAwAABiowAB//+95++ItUewGFr6AAAAMAAAMAAAMAAAMAAAMAAAYqMAA==';
    
    document.body.appendChild(iosWakeLockVideo);
  }
  
  // Start playing the video
  iosWakeLockVideo.play().catch(err => {
    console.log('iOS wake lock video failed to play:', err);
  });
  
  console.log('✅ iOS Screen wake lock fallback activated');
}

function disableIOSScreenWakeLock() {
  if (iosWakeLockVideo) {
    iosWakeLockVideo.pause();
    iosWakeLockVideo.currentTime = 0;
  }
}

/* -------------------- Viewport Metrics (iOS Safari toolbars) -------------------- */
const VIEWPORT_VAR_ROOT = document.documentElement;

function updateViewportMetrics() {
  const viewport = window.visualViewport;
  const height = viewport ? viewport.height : window.innerHeight || 0;
  const width = viewport ? viewport.width : window.innerWidth || 0;

  const computed = getComputedStyle(VIEWPORT_VAR_ROOT);
  const safeTop = parseFloat(computed.getPropertyValue('--safe-area-top')) || 0;
  const safeBottom = parseFloat(computed.getPropertyValue('--safe-area-bottom')) || 0;
  
  // CRITICAL: Subtract safe areas from visible height for iOS
  const adjustedHeight = Math.max(0, height - safeTop - safeBottom);

  if (adjustedHeight > 0) {
    VIEWPORT_VAR_ROOT.style.setProperty('--visible-vh', `${adjustedHeight}px`);
  }
  if (width) {
    VIEWPORT_VAR_ROOT.style.setProperty('--visible-vw', `${width}px`);
  }

  const header = document.querySelector('header');
  const headerHeight = header ? header.getBoundingClientRect().height : 0;

  const footerTotal = parseFloat(computed.getPropertyValue('--footer-total')) || 0;
  const loginGap = parseFloat(computed.getPropertyValue('--login-gap')) || 0;

  const loginAvailable = Math.max(0, adjustedHeight - headerHeight);
  VIEWPORT_VAR_ROOT.style.setProperty('--login-screen-height-js', `${loginAvailable}px`);

  const mainAvailable = Math.max(0, adjustedHeight - headerHeight - footerTotal);
  VIEWPORT_VAR_ROOT.style.setProperty('--main-app-visible-height', `${mainAvailable}px`);

  const loginCard = document.querySelector('#login-screen .login-card');
  const cardHeight = loginCard ? loginCard.getBoundingClientRect().height : 0;
  const selectorAvailable = Math.max(0, loginAvailable - cardHeight - loginGap);

  if (selectorAvailable > 0) {
    VIEWPORT_VAR_ROOT.style.setProperty('--training-selector-js-height', `${selectorAvailable}px`);
  } else {
    VIEWPORT_VAR_ROOT.style.removeProperty('--training-selector-js-height');
  }

  const sheetAvailable = Math.max(0, adjustedHeight - 24);
  if (sheetAvailable > 0) {
    VIEWPORT_VAR_ROOT.style.setProperty('--bottom-sheet-max-height', `${sheetAvailable}px`);
    const carouselHeight = Math.max(
      CAROUSEL_CONFIG.MIN_HEIGHT, 
      Math.min(sheetAvailable * CAROUSEL_CONFIG.HEIGHT_PERCENTAGE, CAROUSEL_CONFIG.MAX_HEIGHT)
    );
    VIEWPORT_VAR_ROOT.style.setProperty('--bottom-sheet-carousel-height', `${carouselHeight}px`);
  } else {
    VIEWPORT_VAR_ROOT.style.removeProperty('--bottom-sheet-max-height');
    VIEWPORT_VAR_ROOT.style.removeProperty('--bottom-sheet-carousel-height');
  }
}

function initViewportMetrics() {
  updateViewportMetrics();
  setTimeout(updateViewportMetrics, VIEWPORT_UPDATE_DELAYS.FIRST);
  setTimeout(updateViewportMetrics, VIEWPORT_UPDATE_DELAYS.SECOND);

  window.addEventListener('resize', updateViewportMetrics, { passive: true });
  window.addEventListener('orientationchange', () => {
    setTimeout(updateViewportMetrics, 150);
  }, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateViewportMetrics, { passive: true });
    window.visualViewport.addEventListener('scroll', updateViewportMetrics, { passive: true });
  }
}

window.refreshViewportMetrics = updateViewportMetrics;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initViewportMetrics, { once: true });
} else {
  initViewportMetrics();
}

/* === LOGIN SCREEN: VISIBLE HEIGHT + NO SCROLL LOCK === */

/* Reuse existing root and function if present; otherwise define safely */
const __ROOT__ = document.documentElement;

function __updateLoginViewportVars() {
  const vv = window.visualViewport;
  const vh = vv ? vv.height : window.innerHeight || 0;
  const header = document.querySelector('header');
  const headerH = header ? header.getBoundingClientRect().height : 0;

  // Safe area bottom from CSS var
  const cs = getComputedStyle(__ROOT__);
  const safeBottom = parseFloat(cs.getPropertyValue('--safe-area-bottom')) || 0;

  // Visible height available for the login screen
  const loginAvailable = Math.max(0, vh - headerH - safeBottom);
  __ROOT__.style.setProperty('--login-screen-height-js', `${loginAvailable}px`);
}

/* Add/remove a no-scroll lock while #login-screen is visible */
function __applyLoginScrollLock() {
  const login = document.getElementById('login-screen');
  const isVisible = !!login && getComputedStyle(login).display !== 'none';
  document.documentElement.classList.toggle('no-scroll', isVisible);
  document.body.classList.toggle('no-scroll', isVisible);
}

/* Hook up events */
function __bindLoginViewportHandlers() {
  __updateLoginViewportVars();
  __applyLoginScrollLock();

  // Recalculate on viewport changes (iOS toolbars, rotate, resize)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      __updateLoginViewportVars();
      __applyLoginScrollLock();
    });
    window.visualViewport.addEventListener('scroll', () => {
      __updateLoginViewportVars();
      __applyLoginScrollLock();
    });
  }
  window.addEventListener('resize', () => {
    __updateLoginViewportVars();
    __applyLoginScrollLock();
  });

  // A couple of delayed passes help on iOS after load
  setTimeout(__updateLoginViewportVars, 250);
  setTimeout(__updateLoginViewportVars, 750);
}

document.addEventListener('DOMContentLoaded', __bindLoginViewportHandlers);

/* -------------------- Training Selector (Login Screen) -------------------- */
let selectedTrainingType = null;

const trainingData = {
  nutrition: {
    title: "NUTRIZIONE",
    description: "Traccia ogni pasto e raggiungi i tuoi obiettivi con precisione",
    icon: "🥗",
    images: [
      {
        url: "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&q=80",
        mainText: "Traccia i tuoi macronutrienti con precisione per risultati ottimali",
        caption: "Traccia Macronutrienti",
        description: "Monitora proteine, carboidrati e grassi in tempo reale. Sistema avanzato di logging alimentare con database completo di oltre 50.000 alimenti."
      },
      {
        url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
        mainText: "Piano alimentare personalizzato basato sui tuoi obiettivi",
        caption: "Piano Personalizzato",
        description: "Ricette e piani pasto generati automaticamente in base ai tuoi obiettivi. Adatta le porzioni e sostituisci ingredienti con un click."
      },
      {
        url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
        mainText: "Analizza i progressi e migliora costantemente le tue abitudini",
        caption: "Progressi Visibili",
        description: "Grafici dettagliati delle tue abitudini alimentari. Identifica pattern e ottimizza la tua dieta settimana dopo settimana."
      }
    ]
  },
  aerobic: {
    title: "ALLENAMENTO AEROBICO",
    description: "Brucia calorie, aumenta resistenza e migliora la salute cardiovascolare",
    icon: "🏃",
    images: [
      {
        url: "https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=800&q=80",
        mainText: "Brucia calorie e migliora la resistenza cardiovascolare",
        caption: "Cardio ad Alta Intensità",
        description: "HIIT, corsa e ciclismo per massimizzare la perdita di grasso. Allenamenti da 20-45 minuti che stimolano il metabolismo per ore."
      },
      {
        url: "https://images.unsplash.com/photo-1483721310020-03333e577078?w=800&q=80",
        mainText: "Programmi adattati al tuo livello di fitness attuale",
        caption: "Allenamenti Personalizzati",
        description: "Dal principiante all'atleta avanzato. Progressione automatica basata sulle tue performance e frequenza cardiaca."
      },
      {
        url: "https://images.unsplash.com/photo-1434596922112-19c563067271?w=800&q=80",
        mainText: "Traccia distanza, tempo, calorie e miglioramento costante",
        caption: "Monitora i Progressi",
        description: "Sincronizzazione con smartwatch e fitness tracker. Visualizza statistiche dettagliate e raggiungi nuovi record personali."
      }
    ]
  },
  muscle: {
    title: "PIÙ MUSCOLI",
    description: "Costruisci forza e massa muscolare con allenamento di resistenza mirato",
    icon: "💪",
    images: [
      {
        url: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=80",
        mainText: "Costruisci forza e massa muscolare con allenamento di resistenza mirato",
        caption: "Esercizi Fondamentali",
        description: "Squat, panca, stacco e movimenti composti per crescita massima. Focus sui grandi gruppi muscolari per risultati rapidi e duraturi."
      },
      {
        url: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=800&q=80",
        mainText: "Aumenta carichi gradualmente con progressione intelligente",
        caption: "Progressione Intelligente",
        description: "Sistema di sovraccarico progressivo scientificamente provato. Calcolo automatico dei carichi basato sulle tue performance settimanali."
      },
      {
        url: "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=800&q=80",
        mainText: "Esecuzione perfetta per massimi risultati e sicurezza",
        caption: "Tecnica Perfetta",
        description: "Video guide dettagliate e correzioni in tempo reale. Impara la forma corretta per prevenire infortuni e ottimizzare ogni ripetizione."
      }
    ]
  }
};

function initTrainingSelector() {
  const zones = document.querySelectorAll('.training-zone');
  const bottomSheet = document.getElementById('training-bottom-sheet');
  const sheetOverlay = bottomSheet?.querySelector('.bottom-sheet-overlay');
  const sheetTitle = document.getElementById('sheet-title');
  const sheetMainText = document.getElementById('sheet-main-text');
  const startBtn = document.getElementById('sheet-start-btn');
  
  // Carousel elements
  const carouselTrack = document.getElementById('carousel-track');
  const carouselDots = document.getElementById('carousel-dots');
  const prevBtn = document.getElementById('carousel-prev');
  const nextBtn = document.getElementById('carousel-next');
  const carouselTextOverlay = document.getElementById('carousel-text-overlay');
  const overlayText = document.getElementById('overlay-text');
  const detailsSection = document.getElementById('details-section');
  
  let currentSlide = 0;
  let totalSlides = 0;
  let currentImagesData = []; // Store current training images data

  if (!bottomSheet || zones.length === 0) return;

  // Carousel navigation function
  function updateCarousel(index) {
    if (!carouselTrack || totalSlides === 0) return;
    
    currentSlide = Math.max(0, Math.min(index, totalSlides - 1));
    const offset = -currentSlide * 100;
    carouselTrack.style.transform = `translateX(${offset}%)`;
    
    // Update dots
    const dots = carouselDots?.querySelectorAll('.carousel-dot');
    dots?.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentSlide);
    });
    
    // Update button states
    if (prevBtn) prevBtn.disabled = currentSlide === 0;
    if (nextBtn) nextBtn.disabled = currentSlide === totalSlides - 1;
    
    // Update main text and overlay text with current slide data
    if (currentImagesData[currentSlide]) {
      const slideData = currentImagesData[currentSlide];
      
      // Update main text (visible when not expanded)
      if (sheetMainText) {
        sheetMainText.textContent = slideData.mainText;
      }
      
      // Update overlay text (visible when expanded)
      if (overlayText) {
        overlayText.textContent = slideData.mainText;
      }
      
      // Update details section if visible (expanded state)
      if (detailsSection && detailsSection.style.display !== 'none') {
        detailsSection.innerHTML = `
          <div class="detail-item">
            <h4>${slideData.caption}</h4>
            <p>${slideData.description}</p>
          </div>
        `;
      }
    }
  }
  
  // Initialize carousel with images
  function setupCarousel(images) {
    if (!carouselTrack || !carouselDots) return;
    
    // Save images data for text updates
    currentImagesData = images;
    
    // Clear existing content
    carouselTrack.innerHTML = '';
    carouselDots.innerHTML = '';
    currentSlide = 0;
    totalSlides = images.length;
    
    // Create slides
    images.forEach((img, index) => {
      const slide = document.createElement('div');
      slide.className = 'carousel-slide';
      slide.innerHTML = `
        <img src="${img.url}" alt="${img.caption}" loading="lazy">
      `;
      carouselTrack.appendChild(slide);
      
      // Create dot
      const dot = document.createElement('button');
      dot.className = 'carousel-dot';
      dot.setAttribute('aria-label', `Slide ${index + 1}`);
      dot.addEventListener('click', () => updateCarousel(index));
      carouselDots.appendChild(dot);
    });
    
    updateCarousel(0);
  }
  
  // Carousel button handlers
  prevBtn?.addEventListener('click', () => {
    updateCarousel(currentSlide - 1);
  });
  
  nextBtn?.addEventListener('click', () => {
    updateCarousel(currentSlide + 1);
  });
  
  // Touch/swipe support for carousel
  let touchStartX = 0;
  let touchEndX = 0;
  
  carouselTrack?.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  });
  
  carouselTrack?.addEventListener('touchend', (e) => {
    touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        // Swipe left - next
        updateCarousel(currentSlide + 1);
      } else {
        // Swipe right - prev
        updateCarousel(currentSlide - 1);
      }
    }
  });

  // Add haptic feedback (if available)
  function vibrate(pattern = 10) {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  // Handle zone clicks
  zones.forEach(zone => {
    zone.addEventListener('click', (e) => {
      e.preventDefault();
      const trainingType = zone.dataset.training;
      const data = trainingData[trainingType];
      
      if (!data) return;

      // Haptic feedback
      vibrate(10);

      // Visual feedback
      zone.classList.add('tapped');
      setTimeout(() => zone.classList.remove('tapped'), 600);

      // Store selected training
      selectedTrainingType = trainingType;

      // Update bottom sheet content
      sheetTitle.textContent = data.title;
      
      // Setup carousel with images (will also initialize main text)
      if (data.images && data.images.length > 0) {
        setupCarousel(data.images);
      }

      // Show bottom sheet
      setTimeout(() => {
        bottomSheet.classList.add('active');
        updateViewportMetrics();
      }, 300);
    });
  });

  // Close bottom sheet
  function closeBottomSheet() {
    bottomSheet.classList.remove('active');
    bottomSheet.classList.remove('details-expanded');
    
    // Reset details section
    const detailsSectionEl = document.getElementById('details-section');
    const detailsToggleBtnEl = document.getElementById('details-toggle-btn');
    const sheetTitleEl = document.getElementById('sheet-title');
    const sheetMainTextEl = document.getElementById('sheet-main-text');
    const carouselTextOverlayEl = document.getElementById('carousel-text-overlay');
    
    if (detailsSectionEl) detailsSectionEl.style.display = 'none';
    if (detailsToggleBtnEl) {
      detailsToggleBtnEl.classList.remove('expanded');
      const toggleIcon = detailsToggleBtnEl.querySelector('.toggle-icon');
      const toggleText = detailsToggleBtnEl.querySelector('span:first-child');
      if (toggleIcon) toggleIcon.textContent = '↓';
      if (toggleText) toggleText.textContent = 'Altri dettagli';
    }
    if (sheetTitleEl) sheetTitleEl.style.display = 'block';
    if (sheetMainTextEl) sheetMainTextEl.style.display = 'block';
    if (carouselTextOverlayEl) carouselTextOverlayEl.style.display = 'none';
    
    vibrate(5);
    updateViewportMetrics();
  }

  sheetOverlay?.addEventListener('click', closeBottomSheet);

  // Start training button
  startBtn?.addEventListener('click', () => {
    vibrate([10, 50, 10]);
    closeBottomSheet();
    
    // Store training type in sessionStorage
    if (selectedTrainingType) {
      sessionStorage.setItem('selectedTraining', selectedTrainingType);
    }

    // Scroll to login card
    const loginCard = document.querySelector('.login-card');
    if (loginCard) {
      loginCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Optional: highlight login card briefly
      loginCard.style.border = '2px solid var(--color-white)';
      loginCard.style.transition = 'border 0.3s ease';
      setTimeout(() => {
        loginCard.style.border = '';
      }, 1500);
    }
  });

  // Details toggle button
  const detailsToggleBtn = document.getElementById('details-toggle-btn');
  
  detailsToggleBtn?.addEventListener('click', () => {
    const isExpanded = detailsSection.style.display !== 'none';
    
    if (isExpanded) {
      // Collapse
      detailsSection.style.display = 'none';
      detailsToggleBtn.classList.remove('expanded');
      detailsToggleBtn.querySelector('.toggle-icon').textContent = '↓';
      detailsToggleBtn.querySelector('span:first-child').textContent = 'Altri dettagli';
      sheetTitle.style.display = 'block';
      sheetMainText.style.display = 'block';
      carouselTextOverlay.style.display = 'none';
      bottomSheet.classList.remove('details-expanded');
    } else {
      // Expand - show ONLY current slide details
      if (currentImagesData[currentSlide]) {
        const slideData = currentImagesData[currentSlide];
        detailsSection.innerHTML = `
          <div class="detail-item">
            <h4>${slideData.caption}</h4>
            <p>${slideData.description}</p>
          </div>
        `;
      }
      
      detailsSection.style.display = 'block';
      detailsToggleBtn.classList.add('expanded');
      detailsToggleBtn.querySelector('.toggle-icon').textContent = '↑';
      detailsToggleBtn.querySelector('span:first-child').textContent = 'Nascondi dettagli';
      sheetTitle.style.display = 'none';
      sheetMainText.style.display = 'none';
      carouselTextOverlay.style.display = 'flex';
      bottomSheet.classList.add('details-expanded');
    }
    
    vibrate(5);
  });

  // Swipe down to close (mobile gesture)
  let touchStartY = 0;
  const panel = bottomSheet.querySelector('.bottom-sheet-panel');
  
  panel?.addEventListener('touchstart', (e) => {
    touchStartY = e.touches[0].clientY;
  });

  panel?.addEventListener('touchmove', (e) => {
    const touchY = e.touches[0].clientY;
    const diff = touchY - touchStartY;
    
    if (diff > 0) {
      panel.style.transform = `translateY(${diff}px)`;
    }
  });

  panel?.addEventListener('touchend', (e) => {
    const touchY = e.changedTouches[0].clientY;
    const diff = touchY - touchStartY;
    
    if (diff > 100) {
      closeBottomSheet();
    }
    
    panel.style.transform = '';
    touchStartY = 0;
  });
}

// Sequential animation for training zones - SIMPLIFIED for reliability
function startSequentialAnimation() {
  const zones = document.querySelectorAll('.training-zone');
  if (zones.length === 0) {
    console.warn('No training zones found for animation');
    return;
  }

  console.log(`Found ${zones.length} training zones, starting animation`);
  
  let currentIndex = 0;
  let animationInterval;
  
  function animateZone(zone) {
    const tapText = zone.querySelector('.tap-text');
    const ripple1 = zone.querySelector('.ripple-1');
    const ripple2 = zone.querySelector('.ripple-2');
    
    console.log(`Animating zone: ${zone.dataset.training}`);
    
    // Reset animations
    if (tapText) tapText.style.animation = 'none';
    if (ripple1) ripple1.style.animation = 'none';
    if (ripple2) ripple2.style.animation = 'none';
    
    // Force reflow
    void zone.offsetWidth;
    
    // Apply animations using requestAnimationFrame for best mobile support
    requestAnimationFrame(() => {
      zone.classList.add('animating');
      
      if (tapText) {
        tapText.style.animation = 'text-appear 2s ease-out forwards';
      }
      
      if (ripple1) {
        ripple1.style.animation = 'ripple-wave 2s ease-out forwards';
      }
      
      if (ripple2) {
        ripple2.style.animation = 'ripple-wave-delayed 2s ease-out 0.3s forwards';
      }
    });
    
    // Clean up after animation
    setTimeout(() => {
      zone.classList.remove('animating');
      if (tapText) tapText.style.animation = '';
      if (ripple1) ripple1.style.animation = '';
      if (ripple2) ripple2.style.animation = '';
    }, 2100);
  }
  
  function animateNextZone() {
    // Reset all zones
    zones.forEach(z => {
      z.classList.remove('animating');
      const tapText = z.querySelector('.tap-text');
      const ripple1 = z.querySelector('.ripple-1');
      const ripple2 = z.querySelector('.ripple-2');
      if (tapText) tapText.style.animation = '';
      if (ripple1) ripple1.style.animation = '';
      if (ripple2) ripple2.style.animation = '';
    });
    
    // Animate current zone
    if (currentIndex < zones.length) {
      const currentZone = zones[currentIndex];
      animateZone(currentZone);
      currentIndex++;
    } else {
      // Restart from beginning
      currentIndex = 0;
    }
  }
  
  // Touch event for manual trigger
  zones.forEach((zone, index) => {
    zone.addEventListener('touchstart', (e) => {
      console.log(`Touch on zone ${index}: ${zone.dataset.training}`);
      animateZone(zone);
    }, { passive: true });
  });
  
  // Start animation loop
  setTimeout(() => {
    console.log('Starting animation loop');
    animateNextZone();
    animationInterval = setInterval(animateNextZone, 2200);
    window.trainingAnimationInterval = animationInterval;
  }, 500);
}

// Initialize on DOM load - ONLY on index.html (login page)
// Check if we're on the index/login page before initializing training animations
const isIndexPage = window.location.pathname === '/' || 
                    window.location.pathname === '/index.html' || 
                    window.location.pathname.endsWith('/index.html');

if (isIndexPage) {
  console.log('✅ Index page detected - initializing training selector animations');
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initTrainingSelector();
      // Small delay to ensure DOM is fully ready
      setTimeout(startSequentialAnimation, 100);
    });
  } else {
    initTrainingSelector();
    setTimeout(startSequentialAnimation, 100);
  }
} else {
  console.log('ℹ️ Not on index page - skipping training selector animations');
}

window.__audioCtx = new (window.AudioContext || window.webkitAudioContext)();


let nextPreviewShown = false;   // controls the 10s preview (fires once per exercise)

function setSoundMode(value) {
  const a = document.getElementById("soundMode");
  const b = document.getElementById("soundMode-setup");
  if (a) a.value = value;
  if (b) b.value = value;
}
function getPreferredVoice() {
  const list = (speechSynthesis.getVoices && speechSynthesis.getVoices()) || [];
  // prefer Google voices first
  const googleIt = list.find(v => /google/i.test(v.name||"") && /^it(-|_)/i.test(v.lang||""));
  if (googleIt) return googleIt;
  const googleEn = list.find(v => /google/i.test(v.name||"") && /^en(-|_)/i.test(v.lang||""));
  if (googleEn) return googleEn;
  // then any Italian / English
  const anyIt = list.find(v => /^it(-|_)/i.test(v.lang||""));
  if (anyIt) return anyIt;
  const anyEn = list.find(v => /^en(-|_)/i.test(v.lang||""));
  if (anyEn) return anyEn;
  // fallback: first Google, else first voice
  const anyGoogle = list.find(v => /google/i.test(v.name||""));
  return anyGoogle || list[0] || null;
}
try {
  const __ctx = new (window.AudioContext || window.webkitAudioContext)();
  window.__audioCtx = __ctx;
  setInterval(() => {
    if (__ctx.state === "suspended") { __ctx.resume().catch(()=>{}); }
  }, 1500);
} catch {}

  
// keep a shared AudioContext alive on Android
try {
  const __ctx = new (window.AudioContext || window.webkitAudioContext)();
  window.__audioCtx = __ctx;
  setInterval(() => {
    if (__ctx.state === "suspended") { __ctx.resume().catch(()=>{}); }
  }, 2000);
} catch {}






/* Pre-recorded (Beppe) player */
let beppePlayer = new Audio();
beppePlayer.preload = "auto";

/* Warm-up Render TTS (optional) */
function warmUpServer() {
  fetch("https://google-tts-server.onrender.com")
    .then(() => console.log("✅ TTS server attivo"))
    .catch(() => console.warn("⚠️ Server TTS non raggiungibile"));
}

/* -------------------- Synth Voice Lock -------------------- */
// --- Synth voices lock (Android-safe) ---
const SYNTH_PREFS = {
  "it-IT": ["Siri Voice 4","Siri Voice 3","Google italiano","Microsoft Elsa","Microsoft Lucia"],
  "en-US": ["Siri Voice 3","Siri Voice 2","Google US English","Microsoft Aria","Microsoft Jenny"]
};

const synthVoicesLocked = {}; // per lingua → voce scelta

function pickVoice(lang) {
  const all = (speechSynthesis.getVoices && speechSynthesis.getVoices()) || [];
  const want = (lang || "").toLowerCase();

  // Prefer Google voices on Android if present
  const googleFirst = all.find(v =>
    (v.lang || "").toLowerCase().startsWith(want) &&
    /google/i.test(v.name || "")
  );
  if (googleFirst) return googleFirst;

  // Your existing preferences still apply
  for (const name of (SYNTH_PREFS[lang] || [])) {
    const v = all.find(v =>
      (v.lang || "").toLowerCase().startsWith(want) &&
      (v.name || "").includes(name)
    );
    if (v) return v;
  }

  const same = all.filter(v => (v.lang || "").toLowerCase().startsWith(want));
  if (same.length) return same[0];

  return all[0] || null;
}



function lockSynthVoices() {
  try {
    synthVoicesLocked["it-IT"] = pickVoice("it-IT");
    synthVoicesLocked["en-US"] = pickVoice("en-US");
  } catch {}
}

/**
 * Wait until voices are actually available.
 * Android often never fires onvoiceschanged; we poll with a timeout fallback.
 */
function waitForVoices(timeoutMs = 1500) {
  return new Promise(resolve => {
    const done = () => resolve();
    if ((speechSynthesis.getVoices() || []).length) return done();

    let settled = false;
    const finish = () => { if (!settled) { settled = true; done(); } };

    const prev = speechSynthesis.onvoiceschanged;
    speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = prev || null; finish(); };

    const start = Date.now();
    const poll = setInterval(() => {
      const vs = speechSynthesis.getVoices() || [];
      if (vs.length || Date.now() - start >= timeoutMs) { clearInterval(poll); finish(); }
    }, 100);
    setTimeout(() => { clearInterval(poll); finish(); }, timeoutMs + 200);
  });
}

/* ---------- Android Synth Primer (user-gesture + resume) ---------- */
let __synthPrimed = false;

function primeSynth() {
  if (__synthPrimed || !('speechSynthesis' in window)) return;
  try {
    // Make sure voices are actually loaded (poll fallback)
    const ensureVoices = new Promise((resolve) => {
      const have = () => (speechSynthesis.getVoices() || []).length > 0;
      if (have()) return resolve();
      const start = Date.now();
      const t = setInterval(() => {
        if (have() || Date.now() - start > 1500) {
          clearInterval(t);
          resolve();
        }
      }, 100);
    });

    ensureVoices.then(() => {
      try { speechSynthesis.resume(); } catch {}

      const u = new SpeechSynthesisUtterance(" "); // silent kick
      u.volume = 0;      // inaudible
      u.rate = 1;
      u.pitch = 1;
      // If Android never fires events, just mark as primed after a moment
      const watchdog = setTimeout(() => { __synthPrimed = true; }, 250);
      u.onstart = () => { clearTimeout(watchdog); __synthPrimed = true; };
      u.onerror = () => { clearTimeout(watchdog); __synthPrimed = true; };
      speechSynthesis.speak(u);
    });
  } catch {
    __synthPrimed = true;
  }
}

// Prime on the first real user gesture
document.addEventListener('touchstart', primeSynth, { once: true, passive: true });
document.addEventListener('click',      primeSynth, { once: true });



/* -------------------- iOS Audio Unlock -------------------- */
function unlockAllAudio() {
  if (window.__audioUnlocked) return;
  console.log("🔊 Unlocking iOS audio...");

  try {
    // Unlock ttsAudio
    ttsAudio.src = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhACA";
    ttsAudio.volume = 0.01;
    ttsAudio.play().then(() => {
      ttsAudio.volume = 1.0;
      console.log("  ✅ ttsAudio unlocked");
    }).catch(() => {});

    // Unlock beppePlayer
    beppePlayer.src = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhACA";
    beppePlayer.volume = 0.01;
    beppePlayer.play().then(() => {
      beppePlayer.volume = 1.0;
      console.log("  ✅ beppePlayer unlocked");
    }).catch(() => {});

    // REMOVE the whole block that does beepEl.play() at 0.01 and transitionEl.play() at 0.01
    // REPLACE it with this:

    // Reset (do NOT play here)
    const beepEl = document.getElementById("beep-sound");
    if (beepEl) {
      beepEl.pause();
      beepEl.currentTime = 0;
      beepEl.volume = 1.0;
      beepEl.muted = false;
    }

    const transitionEl = document.getElementById("transition-sound");
    if (transitionEl) {
      transitionEl.pause();
      transitionEl.currentTime = 0;
      transitionEl.volume = 1.0;
      transitionEl.muted = false;
    }


    window.__audioUnlocked = true;
    console.log("✅ iOS audio unlock complete!");
  } catch (error) {
    console.error("❌ Audio unlock error:", error);
  }
}

document.addEventListener("touchstart", unlockAllAudio, { once: true, passive: true });
document.addEventListener("click", unlockAllAudio, { once: true });

/* Safe one-time unlock fallback */
document.addEventListener("touchend", ensureAudioUnlocked, { once: true });
document.addEventListener("click", () => {
  if (!window.__audioUnlocked) {
    beppePlayer.src = "data:audio/mp3;base64,//uQxAAAAAA==";
    beppePlayer.play().then(() => {
      window.__audioUnlocked = true;
      console.log("🔓 Audio sbloccato su iOS");
    }).catch(() => console.warn("⚠️ Impossibile sbloccare audio su iOS"));
  }
}, { once: true });

/* -------------------- Pre-Recorded (Beppe) + SFX -------------------- */
const beppeSounds = {
  s60: "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/mancano%2060%20secondi.mp3",
  s30: "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/mancano%2030%20secondi.mp3",
  countdown5: "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/count%20down%20pi%C3%B9%20veloce.MP3",
  prossimo: "https://github.com/tommyv-spec/workout-audio/raw/refs/heads/main/docs/Prossimo%20esercizio.MP3"
};

function convertGoogleDriveToDirect(link) { return link; }

function playBeppeAudio(url) {
  if (!url) return;
  beppePlayer.src = convertGoogleDriveToDirect(url);
  beppePlayer.play().catch((e) => console.warn("❌ Errore audio:", e));
}

async function playBeppeAudioSequence(urls) {
  for (const url of urls) {
    if (!url) continue;
    beppePlayer.src = convertGoogleDriveToDirect(url);
    await new Promise((resolve) => {
      beppePlayer.onended = resolve;
      beppePlayer.onerror = resolve;
      beppePlayer.play().catch(resolve);
    });
  }
}

function preloadAudio(urls) {
  urls.forEach(url => {
    const audio = new Audio();
    audio.src = convertGoogleDriveToDirect(url);
    audio.preload = "auto";
  });
}

function preloadWorkoutAudios() {
  const audioUrls = [];
  Object.values(workouts).forEach(workout => {
    (workout.exercises || []).forEach(ex => {
      if (ex.audio) audioUrls.push(ex.audio);
      if (ex.audioCambio) audioUrls.push(ex.audioCambio);
    });
  });
  preloadAudio(audioUrls);
}

function playBeep() {
  // Only care in Beep mode; do nothing otherwise (keeps modes separate)
  const mode = document.getElementById("soundMode")?.value
            || document.getElementById("soundMode-setup")?.value;
  if (mode !== "bip") return;

  const base = document.getElementById("beep-sound");
  if (!base || !base.src) return;

  // Stop any lingering playback on the base element
  try { base.pause(); base.currentTime = 0; } catch {}

  // Use a fresh element each time to avoid any residual quiet state
  const clone = new Audio(base.src);
  clone.preload = "auto";
  clone.playsInline = true;
  clone.setAttribute("playsinline", "");
  clone.setAttribute("webkit-playsinline", "");
  clone.volume = 1.0;
  clone.muted = false;
  // Important on some Android devices to avoid latency/ducking:
  clone.playbackRate = 1.0;

  // Fire and forget
  clone.play().catch(()=>{});
  // Cleanup when done
  clone.onended = () => { try { clone.src = ""; } catch {} };
  clone.onerror = () => { try { clone.src = ""; } catch {} };
}


function playTransition() {
  const transition = document.getElementById("transition-sound");
  if (transition) transition.play();
}

/* -------------------- Cloud TTS + Synth TTS -------------------- */
function detectLang(text) {
  const italianIndicators = /[àèéìòù]|mancano|secondi|esercizio|istruz|riposo|pausa/i;
  if (italianIndicators.test(text)) return "it-IT";
  return "en-US";
}

const GOOGLE_TTS_URL = "https://google-tts-server.onrender.com/speak";
const TTS_TIMEOUT_MS = 9000;
const TTS_RETRIES = 2;

async function ensureAudioUnlocked() {
  if (window.__audioUnlocked) return;
  let ctx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { window.__audioUnlocked = true; return; }
    ctx = new AC();
    if (ctx.state === "suspended") await ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, 22050);
    src.connect(ctx.destination);
    src.start(0);
    window.__audioUnlocked = true;
  } catch (e) {
    console.warn("Unable to unlock audio:", e);
  }
}

async function playAudioUrl(url) {
  let el = document.getElementById("tts-audio");
  if (!el) {
    el = new Audio();
    el.id = "tts-audio";
    el.preload = "auto";
    el.playsInline = true;
    el.setAttribute("playsinline", "");
    el.setAttribute("webkit-playsinline", "");
    el.autoplay = false;
    el.muted = false;
    el.crossOrigin = "anonymous";
    document.body.appendChild(el);
  }

  const isBlob = typeof url === "string" && url.startsWith("blob:");
  const src = isBlob ? url : url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();

  el.pause();
  el.src = src;
  el.currentTime = 0;
  el.load();

  try { await (window.__audioCtx?.resume?.() || Promise.resolve()); } catch (_) {}

  // ===== AMPLIFICAZIONE VOLUME CON WEB AUDIO API =====
  // Crea AudioContext se non esiste
  if (!window.__audioCtx) {
    window.__audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  // Crea o riusa MediaElementSource e GainNode
  if (!window.__ttsSource) {
    window.__ttsSource = window.__audioCtx.createMediaElementSource(el);
    window.__ttsGainNode = window.__audioCtx.createGain();
    
    // IMPOSTA IL VOLUME AMPLIFICATO QUI
    // 1.0 = volume normale
    // 2.0 = volume raddoppiato
    // 3.0 = volume triplicato
    window.__ttsGainNode.gain.value = 2.5; // ← AUMENTA QUESTO VALORE PER PIÙ VOLUME
    
    // Connetti: Audio Element → GainNode → Speakers
    window.__ttsSource.connect(window.__ttsGainNode);
    window.__ttsGainNode.connect(window.__audioCtx.destination);
    
    console.log("🔊 Audio amplification enabled with gain:", window.__ttsGainNode.gain.value);
  }
  
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      el.onended = null;
      el.onerror = null;
      if (isBlob) { try { URL.revokeObjectURL(url); } catch {} }
    };
    el.onended = () => { cleanup(); resolve(); };
    el.onerror = (e) => { cleanup(); reject(e); };
    const p = el.play();
    if (p && typeof p.then === "function") p.catch(reject);
  });
}

async function fetchTTS(text, lang) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);

  const res = await fetch(GOOGLE_TTS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, lang }),
    signal: controller.signal
  }).catch(e => { throw new Error("Failed to fetch TTS: " + e.message); });

  clearTimeout(timeoutId);

  if (!res.ok) throw new Error(`TTS ${res.status} ${res.statusText}`);

  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

async function tryGoogleTTS(text, lang) {
  let lastErr;
  for (let attempt = 0; attempt <= TTS_RETRIES; attempt++) {
    try {
      const audioUrl = await fetchTTS(text, lang);
      await playAudioUrl(audioUrl);
      return;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 350 * (attempt + 1)));
    }
  }
  throw lastErr;
}

async function speakCloud(text, lang = "it-IT") {
  try {
    await ensureAudioUnlocked();
    // Optional explicit voice mapping
    const voice = lang === "it-IT" ? "it-IT-Wavenet-C" : "en-US-Wavenet-D";
    
    console.log(`🗣️ Attempting Google Cloud TTS: "${text}" (${lang})`);
    
    const res = await fetch("https://google-tts-server.onrender.com/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang, voice }),
    });
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => "No error details");
      throw new Error(`TTS Server Error ${res.status}: ${errorText}`);
    }
    
    const blob = await res.blob();
    if (blob.size === 0) throw new Error("Audio vuoto - server returned empty audio");

    const audioUrl = URL.createObjectURL(blob);
    await playAudioUrl(audioUrl);
    
    console.log(`✅ Google Cloud TTS success`);
  } catch (err) {
    console.error("❌ Cloud TTS failed:", err.message || err);
    console.error("Full error:", err);
    throw err; // Re-throw so speak() can handle fallback
  }
}






async function webSpeechSpeak(text, lang) {
  // Make sure voices exist (Android may not fire onvoiceschanged)
  try {
    const t0 = Date.now();
    while (((speechSynthesis.getVoices?.()||[]).length === 0) && (Date.now() - t0 < 1500)) {
      await new Promise(r => setTimeout(r, 100));
    }
  } catch {}

  // Cancel pending + resume engine (Android often paused)
  try { speechSynthesis.cancel(); } catch {}
  try { speechSynthesis.resume(); } catch {}

  const voice = getPreferredVoice();
  const utter = new SpeechSynthesisUtterance(text);
  if (voice) utter.voice = voice;
  utter.lang   = (voice && voice.lang) || (lang || "it-IT");
  utter.rate   = 1.0;
  utter.pitch  = 1.0;
  utter.volume = 1.0; // Speech Synthesis già al massimo (non può superare 1.0)

  // Tiny delay helps some Android builds
  await new Promise(r => setTimeout(r, 60));

  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (ok, err) => { if (done) return; done = true; ok ? resolve() : reject(err||new Error("speak failed")); };

    const watchdog = setTimeout(() => finish(true), 3000); // some Androids never fire events

    utter.onstart = () => { try { clearTimeout(watchdog); } catch {} };
    utter.onend   = () => { try { clearTimeout(watchdog); } catch {}; finish(true); };
    utter.onerror = (e)  => { try { clearTimeout(watchdog); } catch {};
                              if (e && e.error === "interrupted") return finish(true);
                              finish(false, e); };

    try {
      // resume again right before talking
      try { speechSynthesis.resume(); } catch {}
      speechSynthesis.speak(utter);
    } catch (err) {
      try { clearTimeout(watchdog); } catch {}
      finish(false, err);
    }
  });
}







async function speakSynth(text, lang = "it-IT") {
  return webSpeechSpeak(text, lang);
}

/* Router: With automatic fallback from voice to synth */
async function speak(text, lang = "it-IT") {
  const mode = document.getElementById("soundMode")?.value
            || document.getElementById("soundMode-setup")?.value
            || "none";
  
  if (mode === "voice") {
    try {
      return await speakCloud(text, lang);
    } catch (err) {
      console.warn("⚠️ Voice mode failed, falling back to synth...");
      console.error("Voice error details:", err);
      // Automatic fallback to synth
      try {
        return await speakSynth(text, lang);
      } catch (synthErr) {
        console.error("❌ Synth fallback also failed:", synthErr);
      }
    }
  }
  
  if (mode === "synth") return speakSynth(text, lang);
  // other modes: no-op
}

/* Helper sequences */
async function speakSequence(segments) {
  for (const segment of segments) {
    await speak(segment.text, segment.lang);
  }
}

async function announceNextExerciseWith(speakerFn, nextExercise) {
  await speakerFn("prossimo esercizio:", "it-IT");
  await speakerFn(nextExercise.name, detectLang(nextExercise.name));
}

/* Back-compat alias */
async function announceNextExercise(nextExercise) {
  return announceNextExerciseWith(speak, nextExercise);
}

/* -------------------- Workout Sequencing -------------------- */
let fullWorkoutSequence = [];

function buildFullWorkoutSequence(workout, includeWarmup = true) {
  const sequence = [];
  if (!workout || !Array.isArray(workout.exercises) || workout.exercises.length === 0) {
    console.error("❌ No valid workout data");
    return sequence;
  }

  const isBlockMarker = (ex) => {
    const nameLower = (ex.name || "").toLowerCase();
    const blockLower = (ex.block || "").toLowerCase();
    return nameLower.includes("blocco") || nameLower.includes("block") ||
           nameLower === blockLower || (ex.duration || 0) <= 5;
  };

  if (includeWarmup) {
    const uniqueExercises = [];
    const seenNames = new Set();

    workout.exercises.forEach(ex => {
      if (ex.block && !seenNames.has(ex.name) && !isBlockMarker(ex)) {
        seenNames.add(ex.name);
        uniqueExercises.push(ex);
      }
    });

    if (uniqueExercises.length > 0) {
      sequence.push({
        name: "Riscaldamento",
        duration: 5,
        imageUrl: "https://lh3.googleusercontent.com/d/1Ee4DY-EGnTI9YPrIB0wj6v8pX7KW8Hpt",
        isLabel: true
      });

      uniqueExercises.forEach(ex => {
        const warmupDuration = ex.practiceDuration || ex.duration || 20;
        sequence.push({
          name: ex.name,
          duration: warmupDuration,
          imageUrl: ex.imageUrl,
          reps: ex.reps,
          block: ex.block,
          tipoDiPeso: ex.tipoDiPeso,
          audio: ex.audio,
          audioCambio: ex.audioCambio,
          isWarmup: true,
          blockNumber: null,
          totalBlocks: null,
          roundNumber: null,
          totalRounds: null,
          exerciseNumber: null,
          totalExercises: null
        });
      });

      sequence.push({
        name: "Are you ready?",
        duration: 15,
        imageUrl: "https://lh3.googleusercontent.com/d/1FS2HKfaJ6MIfpyzJirU6dWQ7K-5kbC9j",
        isLabel: true
      });
    }
  }

  const blockGroups = {};
  workout.exercises.forEach(ex => {
    if (ex.block && !isBlockMarker(ex)) {
      if (!blockGroups[ex.block]) blockGroups[ex.block] = [];
      blockGroups[ex.block].push(ex);
    }
  });

  const blockNames = Object.keys(blockGroups);
  const totalBlocks = blockNames.length;
  let blockNumber = 0;

  blockNames.forEach(blockName => {
    const exercises = blockGroups[blockName];
    if (exercises.length === 0) return;
    blockNumber++;
    const rounds = exercises[0]?.rounds || 1;

    for (let round = 0; round < rounds; round++) {
      let exerciseNumber = 0;
      exercises.forEach(ex => {
        exerciseNumber++;
        const exDuration = ex.duration || 30;
        sequence.push({
          name: ex.name,
          duration: exDuration,
          imageUrl: ex.imageUrl,
          reps: ex.reps,
          block: ex.block,
          tipoDiPeso: ex.tipoDiPeso,
          audio: ex.audio,
          audioCambio: ex.audioCambio,
          isWarmup: false,
          blockNumber: blockNumber,
          totalBlocks: totalBlocks,
          roundNumber: round + 1,
          totalRounds: rounds,
          exerciseNumber: exerciseNumber,
          totalExercises: exercises.length
        });
      });
    }

    // --- REST 60s tra blocchi ---
    if (blockNumber < totalBlocks) {
      sequence.push({
        name: "REST",
        duration: 60,
        imageUrl: convertGoogleDriveToDirect("https://lh3.googleusercontent.com/d/1bibXbdrcXdh3vgNHp2Teby3ClS3VqZmb"),
        isLabel: true
      });
    }
  });

  sequence.push({
    name: "Good Job",
    duration: 20,
    imageUrl: "https://lh3.googleusercontent.com/d/1Vs1-VgiJi8rTbssSj-2ThcyDraRoTE2g",
    isLabel: true
  });

  return sequence;
}

function updateProgressBar() {
  if (!fullWorkoutSequence || fullWorkoutSequence.length === 0) return;
  const currentExercise = fullWorkoutSequence[currentStep];
  if (!currentExercise) return;

  const totalSteps = fullWorkoutSequence.length;
  const progressPercent = Math.round(((currentStep + 1) / totalSteps) * 100);

  const progressFill = document.getElementById("progress-fill");
  const progressPercentage = document.getElementById("progress-percentage");
  if (progressFill) progressFill.style.width = progressPercent + "%";
  if (progressPercentage) progressPercentage.textContent = progressPercent + "%";

  const progressBlock = document.getElementById("progress-block");
  const progressRound = document.getElementById("progress-round");
  const progressExercise = document.getElementById("progress-exercise");

  if (currentExercise.isWarmup) {
    if (progressBlock) progressBlock.textContent = "Warm-up";
    if (progressRound) progressRound.textContent = "";
    if (progressExercise) progressExercise.textContent = "";
  } else if (currentExercise.isLabel) {
    if (progressBlock) progressBlock.textContent = currentExercise.name;
    if (progressRound) progressRound.textContent = "";
    if (progressExercise) progressExercise.textContent = "";
  } else {
    if (progressBlock && currentExercise.blockNumber) {
      progressBlock.textContent = `Block ${currentExercise.blockNumber}/${currentExercise.totalBlocks}`;
    }
    if (progressRound && currentExercise.roundNumber) {
      progressRound.textContent = `Round ${currentExercise.roundNumber}/${currentExercise.totalRounds}`;
    }
    if (progressExercise && currentExercise.exerciseNumber) {
      progressExercise.textContent = `Exercise ${currentExercise.exerciseNumber}/${currentExercise.totalExercises}`;
    }
  }
}

/* -------------------- Session Controls -------------------- */
function exitWorkout() {
  if (interval) { clearInterval(interval); interval = null; }
  isPaused = false;
  savedTimeLeft = null;
  currentStep = 0;

  // Release wake lock - allow screen to turn off
  releaseWakeLock();

  const settingsPopup = document.getElementById("settings-popup");
  if (settingsPopup) settingsPopup.style.display = "none";

  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.width = "";
  document.body.style.height = "";

  // Remove class to show header again
  document.body.classList.remove('workout-active');

  const header = document.querySelector("header");
  const setup = document.getElementById("setup-screen");
  const startBtn = document.getElementById("start-button-bottom");
  const exerciseContainer = document.getElementById("exercise-container");
  const topbarSelect = document.getElementById("topbar-select");
  const setupGear = document.getElementById("setup-settings-button");
  const bottomButtonsContainer = document.getElementById("bottom-buttons-container");

  if (exerciseContainer) exerciseContainer.style.display = "none";
  if (header) header.style.display = "";
  if (setup) setup.style.display = "";
  if (startBtn) startBtn.style.display = "";
  if (bottomButtonsContainer) bottomButtonsContainer.style.display = "";
  if (topbarSelect) topbarSelect.style.display = "block";
  if (setupGear) setupGear.style.display = "block";
}

function startWorkout() {
  if (!selectedWorkout || !Array.isArray(selectedWorkout.exercises) || selectedWorkout.exercises.length === 0) {
    alert("Nessun workout valido selezionato.");
    return;
  }

  const warmupEnabled = document.getElementById("warmup-toggle")?.checked ?? true;
  fullWorkoutSequence = buildFullWorkoutSequence(selectedWorkout, warmupEnabled);
  if (fullWorkoutSequence.length === 0) {
    alert("Impossibile costruire la sequenza di allenamento.");
    return;
  }

  const setup = document.getElementById("setup-screen");
  const header = document.querySelector("header");
  const startBtn = document.getElementById("start-button-bottom");
  const exerciseContainer = document.getElementById("exercise-container");
  const bottomButtonsContainer = document.getElementById("bottom-buttons-container");
  const topbarSelect = document.getElementById("topbar-select");
  const setupGear = document.getElementById("setup-settings-button");

  if (topbarSelect) topbarSelect.style.display = "none";
  if (setupGear) setupGear.style.display = "none";

  const previewMaybe = document.getElementById("workout-preview");
  if (previewMaybe) previewMaybe.style.display = "none";

  if (setup) setup.style.display = "none";
  if (header) header.style.display = "none";
  if (startBtn) startBtn.style.display = "none";
  if (bottomButtonsContainer) bottomButtonsContainer.style.display = "none";
  if (exerciseContainer) exerciseContainer.style.display = "flex";

  document.body.style.overflow = "hidden";
  document.body.style.position = "fixed";
  document.body.style.width = "100%";
  document.body.style.height = "100%";

  // Add class to hide header during workout
  document.body.classList.add('workout-active');

  // Keep screen on during workout
  requestWakeLock();

  let startIndex = 0;
  const phaseSelect = document.getElementById("start-phase-select");
  const roundSelect = document.getElementById("start-round-select");
  const exerciseSelect = document.getElementById("start-exercise-select");

  if (phaseSelect && phaseSelect.value !== "0") {
    if (exerciseSelect?.value && exerciseSelect.value !== "") {
      startIndex = parseInt(exerciseSelect.value);
      console.log(`🎯 Starting from specific exercise: index ${startIndex}`);
    } else if (roundSelect?.value && roundSelect.value !== "") {
      startIndex = parseInt(roundSelect.value);
      console.log(`🎯 Starting from Round: index ${startIndex}`);
    } else {
      startIndex = parseInt(phaseSelect.value);
      console.log(`🎯 Starting from block start: index ${startIndex}`);
    }
  }

  currentStep = startIndex;
  savedTimeLeft = null;
  playExercise(currentStep, fullWorkoutSequence);

  const setupMode = document.getElementById("soundMode-setup");
  const liveMode = document.getElementById("soundMode");
  if (setupMode && liveMode) liveMode.value = setupMode.value;
}

async function playExercise(index, exercises, resumeTime = null) {
  // reset the 10s preview trigger for this exercise
  nextPreviewShown = false;

  if (index >= exercises.length) {
    document.getElementById("exercise-name").textContent = "Workout completato!";
    document.getElementById("exercise-gif").src = "";
    document.getElementById("timer").textContent = "";
    const nextPrev = document.getElementById("next-exercise-preview");
    if (nextPrev) nextPrev.style.display = "none";

    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.style.width = "";
    document.body.style.height = "";

    // Remove class to show header again
    document.body.classList.remove('workout-active');

    const header = document.querySelector("header");
    const setup = document.getElementById("setup-screen");
    const startBtn = document.getElementById("start-button-bottom");
    const exerciseContainer = document.getElementById("exercise-container");
    const topbarSelect = document.getElementById("topbar-select");
    const setupGear = document.getElementById("setup-settings-button");

    if (exerciseContainer) exerciseContainer.style.display = "none";
    if (header) header.style.display = "";
    if (setup) setup.style.display = "";
    if (startBtn) startBtn.style.display = "";
    if (topbarSelect) topbarSelect.style.display = "block";
    if (setupGear) setupGear.style.display = "block";
    return;
  }

  const exercise = exercises[index];
  const nextExercise = exercises[index + 1];

  const hasReps = exercise.reps && !exercise.name.toLowerCase().includes("istruz");
  const hasEquipment = exercise.tipoDiPeso && !exercise.name.toLowerCase().includes("istruz") && !exercise.isLabel;

  let infoText = "";
  if (hasReps && hasEquipment) infoText = `${exercise.reps} reps | ${exercise.tipoDiPeso}`;
  else if (hasReps)           infoText = `${exercise.reps} reps`;
  else if (hasEquipment)      infoText = exercise.tipoDiPeso;

  const currentInfo = infoText
    ? `<div style="font-size:16px;font-weight:600;margin-top:8px;color:#B0B0B0;">${infoText}</div>`
    : "";

  // --- CURRENT EXERCISE DISPLAY ---
  const hasDuration = exercise.duration && !exercise.isLabel;

  const parts = [];
  if (hasEquipment) parts.push(exercise.tipoDiPeso);
  if (hasReps) parts.push(`${exercise.reps} REPS`);
  if (hasDuration) parts.push(`${exercise.duration}S`);



  // --- 10-SECOND PREVIEW DISPLAY ---
  const hasNextReps = nextExercise.reps && !nextExercise.name.toLowerCase().includes("istruz");
  const hasNextEquipment = nextExercise.tipoDiPeso && !nextExercise.name.toLowerCase().includes("istruz") && !nextExercise.isLabel;
  const hasNextDuration = nextExercise.duration && !nextExercise.isLabel;

  const partsNext = [];
  if (hasNextEquipment) partsNext.push(nextExercise.tipoDiPeso);
  if (hasNextReps) partsNext.push(`${nextExercise.reps} REPS`);
  if (hasNextDuration) partsNext.push(`${nextExercise.duration}S`);
  const infoNext = partsNext.join(" | ");

  document.getElementById("exercise-name").innerHTML = `
    <div style="font-size:22px;font-weight:800;letter-spacing:.5px;">${exercise.name}</div>
    <div style="font-size:15px;font-weight:600;color:#B0B0B0;margin-top:4px;">${infoText}</div>
  `;


  document.getElementById("exercise-gif").src = exercise.imageUrl;
  const nextPrev = document.getElementById("next-exercise-preview");
  if (nextPrev) nextPrev.style.display = "none";

  const timerEl = document.getElementById("timer");
  const gifEl = document.getElementById("exercise-gif");
  const exerciseNameBar = document.getElementById("exercise-name");
  timerEl.classList.remove("warning-10", "warning-6", "warning-3");
  gifEl.classList.remove("gif-glow");
  exerciseNameBar.classList.remove("next-preview-active");

  const duration = resumeTime !== null ? resumeTime : savedTimeLeft ?? parseInt(exercise.duration);
  savedTimeLeft = null;

  timerEl.textContent = duration;
  updateProgressBar();

  const mode = document.getElementById("soundMode").value;

  // start the countdown immediately
  startExerciseTimer(duration, exercise, nextExercise);

  // say the exercise name without blocking the timer
  // Use speak() which has automatic fallback
  if (mode !== "none" && mode !== "bip") {
    const guard = new Promise(res => setTimeout(res, 2500));
    Promise.race([
      speak(exercise.name, detectLang(exercise.name)),
      guard
    ]).catch(err => {
      console.warn("⚠️ Failed to announce exercise name:", err);
    });
  }

}

function resumeTimer() {
  clearInterval(interval);

  // if we didn't capture on pause, read what's on screen
  if (savedTimeLeft == null || savedTimeLeft <= 0) {
    const onScreen = parseInt(document.getElementById("timer").textContent, 10);
    savedTimeLeft = Number.isFinite(onScreen) ? onScreen : 0;
  }

  const currentExercise = fullWorkoutSequence[currentStep];
  const nextExercise = fullWorkoutSequence[currentStep + 1];

  isPaused = false;
  startExerciseTimer(savedTimeLeft, currentExercise, nextExercise);
}


async function startExerciseTimer(initialSeconds, exercise, nextExercise) {
  clearInterval(interval);

  const timerEl = document.getElementById("timer");
  const gifEl = document.getElementById("exercise-gif");
  const exerciseNameBar = document.getElementById("exercise-name");

  // show immediately
  timerEl.textContent = Math.max(0, Math.ceil(initialSeconds));

  // set an absolute end time to avoid drift & off-by-one
  const endAt = Date.now() + (initialSeconds * 1000);

  // helper so pause stores the same value we display
  const getRemaining = () => Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
  let lastSecond = -1; // 🔒 run second-based actions once per displayed second

  // 🔒 dedupe: ricorda i secondi già gestiti in QUESTO esercizio
  const fired = new Set();

  interval = setInterval(async () => {
    // Esegui una sola volta quando il timer mostra esattamente "sec"
    function once(sec, cb) {
      if (remaining === sec && !fired.has(sec)) {
        fired.add(sec);
        try { cb(); } catch (e) { console.warn('once('+sec+') error:', e); }
      }
    }

    // paused? save & stop the ticking loop
    if (isPaused) {
      savedTimeLeft = getRemaining();
      clearInterval(interval);
      return;
    }

    const remaining = getRemaining();
    timerEl.textContent = remaining;

    // read mode (kept separate)
    const mode = document.getElementById("soundMode").value;
    const useBip = mode === "bip";

    // milestones & UI cues — run once per displayed second
    if (remaining !== lastSecond) {
      lastSecond = remaining;

      once(60, () => {
        if (mode === "voice" || mode === "synth") {
          speak("mancano sessanta secondi", "it-IT").catch(() => {});
        }
        if (mode === "beppe") playBeppeAudio(beppeSounds.s60);
      });

      once(30, () => {
        if (mode === "voice" || mode === "synth") {
          speak("mancano trenta secondi", "it-IT").catch(() => {});
        }
        if (mode === "beppe") playBeppeAudio(beppeSounds.s30);
      });

      // 10s preview (fire once per exercise)
      once(10, async () => {
        if (!nextPreviewShown) {
          nextPreviewShown = true;

        timerEl.classList.add("warning-10");
        gifEl.classList.add("gif-glow");
        exerciseNameBar.classList.add("next-preview-active");

        if (nextExercise) {
          const nxHasReps = nextExercise.reps && !nextExercise.name.toLowerCase().includes("istruz");
          const nxHasEqp  = nextExercise.tipoDiPeso && !nextExercise.name.toLowerCase().includes("istruz") && !nextExercise.isLabel;
          const nxHasDur  = nextExercise.duration && !nextExercise.isLabel;

          const nxParts = [];
          if (nxHasEqp) nxParts.push(nextExercise.tipoDiPeso);
          if (nxHasReps) nxParts.push(`${nextExercise.reps} REPS`);
          if (nxHasDur) nxParts.push(`${nextExercise.duration}S`);
          const nxInfo = nxParts.join(" | ");

          // swap preview UI
          document.getElementById("exercise-name").innerHTML = `
            <div style="font-size:14px;opacity:.8;margin-bottom:4px;">PROSSIMO ESERCIZIO:</div>
            <div style="font-size:22px;font-weight:800;letter-spacing:.5px;">${nextExercise.name}</div>
            <div style="font-size:15px;font-weight:600;margin-top:4px;">${nxInfo}</div>
          `;
          document.getElementById("exercise-gif").src = nextExercise.imageUrl;

          // preview voice strictly per mode
          if (mode === "beppe") {
            const urls = [beppeSounds.prossimo];
            if (nextExercise.audio) urls.push(nextExercise.audio);
            playBeppeAudioSequence(urls);
          } else if (mode === "voice" || mode === "synth") {
            // Use speak() with automatic fallback
            try {
              await speak("prossimo esercizio:", "it-IT");
              await speak(nextExercise.name, detectLang(nextExercise.name));
            } catch (err) {
              console.warn("⚠️ Failed to announce next exercise:", err);
            }
          }
        }

        if (useBip) playBeep();
        }
      });

      // color changes
      once(6, () => {
        timerEl.classList.remove("warning-10");
        timerEl.classList.add("warning-6");
      });

      once(3, () => {
        timerEl.classList.remove("warning-6");
        timerEl.classList.add("warning-3");
      });

      // 5s countdown — runs once (no more stutter)
      once(5, () => {
        if (mode === "voice" || mode === "synth") {
          speak("cinque, quattro, tre, due, uno", "it-IT").catch(() => {});
        }
        if (mode === "beppe") playBeppeAudio(beppeSounds.countdown5);
      });
    }


    // done → next
    if (remaining <= 0) {
      clearInterval(interval);

      // cleanup visuals
      timerEl.classList.remove("warning-10", "warning-6", "warning-3");
      gifEl.classList.remove("gif-glow");
      exerciseNameBar.classList.remove("next-preview-active");

      currentStep++;
      const upcoming = fullWorkoutSequence[currentStep];

      // change cue
      if (mode === "beppe") {
        const seq = [];
        if (upcoming?.audioCambio) seq.push(upcoming.audioCambio);
        if (seq.length) playBeppeAudioSequence(seq);
      }
      if (useBip) playTransition();

      document.getElementById("next-exercise-preview").style.display = "none";
      savedTimeLeft = null;

      setTimeout(() => playExercise(currentStep, fullWorkoutSequence), 300);
    }
  }, 200); // 5× per second → smooth and exact
}


/* -------------------- UI / App Wiring -------------------- */
function login() {
  warmUpServer();
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const errorBox = document.getElementById("login-error");

  if (!username || !password) {
    if (errorBox) {
      errorBox.textContent = "Inserisci username e password.";
      errorBox.style.display = "block";
    }
    return;
  }

  fetch(`https://script.google.com/macros/s/AKfycbwIEsJrVqJuRRkwmdw6JkL9luPHJYv1fKhEcyl18uz71G1pRkoVoqPSrXrrWFaSVvAR/exec?username=${username}&password=${password}`)
    .then(res => res.json())
    .then(data => {
      if (data.status === "success") {
        localStorage.setItem("loggedUser", username);
        
        // Hide login UI (works for both index.html and other pages)
        const loginScreen = document.getElementById("login-screen");
        const loginModal = document.getElementById("login-modal");
        const mainApp = document.getElementById("main-app");
        const trainingSelector = document.getElementById("training-selector");
        const headerLoginBtn = document.getElementById("header-login-btn");
        const headerDashboardBtn = document.getElementById("header-dashboard-btn");
        
        if (loginScreen) loginScreen.style.display = "none";
        if (loginModal) loginModal.classList.remove("active");
        if (mainApp) mainApp.style.display = "block";
        if (trainingSelector) trainingSelector.style.display = "block";
        
        // Switch header buttons: hide login, show dashboard
        if (headerLoginBtn) headerLoginBtn.style.display = "none";
        if (headerDashboardBtn) headerDashboardBtn.style.display = "flex";
        
        loadUserData(username);
      } else {
        if (errorBox) {
          errorBox.textContent = data.message;
          errorBox.style.display = "block";
        }
      }
    })
    .catch(err => {
      console.error("Login error", err);
      if (errorBox) {
        errorBox.textContent = "Errore durante il login.";
        errorBox.style.display = "block";
      }
    });
}

function logout() {
  localStorage.removeItem("loggedUser");
  // Use setTimeout to ensure localStorage is cleared before redirect
  setTimeout(() => {
    window.location.href = "index.html";
  }, 100);
}

function loadUserData(username) {
  console.log(`📥 Loading data for user: ${username}`);
  
  fetch("https://script.google.com/macros/s/AKfycbwIEsJrVqJuRRkwmdw6JkL9luPHJYv1fKhEcyl18uz71G1pRkoVoqPSrXrrWFaSVvAR/exec")
    .then(res => {
      console.log(`✅ Fetch response received. Status: ${res.status}`);
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      return res.json();
    })
    .then(data => {
      console.log("📦 Data received:", data);
      workouts = data.workouts;
      console.log(`💪 Total workouts available: ${Object.keys(workouts || {}).length}`);
      
      // ✅ UPDATED: Handle new userWorkouts structure with scadenza and workouts array
      const userData = data.userWorkouts[username] || { scadenza: "", workouts: [] };
      const userWorkouts = userData.workouts || [];
      const scadenza = userData.scadenza || "";
      
      console.log(`👤 User workouts for ${username}:`, userWorkouts);
      console.log(`📅 Scadenza: ${scadenza || "N/A"}`);
      
      // Optional: Log scadenza for debugging or future use
      if (scadenza) {
        console.log(`User ${username} scadenza: ${scadenza}`);
      }
      
      const select = document.getElementById("workoutSelect");
      if (!select) {
        console.error("❌ workoutSelect element not found!");
        return;
      }
      
      console.log("🔄 Populating workout selector...");
      select.innerHTML = "";

      userWorkouts.forEach((name, i) => {
        const option = document.createElement("option");
        option.value = name;                  // keep internal key (A1, A2, …)
        option.dataset.realName = name;       // keep original if you ever need it
        option.textContent = `Sesh ${i + 1}`;  // what the user sees (sesh1, sesh2, …)
        select.appendChild(option);
        console.log(`  ➕ Added workout: ${name} (Sesh ${i + 1})`);
      });

      console.log(`✅ Populated ${select.options.length} workouts in selector`);

      if (select.options.length > 0) {
        select.selectedIndex = 0;
        selectedWorkout = workouts[select.value];
        console.log(`🎯 Selected workout:`, selectedWorkout?.name || select.value);
        
        const __topStart2 = document.getElementById("start-button"); 
        if (__topStart2) __topStart2.disabled = false;
        const __bottomStart2 = document.getElementById("start-button-bottom"); 
        if (__bottomStart2) __bottomStart2.disabled = false;
        
        updateWorkoutPreview();
      } else {
        console.warn("⚠️ No workouts found for user");
      }

      select.addEventListener("change", () => {
        selectedWorkout = workouts[select.value] || {};
        console.log(`🔄 Workout changed to: ${select.value}`);
        updateWorkoutPreview();
      });
    })
    .catch(error => {
      console.error("❌ Error loading user data:", error);
      console.error("Error details:", error.message);
      alert(`Failed to load workout data: ${error.message}\n\nPlease check your internet connection and try refreshing the page.`);
    });
}

function updateWorkoutPreview() {
  const preview = document.getElementById("workout-preview");
  const previewTitle = document.getElementById("workout-preview-title");
  const list = document.getElementById("exercise-list");
  const visuals = document.getElementById("exercise-visuals");
  const instructionsSection = document.getElementById("instructions-section");
  const instructionsText = document.getElementById("instructions-text");
  const instructionsImage = document.getElementById("instructions-image");
  const materialeSection = document.getElementById("materiale-section");
  const materialeList = document.getElementById("materiale-list");

  if (list) list.innerHTML = "";
  const __grid = document.getElementById("exercise-grid"); if (__grid) __grid.innerHTML = "";
  if (materialeList) materialeList.innerHTML = "";

  const workout = selectedWorkout;
  if (!workout || !workout.exercises?.length) {
    if (preview) preview.style.display = "none";
    if (previewTitle) previewTitle.style.display = "none";
    if (visuals) visuals.style.display = "none";
    if (instructionsSection) instructionsSection.style.display = "none";
    if (materialeSection) materialeSection.style.display = "none";
    return;
  }

  if (instructionsSection) instructionsSection.style.display = "block";
  
  // Default image if instructions are empty
  const defaultInstructionsImage = "https://drive.google.com/thumbnail?id=1z6cFnovuxN6SL5DWYaa8RdE3TA4dd0R6&sz=w1000";

  // Helper function to detect if string is a URL
  function isImageUrl(str) {
    if (!str) return false;
    const trimmed = str.trim();
    // Check if it starts with http:// or https://
    return trimmed.startsWith('http://') || trimmed.startsWith('https://');
  }

  // Helper function to convert Google Drive sharing links to direct image links
  function convertGoogleDriveUrl(url) {
    // Handle Google Drive sharing URLs: https://drive.google.com/file/d/FILE_ID/view?usp=sharing
    const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch && driveMatch[1]) {
      return `https://drive.google.com/thumbnail?id=${driveMatch[1]}&sz=w1000`;
    }
    // If already a direct link or different format, return as-is
    return url;
  }

  // Process instructions: can be text, image URL, or empty
  if (workout.instructions && workout.instructions.trim()) {
    const instructions = workout.instructions.trim();
    
    if (isImageUrl(instructions)) {
      // It's an image URL - display as image
      const imageUrl = convertGoogleDriveUrl(instructions);
      if (instructionsImage) {
        instructionsImage.src = imageUrl;
        instructionsImage.style.display = "block";
      }
      if (instructionsText) instructionsText.style.display = "none";
    } else {
      // It's text - display as text
      if (instructionsText) {
        instructionsText.textContent = instructions;
        instructionsText.style.display = "block";
      }
      if (instructionsImage) instructionsImage.style.display = "none";
    }
  } else {
    // Empty - use default image
    if (instructionsImage) {
      instructionsImage.src = defaultInstructionsImage;
      instructionsImage.style.display = "block";
    }
    if (instructionsText) instructionsText.style.display = "none";
  }

  // === HANDLE MATERIALE (Consolidated equipment: prefer 2 DB/KB over 1) ===
  function consolidateMateriale(exercises) {
    const bestByKey = new Map(); // key = `${GEAR}|${LEVEL}`
    const otherSet = new Set();  // non-DB/KB strings kept unique

    const normSpaces = s => (s || "").toUpperCase().replace(/\s+/g, " ").trim();
    const normalizeLevel = (raw) => {
      let t = normSpaces(raw);
      // unify singular→plural
      t = t
        .replace(/\bMEDIO\b/g, "MEDI")
        .replace(/\bMEDIA\b/g, "MEDI")
        .replace(/\bLEGGERO\b/g, "LEGGERI")
        .replace(/\bLEGGERA\b/g, "LEGGERI")
        .replace(/\bPESANTE\b/g, "PESANTI");
      return t;
    };

    for (const ex of (exercises || [])) {
      const tp = (ex.tipoDiPeso || "").trim();
      if (!tp) continue;

      // match "1 DB MEDIO", "2 KB PESANTI", etc.
      const m = tp.match(/^\s*(\d+)\s*(DB|KB)\b\s*(.*)$/i);
      if (m) {
        const count = parseInt(m[1], 10) || 0;
        const gear  = m[2].toUpperCase();         // DB or KB
        const level = normalizeLevel(m[3] || ""); // MEDI, PESANTI, LEGGERI, etc.
        const key = `${gear}|${level}`;
        const prev = bestByKey.get(key);
        if (!prev || count > prev.count) bestByKey.set(key, { count, gear, level });
      } else {
        // non-DB/KB items: keep unique as-is (uppercased for dedupe)
        otherSet.add(normSpaces(tp));
      }
    }

    const consolidated = [];
    for (const { count, gear, level } of bestByKey.values()) {
      consolidated.push(`${count} ${gear} ${level}`);
    }
    for (const item of otherSet) consolidated.push(item);
    return consolidated;
  }

  const materiale = consolidateMateriale(workout.exercises);

  if (materiale.length > 0) {
    if (materialeSection) materialeSection.style.display = "block";
    materiale.forEach(item => {
      const materialeItem = document.createElement("div");
      materialeItem.className = "materiale-item";
      materialeItem.textContent = item;
      materialeList.appendChild(materialeItem);
    });
  } else {
    if (materialeSection) materialeSection.style.display = "none";
  }


  const sections = { blocco1: [], blocco2: [], blocco3: [] };
  workout.exercises.forEach(ex => {
    if (ex.block) {
      const blockLower = ex.block.toLowerCase();
      if (blockLower.includes('block 1') || blockLower.includes('blocco 1')) sections.blocco1.push(ex);
      else if (blockLower.includes('block 2') || blockLower.includes('blocco 2')) sections.blocco2.push(ex);
      else if (blockLower.includes('block 3') || blockLower.includes('blocco 3')) sections.blocco3.push(ex);
    }
  });

  const grid = document.getElementById("exercise-grid");
  const sectionConfigs = [
    { key: 'blocco1', title: 'BLOCCO 1', color: '#7D7D7D', icon: '' },
    { key: 'blocco2', title: 'BLOCCO 2', color: '#7D7D7D', icon: '' },
    { key: 'blocco3', title: 'BLOCCO 3', color: '#7D7D7D', icon: '' }
  ];

  sectionConfigs.forEach(config => {
    const exercises = sections[config.key];
    if (exercises.length === 0) return;

    const uniqueExercises = [];
    const seen = new Set();
    exercises.forEach(ex => {
      if (!seen.has(ex.name)) { seen.add(ex.name); uniqueExercises.push(ex); }
    });

    const rounds = exercises[0]?.rounds || 0;

    const section = document.createElement('div');
    section.className = 'workout-section';

    const header = document.createElement('div');
    header.className = 'section-header';
    header.style.background = `linear-gradient(135deg, ${config.color}, ${config.color}dd)`;
    header.innerHTML = `
      <span class="section-icon">${config.icon}</span>
      <span class="section-title">${config.title}</span>
      <span class="section-count">${uniqueExercises.length} es. | ${rounds} round</span>
    `;
    section.appendChild(header);

    const cardsGrid = document.createElement('div');
    cardsGrid.className = 'section-cards-grid';

    uniqueExercises.forEach(ex => {
      const card = document.createElement("div");
      card.className = "exercise-card";

      const img = document.createElement("img");
      img.src = ex.imageUrl;
      img.alt = ex.name;

      const name = document.createElement("div");
      name.textContent = ex.name;
      name.className = "exercise-name";

      const details = document.createElement("div");
      details.className = "exercise-details";

      // DURATION (if exists)
      if (ex.duration || ex.reps) {
        const durationDiv = document.createElement("div");
        durationDiv.className = "exercise-info-item";
        const timeValue = ex.reps || (ex.duration ? `${ex.duration}s` : '');
        durationDiv.textContent = timeValue;
        details.appendChild(durationDiv);
      }

      // WEIGHT/EQUIPMENT (if exists)
      if (ex.tipoDiPeso) {
        const equipmentDiv = document.createElement("div");
        equipmentDiv.className = "exercise-info-item";
        equipmentDiv.textContent = ex.tipoDiPeso;
        details.appendChild(equipmentDiv);
      }

      card.appendChild(img);
      card.appendChild(name);
      card.appendChild(details);
      cardsGrid.appendChild(card);
    });

    section.appendChild(cardsGrid);
    if (grid) grid.appendChild(section);
  });

  if (preview) preview.style.display = "block";
  if (previewTitle) previewTitle.style.display = "block";
  if (visuals) visuals.style.display = "block";

  buildStartPointSelector();
}

function buildStartPointSelector() {
  const selector = document.getElementById("start-point-selector");
  const phaseSelect = document.getElementById("start-phase-select");
  const roundContainer = document.getElementById("start-round-container");
  const roundSelect = document.getElementById("start-round-select");
  const exerciseContainer = document.getElementById("start-exercise-container");
  const exerciseSelect = document.getElementById("start-exercise-select");

  if (!selector || !phaseSelect || !selectedWorkout) return;
  selector.style.display = "block";

  const warmupEnabled = document.getElementById("warmup-toggle")?.checked ?? true;
  const tempSequence = buildFullWorkoutSequence(selectedWorkout, warmupEnabled);
  if (tempSequence.length === 0) return;

  phaseSelect.innerHTML = '<option value="0">Inizio workout (con riscaldamento)</option>';
  roundSelect.innerHTML = '';
  exerciseSelect.innerHTML = '';

  const mainWorkoutExercises = tempSequence.filter(ex =>
    !ex.isWarmup && ex.block && !ex.isLabel
  );
  if (mainWorkoutExercises.length === 0) return;

  const blocks = [];
  let currentBlock = null;
  let blockStartIndex = -1;
  const exerciseSeenInCurrentBlock = new Map();

  mainWorkoutExercises.forEach((ex, relativeIndex) => {
    const originalIndex = tempSequence.indexOf(ex);

    if (ex.block !== currentBlock) {
      currentBlock = ex.block;
      blockStartIndex = relativeIndex;
      exerciseSeenInCurrentBlock.clear();

      blocks.push({
        name: ex.block,
        index: originalIndex,
        startRelativeIndex: relativeIndex,
        rounds: [],
        uniqueExercises: []
      });
    }

    const block = blocks[blocks.length - 1];
    if (!block.uniqueExercises.includes(ex.name)) {
      block.uniqueExercises.push(ex.name);
    }

    const firstOccurrenceIndex = exerciseSeenInCurrentBlock.get(ex.name);
    if (firstOccurrenceIndex === undefined) {
      exerciseSeenInCurrentBlock.set(ex.name, relativeIndex);
      let round = block.rounds.find(r => r.number === 1);
      if (!round) {
        round = { number: 1, firstExerciseIndex: originalIndex, exercises: [] };
        block.rounds.push(round);
      }
      round.exercises.push({ name: ex.name, index: originalIndex });
    } else {
      const positionInBlock = relativeIndex - blockStartIndex;
      const uniqueCount = block.uniqueExercises.length;
      const roundNumber = Math.floor(positionInBlock / uniqueCount) + 1;

      let round = block.rounds.find(r => r.number === roundNumber);
      if (!round) {
        round = { number: roundNumber, firstExerciseIndex: originalIndex, exercises: [] };
        block.rounds.push(round);
      }
      round.exercises.push({ name: ex.name, index: originalIndex });
    }
  });

  blocks.forEach((block, idx) => {
    const option = document.createElement('option');
    option.value = block.index;              // keep internal A1, A2, etc.
    option.dataset.realName = block.name;    // store the original
    option.textContent = `Blocco ${idx + 1}`;   // display block number
    phaseSelect.appendChild(option);
  });


  const newPhaseSelect = phaseSelect.cloneNode(true);
  phaseSelect.parentNode.replaceChild(newPhaseSelect, phaseSelect);
  const newRoundSelect = roundSelect.cloneNode(true);
  roundSelect.parentNode.replaceChild(newRoundSelect, roundSelect);

  const phaseSelectFinal = document.getElementById("start-phase-select");
  const roundSelectFinal = document.getElementById("start-round-select");
  const exerciseSelectFinal = document.getElementById("start-exercise-select");

  phaseSelectFinal.addEventListener('change', function() {
    const selectedIndex = parseInt(this.value);
    if (selectedIndex === 0 || isNaN(selectedIndex)) {
      if (roundContainer) roundContainer.style.display = 'none';
      if (exerciseContainer) exerciseContainer.style.display = 'none';
      return;
    }
    const block = blocks.find(b => b.index === selectedIndex);
    if (!block || block.rounds.length === 0) {
      if (roundContainer) roundContainer.style.display = 'none';
      if (exerciseContainer) exerciseContainer.style.display = 'none';
      return;
    }

    if (roundContainer) roundContainer.style.display = 'block';
    if (exerciseContainer) exerciseContainer.style.display = 'none';
    roundSelectFinal.innerHTML = '<option value="">Inizio blocco (Round 1)</option>';

    block.rounds.forEach((round) => {
      const option = document.createElement('option');
      option.value = round.firstExerciseIndex;
      option.textContent = `Round ${round.number}`;
      option.dataset.roundNumber = round.number;
      roundSelectFinal.appendChild(option);
    });
  });

  roundSelectFinal.addEventListener('change', function() {
    const selectedBlockIndex = parseInt(phaseSelectFinal.value);
    const selectedRoundFirstIndex = parseInt(this.value);

    if (isNaN(selectedBlockIndex) || selectedBlockIndex === 0) {
      if (exerciseContainer) exerciseContainer.style.display = 'none';
      return;
    }
    const block = blocks.find(b => b.index === selectedBlockIndex);
    if (!block) {
      if (exerciseContainer) exerciseContainer.style.display = 'none';
      return;
    }
    if (isNaN(selectedRoundFirstIndex) || this.value === "") {
      if (exerciseContainer) exerciseContainer.style.display = 'none';
      return;
    }
    const round = block.rounds.find(r => r.firstExerciseIndex === selectedRoundFirstIndex);
    if (!round || round.exercises.length === 0) {
      if (exerciseContainer) exerciseContainer.style.display = 'none';
      return;
    }

    if (exerciseContainer) exerciseContainer.style.display = 'block';
    exerciseSelectFinal.innerHTML = '<option value="">Inizio round</option>';
    round.exercises.forEach((ex, idx) => {
      const option = document.createElement('option');
      option.value = ex.index;
      option.textContent = `${idx + 1}. ${ex.name}`;
      exerciseSelectFinal.appendChild(option);
    });
  });

  const resetBtn = document.getElementById('reset-start-point');
  if (resetBtn) {
    resetBtn.addEventListener('click', function() {
      phaseSelectFinal.value = '0';
      if (roundContainer) roundContainer.style.display = 'none';
      if (exerciseContainer) exerciseContainer.style.display = 'none';
      localStorage.removeItem('workoutStartIndex');
    });
  }
}

/* -------------------- DOM Ready -------------------- */
document.addEventListener("DOMContentLoaded", () => {
  // ===== AUDIO INITIALIZATION =====
  setSoundMode("synth"); // force synth on start for debugging
  
  // Setup both sound mode selectors with bidirectional sync
  const soundModeWorkout = document.getElementById("soundMode");
  const soundModeSetup = document.getElementById("soundMode-setup");
  
  // Function to sync both selectors
  function syncSoundModeSelectors(value) {
    if (soundModeWorkout) soundModeWorkout.value = value;
    if (soundModeSetup) soundModeSetup.value = value;
    setSoundMode(value);
  }
  
  // Add change listeners to both selectors
  if (soundModeWorkout) {
    soundModeWorkout.addEventListener("change", e => syncSoundModeSelectors(e.target.value));
  }
  if (soundModeSetup) {
    soundModeSetup.addEventListener("change", e => syncSoundModeSelectors(e.target.value));
  }

  warmUpServer();
  speechSynthesis.getVoices(); // trigger voices load
  waitForVoices(1500).then(lockSynthVoices).catch(()=>{});

  preloadAudio(Object.values(beppeSounds));
  preloadWorkoutAudios();

  // ===== WARMUP TOGGLE =====
  // Warmup toggle - restore saved preference from localStorage
  const savedWarmupPref = localStorage.getItem("warmupEnabled");
  const warmupToggle = document.getElementById("warmup-toggle");
  
  if (warmupToggle) {
    // Restore saved preference (default to true if not set)
    if (savedWarmupPref !== null) {
      warmupToggle.checked = savedWarmupPref === "true";
    }
    
    // Save preference when changed
    warmupToggle.addEventListener("change", (e) => {
      localStorage.setItem("warmupEnabled", e.target.checked.toString());
    });
  }

  // ===== LOGIN & USER STATE =====
  const headerLoginBtn = document.getElementById("header-login-btn");
  const headerDashboardBtn = document.getElementById("header-dashboard-btn");
  
  const savedUser = localStorage.getItem("loggedUser");
  console.log("Page loaded. Logged user:", savedUser); // Debug
  console.log("Login button found:", !!headerLoginBtn); // Debug
  console.log("Dashboard button found:", !!headerDashboardBtn); // Debug
  
  if (savedUser) {
    // User is logged in
    console.log("User is logged in - showing dashboard button"); // Debug
    
    // If on index.html and logged in, redirect to dashboard
    const trainingSelector = document.getElementById("training-selector");
    if (trainingSelector) {
      // We're on index.html, redirect to dashboard
      console.log("On index.html while logged in, redirecting to dashboard...");
      window.location.href = "dashboard.html";
      return; // Stop execution
    }
    
    const loginScreen = document.getElementById("login-screen");
    const loginModal = document.getElementById("login-modal");
    const mainApp = document.getElementById("main-app");
    
    if (loginScreen) loginScreen.style.display = "none";
    if (loginModal) loginModal.classList.remove("active");
    if (mainApp) mainApp.style.display = "block";
    
    // Show dashboard button, hide login button
    if (headerLoginBtn) headerLoginBtn.style.display = "none";
    if (headerDashboardBtn) headerDashboardBtn.style.display = "flex";
    
    loadUserData(savedUser);
  } else {
    // User is NOT logged in
    console.log("User is NOT logged in - showing login button"); // Debug
    const loginScreen = document.getElementById("login-screen");
    const loginModal = document.getElementById("login-modal");
    const mainApp = document.getElementById("main-app");
    const trainingSelector = document.getElementById("training-selector");
    
    if (loginScreen) loginScreen.style.display = "block";
    if (loginModal) loginModal.classList.remove("active"); // Don't show modal by default
    if (mainApp) mainApp.style.display = "none";
    if (trainingSelector) trainingSelector.style.display = "block"; // Show training selector on index.html
    
    // Show login button, hide dashboard button
    if (headerLoginBtn) {
      headerLoginBtn.style.display = "flex";
      console.log("Set login button to flex"); // Debug
    }
    if (headerDashboardBtn) {
      headerDashboardBtn.style.display = "none";
      console.log("Set dashboard button to none"); // Debug
    }
  }

  // ===== LOGIN/LOGOUT BUTTONS =====
  const loginBtn = document.getElementById("login-button");
  if (loginBtn) loginBtn.addEventListener("click", login);
  
  // Use headerLoginBtn and headerDashboardBtn already declared above
  if (headerLoginBtn) {
    headerLoginBtn.addEventListener("click", () => {
      const loginModal = document.getElementById("login-modal");
      if (loginModal) loginModal.classList.add("active");
    });
  }
  
  const loginModalClose = document.getElementById("login-modal-close");
  if (loginModalClose) {
    loginModalClose.addEventListener("click", () => {
      const loginModal = document.getElementById("login-modal");
      if (loginModal) loginModal.classList.remove("active");
    });
  }
  
  // Close modal when clicking outside (on backdrop)
  const loginModal = document.getElementById("login-modal");
  if (loginModal) {
    loginModal.addEventListener("click", (e) => {
      if (e.target === loginModal) {
        loginModal.classList.remove("active");
      }
    });
  }
  
  const logoutBtn = document.getElementById("logout-button");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  // ===== WORKOUT START BUTTONS =====
  const topStart = document.getElementById("start-button");
  if (topStart) topStart.addEventListener("click", startWorkout);
  const bottomStart = document.getElementById("start-button-bottom");
  if (bottomStart) bottomStart.addEventListener("click", startWorkout);

  // ===== WORKOUT CONTROL BUTTONS =====

  // ===== WORKOUT CONTROL BUTTONS =====
  const pauseBtn = document.getElementById("pause-button");
  if (pauseBtn) {
    pauseBtn.addEventListener("click", () => {
      isPaused = !isPaused;
      const btn = document.getElementById("pause-button");
      if (isPaused) {
        btn.textContent = "▶️ Riprendi";
        // the loop will capture savedTimeLeft and stop itself
      } else {
        btn.textContent = "⏸ Pausa";
        resumeTimer();
      }
    });
  }

  // ===== FOOTER OFFSET SYNC =====
  // Footer offset sync - runs on page load and resize events
  (function footerOffsetSync(){
    const root = document.documentElement;
    const footer = document.getElementById('bottom-buttons-container');

    function sync(){
      if (!footer) return;
      // measure the *real* rendered height (includes padding + safe-area)
      const h = footer.offsetHeight || 0;
      root.style.setProperty('--bottom-bar-offset', h + 'px');
    }

    // Add listeners for when layout changes
    window.addEventListener('load', sync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    // some mobile browsers fire layout changes on visibility toggles
    document.addEventListener('visibilitychange', sync);

    // call once immediately since we're already in DOMContentLoaded
    sync();
  })();

  // ===== EXERCISE NAVIGATION BUTTONS =====
  const prevBtn = document.getElementById("prev-exercise-button");
  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      if (currentStep > 0) {
        clearInterval(interval);
        currentStep--;
        savedTimeLeft = null;
        isPaused = false;
        const pauseBtn = document.getElementById("pause-button");
        if (pauseBtn) pauseBtn.textContent = "⏸ Pausa";
        playExercise(currentStep, fullWorkoutSequence);
      }
    });
  }

  const nextBtn = document.getElementById("next-exercise-button");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      if (currentStep < fullWorkoutSequence.length - 1) {
        clearInterval(interval);
        currentStep++;
        savedTimeLeft = null;
        isPaused = false;
        const pauseBtn = document.getElementById("pause-button");
        if (pauseBtn) pauseBtn.textContent = "⏸ Pausa";
        playExercise(currentStep, fullWorkoutSequence);
      }
    });
  }

  // ===== SETTINGS POPUP (DURING WORKOUT) =====
  const settingsBtn = document.getElementById("settings-button");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      const pop = document.getElementById("settings-popup");
      if (pop) pop.style.display = "flex";
    });
  }

  const closeSettings = document.getElementById("close-settings");
  if (closeSettings) {
    closeSettings.addEventListener("click", () => {
      const pop = document.getElementById("settings-popup");
      if (pop) pop.style.display = "none";
    });
  }

  const exitBtn = document.getElementById("exit-workout-button");
  if (exitBtn) {
    exitBtn.addEventListener("click", () => {
      if (confirm("Sei sicuro di voler terminare l'allenamento?")) {
        exitWorkout();
      }
    });
  }

  const settingsPopup = document.getElementById("settings-popup");
  if (settingsPopup) {
    settingsPopup.addEventListener("click", (e) => {
      if (e.target.id === "settings-popup") settingsPopup.style.display = "none";
    });
  }

  // ===== FAB MENU TOGGLE =====
  const fabBtn = document.getElementById("fab-menu-toggle");
  const controlsContainer = document.getElementById("controls-container");
  const controlsOverlay = document.getElementById("controls-overlay");

  if (fabBtn && controlsContainer && controlsOverlay) {
    // Toggle menu on FAB click
    fabBtn.addEventListener("click", () => {
      const isHidden = controlsContainer.classList.contains("controls-hidden");
      
      if (isHidden) {
        // Open menu
        controlsContainer.classList.remove("controls-hidden");
        controlsContainer.classList.add("controls-visible");
        controlsOverlay.classList.remove("controls-overlay-hidden");
        controlsOverlay.classList.add("controls-overlay-visible");
        fabBtn.classList.add("active");
      } else {
        // Close menu
        controlsContainer.classList.remove("controls-visible");
        controlsContainer.classList.add("controls-hidden");
        controlsOverlay.classList.remove("controls-overlay-visible");
        controlsOverlay.classList.add("controls-overlay-hidden");
        fabBtn.classList.remove("active");
      }
    });

    // Close menu on overlay click
    controlsOverlay.addEventListener("click", () => {
      controlsContainer.classList.remove("controls-visible");
      controlsContainer.classList.add("controls-hidden");
      controlsOverlay.classList.remove("controls-overlay-visible");
      controlsOverlay.classList.add("controls-overlay-hidden");
      fabBtn.classList.remove("active");
    });
  }

  // ===== SETUP SETTINGS POPUP (BEFORE WORKOUT) =====
  const setupSettingsBtn = document.getElementById("setup-settings-button");
  if (setupSettingsBtn) {
    setupSettingsBtn.addEventListener("click", () => {
      const pop = document.getElementById("setup-settings-popup");
      if (pop) pop.style.display = "flex";
    });
  }

  const closeSetupSettings = document.getElementById("close-setup-settings");
  if (closeSetupSettings) {
    closeSetupSettings.addEventListener("click", () => {
      const pop = document.getElementById("setup-settings-popup");
      if (pop) pop.style.display = "none";
    });
  }

  const setupSettingsPopup = document.getElementById("setup-settings-popup");
  if (setupSettingsPopup) {
    setupSettingsPopup.addEventListener("click", (e) => {
      if (e.target.id === "setup-settings-popup") setupSettingsPopup.style.display = "none";
    });
  }

  // ===== INSTRUCTIONS COLLAPSIBLE =====
  const instrHeader = document.getElementById("instructions-header");
  if (instrHeader) {
    instrHeader.addEventListener("click", () => {
      const header = document.getElementById("instructions-header");
      const content = document.getElementById("instructions-content");
      const icon = document.getElementById("instructions-collapse-icon");
      if (header) header.classList.toggle("collapsed");
      if (content) content.classList.toggle("collapsed");
    });
  }

  // ===== KEYBOARD SHORTCUTS =====

  document.addEventListener("keydown", (e) => {
    const exerciseContainer = document.getElementById("exercise-container");
    if (!exerciseContainer || exerciseContainer.style.display === "none") return;

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      document.getElementById("prev-exercise-button")?.click();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      document.getElementById("next-exercise-button")?.click();
    } else if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      document.getElementById("pause-button")?.click();
    }
  });

  // ===== DYNAMIC BOTTOM SHEET OFFSET =====
  // Update CSS variable for bottom sheet height to prevent content from going behind Safari toolbar
  function updateSheetInset(selector = '.bottom-sheet-panel') {
    const el = document.querySelector(selector);
    const h = el ? el.offsetHeight : 0;
    document.documentElement.style.setProperty('--sheet-visible', h ? `${h}px` : '0px');
  }

  // Call on load, resize, and visualViewport changes
  updateSheetInset();
  
  window.addEventListener('resize', () => updateSheetInset());
  
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', () => updateSheetInset());
    visualViewport.addEventListener('scroll', () => updateSheetInset());
  }

  // Update when bottom sheet opens/closes
  const bottomSheet = document.getElementById('training-bottom-sheet');
  if (bottomSheet) {
    const observer = new MutationObserver(() => updateSheetInset());
    observer.observe(bottomSheet, { attributes: true, attributeFilter: ['class'] });
  }
});

// Release wake lock when page is hidden or closed
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    releaseWakeLock();
  }
});

// Release wake lock on page unload (backup)
window.addEventListener('beforeunload', () => {
  releaseWakeLock();
});