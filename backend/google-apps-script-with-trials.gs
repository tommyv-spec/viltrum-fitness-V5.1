// Google Apps Script - With Automatic Trial Assignment
// This version automatically adds new users with 7-day trial when they sign up

function doGet(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- LOAD EXERCISES LIBRARY ---
  const exerciseSheet = ss.getSheetByName("Exercises");
  const exerciseData = exerciseSheet.getDataRange().getValues();
  const exerciseLibrary = {};

  for (let i = 1; i < exerciseData.length; i++) {
    const exerciseName = (exerciseData[i][0] || "").toString().trim();
    if (!exerciseName) continue;

    exerciseLibrary[exerciseName] = {
      imageUrl: exerciseData[i][5] || "",
      audio: exerciseData[i][8] || "",
      audioCambio: exerciseData[i][9] || ""
    };
  }

  // --- LOAD WORKOUTS ---
  const workoutSheet = ss.getSheetByName("Workouts");
  const workoutData = workoutSheet.getDataRange().getValues();
  const workouts = {};

  for (let i = 1; i < workoutData.length; i++) {
    const row = workoutData[i];
    
    const workoutName = (row[0] || "").toString().trim();
    const block = (row[1] || "").toString().trim();
    const exercise = (row[2] || "").toString().trim();
    const practiceDur = parseInt(row[3]) || 0;
    const fullDur = parseInt(row[4]) || 0;
    const reps = (row[5] || "").toString().trim();
    const tipoDiPeso = (row[6] || "").toString().trim();
    const rounds = parseInt(row[7]) || 1;

    if (!workoutName || !exercise || (isNaN(fullDur) && isNaN(practiceDur))) continue;

    if (!workouts[workoutName]) {
      workouts[workoutName] = {
        exercises: [],
        instructions: ""
      };
    }

    const exerciseInfo = exerciseLibrary[exercise] || {};

    workouts[workoutName].exercises.push({
      name: exercise,
      practiceDuration: practiceDur,
      duration: fullDur,
      imageUrl: exerciseInfo.imageUrl || "",
      reps: reps,
      block: block,
      tipoDiPeso: tipoDiPeso,
      rounds: rounds,
      audio: exerciseInfo.audio || "",
      audioCambio: exerciseInfo.audioCambio || ""
    });
  }

  // --- INSTRUCTIONS ---
  const instructionSheet = ss.getSheetByName("Instructions");
  const instructionData = instructionSheet.getDataRange().getValues();
  for (let j = 1; j < instructionData.length; j++) {
    const [name, instruction] = instructionData[j];
    if (workouts[name]) {
      workouts[name].instructions = instruction;
    }
  }

  // --- USERS ---
  const userSheet = ss.getSheetByName("Users");
  const userData = userSheet.getDataRange().getValues();
  const userWorkouts = {};

  for (let k = 1; k < userData.length; k++) {
    const row = userData[k];
    const userEmail = (row[0] || "").toString().trim().toLowerCase();
    const scadenza = row[1] || "";
    
    if (!userEmail) continue;
    
    userWorkouts[userEmail] = {
      scadenza: scadenza,
      workouts: []
    };
    
    for (let col = 2; col < row.length; col++) {
      const workout = (row[col] || "").toString().trim();
      if (workout) {
        userWorkouts[userEmail].workouts.push(workout);
      }
    }
  }

  const result = {
    workouts: workouts,
    userWorkouts: userWorkouts
  };

  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- HANDLE POST REQUESTS ---
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    if (action === 'addTrialUser') {
      return addTrialUser(data);
    } else if (action === 'updateSubscription') {
      return updateSubscription(data);
    } else if (action === 'createCheckout') {
      return createStripeCheckout(data);
    } else if (action === 'handleWebhook') {
      return handleStripeWebhook(data);
    }
    
    return createResponse({ status: 'error', message: 'Unknown action' });
    
  } catch (error) {
    return createResponse({ 
      status: 'error', 
      message: 'Invalid request: ' + error.toString() 
    });
  }
}

// --- ADD TRIAL USER (Automatic from Supabase webhook) ---
function addTrialUser(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("Users");
  
  const email = (data.email || "").trim().toLowerCase();
  const name = data.name || "";
  
  if (!email || !email.includes('@')) {
    return createResponse({ 
      status: 'error', 
      message: 'Invalid email address' 
    });
  }
  
  // Check if user already exists
  const userData = userSheet.getDataRange().getValues();
  for (let i = 1; i < userData.length; i++) {
    const existingEmail = (userData[i][0] || "").toString().trim().toLowerCase();
    if (existingEmail === email) {
      return createResponse({ 
        status: 'info', 
        message: 'User already exists',
        email: email
      });
    }
  }
  
  // Calculate trial expiration (7 days from now)
  const trialEndDate = new Date();
  trialEndDate.setDate(trialEndDate.getDate() + 7);
  
  // Default trial workouts (CUSTOMIZE THESE!)
  const trialWorkouts = [
    "Trial Workout 1",  // Change to your actual workout name
    "Trial Workout 2"   // Change to your actual workout name
  ];
  
  // Add new user with trial
  const newRow = [
    email,
    trialEndDate,
    ...trialWorkouts
  ];
  
  userSheet.appendRow(newRow);
  
  // Send notification email (optional)
  try {
    MailApp.sendEmail({
      to: "YOUR_EMAIL@example.com",  // Your admin email
      subject: "New Trial User: " + email,
      body: `New user signed up for trial!\n\nEmail: ${email}\nName: ${name}\nTrial ends: ${trialEndDate.toLocaleDateString()}\n\nWorkouts assigned: ${trialWorkouts.join(', ')}`
    });
  } catch (mailError) {
    Logger.log("Could not send email: " + mailError.toString());
  }
  
  Logger.log(`Trial user added: ${email} (expires ${trialEndDate})`);
  
  return createResponse({ 
    status: 'success', 
    message: 'Trial activated',
    email: email,
    trialEndDate: trialEndDate,
    workouts: trialWorkouts
  });
}

// --- UPDATE SUBSCRIPTION (After payment) ---
function updateSubscription(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("Users");
  
  const email = (data.email || "").trim().toLowerCase();
  const planType = data.planType; // 'monthly', 'quarterly', 'annual'
  
  if (!email) {
    return createResponse({ 
      status: 'error', 
      message: 'Email required' 
    });
  }
  
  // Calculate new expiration based on plan
  const today = new Date();
  let newExpiration = new Date(today);
  
  switch(planType) {
    case 'monthly':
      newExpiration.setMonth(newExpiration.getMonth() + 1);
      break;
    case 'quarterly':
      newExpiration.setMonth(newExpiration.getMonth() + 3);
      break;
    case 'annual':
      newExpiration.setFullYear(newExpiration.getFullYear() + 1);
      break;
    default:
      newExpiration.setMonth(newExpiration.getMonth() + 1);
  }
  
  // Find and update user
  const userData = userSheet.getDataRange().getValues();
  
  for (let i = 1; i < userData.length; i++) {
    const userEmail = (userData[i][0] || "").toString().trim().toLowerCase();
    
    if (userEmail === email) {
      // Update expiration date (Column B)
      userSheet.getRange(i + 1, 2).setValue(newExpiration);
      
      // Optionally upgrade workouts (add more workouts for paid users)
      // Example: Add premium workouts in columns C, D, E, etc.
      
      Logger.log(`Subscription updated for ${email} until ${newExpiration}`);
      
      return createResponse({
        status: 'success',
        message: 'Subscription activated',
        newExpiration: newExpiration
      });
    }
  }
  
  // User not found - add them as paid user
  const paidWorkouts = [
    "Full Body Workout",     // Change to your actual workouts
    "Upper Body Focus",
    "Lower Body Strength",
    "Core & Cardio"
  ];
  
  userSheet.appendRow([
    email,
    newExpiration,
    ...paidWorkouts
  ]);
  
  return createResponse({
    status: 'success',
    message: 'User added with paid subscription',
    newExpiration: newExpiration
  });
}

// --- STRIPE INTEGRATION (Optional - see PAYMENT-INTEGRATION-GUIDE.txt) ---
function createStripeCheckout(data) {
  // See PAYMENT-INTEGRATION-GUIDE.txt for full implementation
  return createResponse({
    status: 'error',
    message: 'Stripe integration not configured. See PAYMENT-INTEGRATION-GUIDE.txt'
  });
}

function handleStripeWebhook(data) {
  // See PAYMENT-INTEGRATION-GUIDE.txt for full implementation
  return createResponse({ status: 'success' });
}

// --- HELPER FUNCTION ---
function createResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// --- MANUAL ADMIN FUNCTIONS (Run from Script Editor) ---

// Extend a user's subscription manually
function extendUserSubscription(email, months) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("Users");
  const userData = userSheet.getDataRange().getValues();
  
  for (let i = 1; i < userData.length; i++) {
    const userEmail = (userData[i][0] || "").toString().trim().toLowerCase();
    
    if (userEmail === email.toLowerCase()) {
      const currentExpiry = new Date(userData[i][1]);
      const newExpiry = new Date(currentExpiry);
      newExpiry.setMonth(newExpiry.getMonth() + months);
      
      userSheet.getRange(i + 1, 2).setValue(newExpiry);
      Logger.log(`Extended ${email} subscription to ${newExpiry}`);
      return;
    }
  }
  
  Logger.log(`User not found: ${email}`);
}

// Get all expired users
function getExpiredUsers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("Users");
  const userData = userSheet.getDataRange().getValues();
  
  const today = new Date();
  const expired = [];
  
  for (let i = 1; i < userData.length; i++) {
    const email = userData[i][0];
    const expiry = new Date(userData[i][1]);
    
    if (expiry < today) {
      expired.push({
        email: email,
        expired: expiry,
        daysAgo: Math.floor((today - expiry) / (1000 * 60 * 60 * 24))
      });
    }
  }
  
  Logger.log("Expired users: " + JSON.stringify(expired));
  return expired;
}

// Get trial users
function getTrialUsers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const userSheet = ss.getSheetByName("Users");
  const userData = userSheet.getDataRange().getValues();
  
  const today = new Date();
  const trials = [];
  
  for (let i = 1; i < userData.length; i++) {
    const email = userData[i][0];
    const expiry = new Date(userData[i][1]);
    const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    
    // Consider trial if expiring within 7 days
    if (daysUntilExpiry >= 0 && daysUntilExpiry <= 7) {
      trials.push({
        email: email,
        expires: expiry,
        daysRemaining: daysUntilExpiry
      });
    }
  }
  
  Logger.log("Trial users: " + JSON.stringify(trials));
  return trials;
}

/*
USAGE INSTRUCTIONS:

1. AUTOMATIC TRIAL ASSIGNMENT:
   - Deploy this script as web app
   - Set up Supabase webhook (see SETUP-INSTRUCTIONS-AUTO-ADD.txt)
   - New users automatically get 7-day trial

2. CUSTOMIZE TRIAL WORKOUTS:
   - Edit lines 130-133 (trialWorkouts array)
   - Change to your actual workout names

3. MANUAL ADMIN TASKS:
   - Run extendUserSubscription("user@email.com", 3) to extend 3 months
   - Run getExpiredUsers() to see who needs renewal
   - Run getTrialUsers() to see active trials

4. PAYMENT INTEGRATION:
   - See PAYMENT-INTEGRATION-GUIDE.txt
   - Implements createStripeCheckout and handleStripeWebhook

5. MONITORING:
   - View → Logs to see all activity
   - Check execution history for errors
*/
