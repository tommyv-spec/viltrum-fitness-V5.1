/**
 * Viltrum Fitness - Session Cache Manager
 * Centralized data loading and caching system
 * Load once, use everywhere in the session
 */

const SessionCache = {
  GOOGLE_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwIEsJrVqJuRRkwmdw6JkL9luPHJYv1fKhEcyl18uz71G1pRkoVoqPSrXrrWFaSVvAR/exec',
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
  
  /**
   * Get all user data (workouts, subscription, nutrition, etc.)
   * Loads once per session, then serves from cache
   */
  async getUserData(forceRefresh = false) {
    const cacheKey = 'viltrum_session_data';
    const timestampKey = 'viltrum_session_timestamp';
    
    // Check session cache first
    if (!forceRefresh) {
      const cached = sessionStorage.getItem(cacheKey);
      const timestamp = sessionStorage.getItem(timestampKey);
      
      if (cached && timestamp) {
        const age = Date.now() - parseInt(timestamp);
        if (age < this.CACHE_DURATION) {
          console.log(`✅ Using session cache (age: ${Math.round(age/1000)}s)`);
          return JSON.parse(cached);
        }
      }
    }
    
    // Fetch fresh data
    console.log('🔄 Loading fresh data from server...');
    try {
      const response = await fetch(this.GOOGLE_SCRIPT_URL);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // Cache in sessionStorage
      sessionStorage.setItem(cacheKey, JSON.stringify(data));
      sessionStorage.setItem(timestampKey, Date.now().toString());
      
      console.log('✅ Data loaded and cached');
      return data;
      
    } catch (error) {
      console.error('❌ Failed to load data:', error);
      
      // Try to use stale cache if available
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        console.warn('⚠️ Using stale cache due to network error');
        return JSON.parse(cached);
      }
      
      throw error;
    }
  },
  
  /**
   * Get current user's info (subscription, workouts, nutrition, etc.)
   */
  async getCurrentUserInfo() {
    const email = localStorage.getItem('loggedUser');
    if (!email) {
      throw new Error('User not logged in');
    }
    
    const data = await this.getUserData();
    const userEmail = email.toLowerCase();
    const userInfo = data.userWorkouts[userEmail];
    
    if (!userInfo) {
      console.warn(`User ${userEmail} not found in data`);
      return {
        email: userEmail,
        fullName: localStorage.getItem('userName') || 'User',
        scadenza: null,
        workouts: [],
        allWorkoutsData: data.workouts || {},
        // Nutrition data
        nutritionPdfUrl: null,
        nutritionScadenza: null
      };
    }
    
    return {
      email: userEmail,
      fullName: userInfo.fullName || localStorage.getItem('userName') || 'User',
      scadenza: userInfo.scadenza,
      workouts: userInfo.workouts || [],
      allWorkoutsData: data.workouts || {},
      // Nutrition data from Google Sheets
      nutritionPdfUrl: userInfo.nutritionPdfUrl || null,
      nutritionScadenza: userInfo.nutritionScadenza || null
    };
  },
  
  /**
   * Calculate subscription status
   */
  getSubscriptionStatus(scadenza) {
    if (!scadenza) {
      return {
        status: 'unknown',
        daysRemaining: null,
        isActive: false,
        isTrial: false,
        isExpired: true
      };
    }
    
    const expirationDate = new Date(scadenza);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expirationDate.setHours(0, 0, 0, 0);
    
    const daysRemaining = Math.ceil((expirationDate - today) / (1000 * 60 * 60 * 24));
    
    return {
      status: daysRemaining < 0 ? 'expired' : (daysRemaining <= 7 ? 'trial' : 'active'),
      daysRemaining: daysRemaining,
      isActive: daysRemaining > 7,
      isTrial: daysRemaining >= 0 && daysRemaining <= 7,
      isExpired: daysRemaining < 0,
      expirationDate: expirationDate
    };
  },
  
  /**
   * Preload images for faster display
   */
  preloadImages(imageUrls) {
    const cacheKey = 'viltrum_preloaded_images';
    const preloaded = sessionStorage.getItem(cacheKey);
    
    if (preloaded) {
      console.log('✅ Images already preloaded in session');
      return Promise.resolve();
    }
    
    console.log(`🖼️ Preloading ${imageUrls.length} images...`);
    
    const promises = imageUrls.map(url => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          console.log(`✅ Loaded: ${url.substring(0, 50)}...`);
          resolve();
        };
        img.onerror = () => {
          console.warn(`⚠️ Failed to load: ${url.substring(0, 50)}...`);
          resolve(); // Don't fail the whole batch
        };
        img.src = url;
      });
    });
    
    return Promise.all(promises).then(() => {
      sessionStorage.setItem(cacheKey, 'true');
      console.log('✅ All images preloaded');
    });
  },
  
  /**
   * Preload workout images
   */
  async preloadWorkoutImages() {
    try {
      const userInfo = await this.getCurrentUserInfo();
      const imageUrls = [];
      
      // Collect all image URLs from user's workouts
      userInfo.workouts.forEach(workoutName => {
        const workout = userInfo.allWorkoutsData[workoutName];
        if (workout && workout.exercises) {
          workout.exercises.forEach(exercise => {
            if (exercise.imageUrl && !imageUrls.includes(exercise.imageUrl)) {
              imageUrls.push(exercise.imageUrl);
            }
          });
        }
      });
      
      if (imageUrls.length > 0) {
        await this.preloadImages(imageUrls);
      }
      
    } catch (error) {
      console.warn('Failed to preload images:', error);
    }
  },
  
  /**
   * Clear session cache (useful for logout or refresh)
   */
  clearCache() {
    sessionStorage.removeItem('viltrum_session_data');
    sessionStorage.removeItem('viltrum_session_timestamp');
    sessionStorage.removeItem('viltrum_preloaded_images');
    console.log('🗑️ Session cache cleared');
  },
  
  /**
   * Initialize session cache on page load
   */
  async init() {
    console.log('🚀 Initializing session cache...');
    try {
      const userInfo = await this.getCurrentUserInfo();
      console.log(`✅ Session initialized for ${userInfo.email}`);
      console.log(`📊 ${userInfo.workouts.length} workouts available`);
      
      // Check nutrition availability
      if (userInfo.nutritionPdfUrl) {
        console.log('🥗 Nutrition plan available');
      }
      
      // Preload images in background
      this.preloadWorkoutImages().catch(e => {
        console.warn('Image preload failed:', e);
      });
      
      return userInfo;
    } catch (error) {
      console.error('❌ Failed to initialize session:', error);
      throw error;
    }
  }
};

// Auto-initialize on load (unless page explicitly disables it)
if (typeof DISABLE_AUTO_CACHE_INIT === 'undefined' || !DISABLE_AUTO_CACHE_INIT) {
  document.addEventListener('DOMContentLoaded', () => {
    const user = localStorage.getItem('loggedUser');
    if (user) {
      SessionCache.init().catch(error => {
        console.error('Auto-init failed:', error);
      });
    }
  });
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionCache;
}
