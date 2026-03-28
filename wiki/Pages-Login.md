# Login Page

**File:** `src/pages/Login.tsx`
**Route:** `/login`

The only public page. Handles email/password authentication via Firebase Auth.

## Features

- Email and password login form
- Password reset via Firebase (sends a reset email)
- Client-side rate limiting: 5 login attempts per 15 minutes
- Redirects to home (`/`) on successful login

## Customising

- To change rate limits, edit the `useRateLimit` hook parameters in the component
- To add other sign-in methods (Google, GitHub, etc.), add Firebase auth providers in your Firebase Console and update the login form
- User accounts are created through the Firebase Console or by adding a sign-up flow to this page
