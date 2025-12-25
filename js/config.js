// ⚠️ PLACEHOLDER CONFIG - DO NOT USE IN PRODUCTION
// This file is replaced by GitHub Actions during deployment
// 
// For LOCAL DEVELOPMENT:
// 1. Copy this file to config.local.js
// 2. Replace placeholders with your Firebase config
// 3. Rename config.local.js to config.js

const firebaseConfig = {
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    databaseURL: "https://YOUR_PROJECT-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.firebasestorage.app",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Admin UID - Replace with your admin user's UID from Firebase Authentication
const ADMIN_UID_CONFIG = "YOUR_ADMIN_UID_HERE";

// Check if config is placeholder
if (firebaseConfig.apiKey === "YOUR_API_KEY_HERE") {
    console.error("⚠️ Firebase config not set!");
    console.error("Please configure GitHub Secrets for production deployment.");
    console.error("Or create a local config.js file for development.");
}

// Initialize Firebase (version compat)
firebase.initializeApp(firebaseConfig);

// Initialize Realtime Database
const database = firebase.database();

console.log('✅ Firebase initialized');
