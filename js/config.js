const firebaseConfig = {
  apiKey: "AIzaSyAPIW-ZlYaiRDlufkPqG7kVW_uKmhaI2kA",
  authDomain: "quizlive-app.firebaseapp.com",
  databaseURL: "https://quizlive-app-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "quizlive-app",
  messagingSenderId: "875684500848"
};

const ADMIN_UID_CONFIG = "7DEy3WkKdQgbz7Kh7KCIrScb2el2";

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const database = firebase.database();
