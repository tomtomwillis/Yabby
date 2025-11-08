// Shared TypeScript types and interfaces

export interface User {
  uid: string;
  email: string;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

// Add more shared types as needed
