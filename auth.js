// ═══════════════════════════════════════════════════════════════════════════
// VILTRUM FITNESS - AUTHENTICATION SYSTEM
// Supabase-based secure authentication with Google Sheets integration
// ═══════════════════════════════════════════════════════════════════════════

// ⚠️ IMPORTANT: Replace these with your actual credentials
const SUPABASE_URL = 'https://nvdrvqamxoqezmfrnjcw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52ZHJ2cWFteG9xZXptZnJuamN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2NDA3NjIsImV4cCI6MjA3ODIxNjc2Mn0.xyxX2L2mDto9hyWBsEGOqL1Ip73thC8E81V54UAKNEg'; // ← Sostituisci con la tua key!

// ⚠️ IMPORTANT: Replace with your Google Apps Script URL
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwIEsJrVqJuRRkwmdw6JkL9luPHJYv1fKhEcyl18uz71G1pRkoVoqPSrXrrWFaSVvAR/exec';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ═══════════════════════════════════════════════════════════════════════════
// CORE AUTHENTICATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sign up a new user
 * @param {string} email - User's email
 * @param {string} password - User's password (min 6 characters)
 * @param {string} fullName - User's full name (for backend/Google Sheets)
 * @param {string} username - User's username (displayed in app)
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
async function signUp(email, password, fullName, username) {
    try {
        console.log('Attempting signup for:', email);
        
        // Create user in Supabase Auth
        const { data, error } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password: password,
            options: {
                emailRedirectTo: undefined, // Skip email confirmation
                data: {
                    full_name: fullName,
                    username: username
                }
            }
        });

        if (error) {
            console.error('Signup error:', error);
            return { success: false, error: error.message };
        }

        if (data.user) {
            // Store user info in localStorage
            const userEmail = email.trim().toLowerCase();
            localStorage.setItem('loggedUser', userEmail);
            localStorage.setItem('userName', username); // Username for display in app
            localStorage.setItem('userFullName', fullName); // Full name for backend
            
            console.log('User signed up successfully:', data.user.email);
            
            // ✨ AUTOMATICALLY ADD USER TO GOOGLE SHEETS
            try {
                console.log('Adding user to Google Sheets...');
                
                // Use GET request with URL parameters to bypass CORS
                const url = new URL(GOOGLE_SCRIPT_URL);
                url.searchParams.append('action', 'addTrialUser');
                url.searchParams.append('email', userEmail);
                url.searchParams.append('name', fullName);
                
                const response = await fetch(url.toString(), {
                    method: 'GET'
                });
                
                const result = await response.json();
                console.log('Google Sheets response:', result);
                
                if (result.status === 'success' || result.status === 'info') {
                    console.log('✅ User added to Google Sheets with 7-day trial!');
                } else {
                    console.warn('⚠️ Google Sheets response:', result.message);
                }
            } catch (sheetError) {
                console.error('❌ Failed to add user to Google Sheets:', sheetError);
                // Note: We don't fail the signup if Sheets update fails
                // User is still created in Supabase
            }
            
            return { success: true, user: data.user };
        }

        return { success: false, error: 'Signup failed' };

    } catch (error) {
        console.error('Signup exception:', error);
        return { success: false, error: 'An unexpected error occurred' };
    }
}

/**
 * Sign in an existing user
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
async function signIn(email, password) {
    try {
        console.log('Attempting login for:', email);
        
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password: password
        });

        if (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        }

        if (data.user) {
            // Store user info in localStorage
            localStorage.setItem('loggedUser', email.trim().toLowerCase());
            localStorage.setItem('userName', data.user.user_metadata?.username || 'User'); // Username for display
            localStorage.setItem('userFullName', data.user.user_metadata?.full_name || 'User'); // Full name for backend
            
            console.log('User logged in successfully:', data.user.email);
            return { success: true, user: data.user };
        }

        return { success: false, error: 'Login failed' };

    } catch (error) {
        console.error('Login exception:', error);
        return { success: false, error: 'An unexpected error occurred' };
    }
}

/**
 * Sign out the current user
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function signOut() {
    try {
        const { error } = await supabase.auth.signOut();
        
        if (error) {
            console.error('Logout error:', error);
            return { success: false, error: error.message };
        }

        // Clear localStorage
        localStorage.removeItem('loggedUser');
        localStorage.removeItem('userName');
        localStorage.removeItem('userFullName');
        
        console.log('User logged out successfully');
        return { success: true };

    } catch (error) {
        console.error('Logout exception:', error);
        return { success: false, error: 'An unexpected error occurred' };
    }
}

/**
 * Check if user is authenticated
 * Redirects to index.html if not authenticated
 * @returns {Promise<boolean>} - True if authenticated, false otherwise
 */
async function checkAuth() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
            // Not logged in
            if (window.location.pathname !== '/index.html' && 
                window.location.pathname !== '/' && 
                !window.location.pathname.includes('index.html')) {
                window.location.href = 'index.html';
            }
            return false;
        }

        // Logged in - ensure localStorage is set
        const email = session.user.email.toLowerCase();
        localStorage.setItem('loggedUser', email);
        localStorage.setItem('userName', session.user.user_metadata?.username || 'User');
        localStorage.setItem('userFullName', session.user.user_metadata?.full_name || 'User');
        
        return true;

    } catch (error) {
        console.error('Auth check error:', error);
        return false;
    }
}

/**
 * Get current user information
 * @returns {Promise<{email: string, username: string, fullName: string} | null>}
 */
async function getCurrentUser() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) return null;

        return {
            email: session.user.email.toLowerCase(),
            username: session.user.user_metadata?.username || 'User',
            fullName: session.user.user_metadata?.full_name || 'User'
        };

    } catch (error) {
        console.error('Get user error:', error);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-REFRESH SESSION
// ═══════════════════════════════════════════════════════════════════════════

// Listen for auth state changes
supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth state changed:', event);
    
    if (event === 'SIGNED_IN') {
        console.log('User signed in');
    } else if (event === 'SIGNED_OUT') {
        console.log('User signed out');
        localStorage.removeItem('loggedUser');
        localStorage.removeItem('userName');
        localStorage.removeItem('userFullName');
    } else if (event === 'TOKEN_REFRESHED') {
        console.log('Token refreshed');
    }
});

console.log('Auth.js loaded successfully');
console.log('Google Sheets integration: ENABLED');