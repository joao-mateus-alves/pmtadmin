
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAOeOx49yAKW3C65UIcbG1VVhw3allEI2c",
  authDomain: "appweb-7c0bc.firebaseapp.com",
  databaseURL: "https://appweb-7c0bc-default-rtdb.firebaseio.com",
  projectId: "appweb-7c0bc",
  storageBucket: "appweb-7c0bc.firebasestorage.app",
  messagingSenderId: "597448429184",
  appId: "1:597448429184:web:4d14efc95714930908e065"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { app, db };
