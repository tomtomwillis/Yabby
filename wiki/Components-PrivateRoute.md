# PrivateRoute

**File:** `src/components/PrivateRoute.tsx`

A route wrapper that checks Firebase Auth state. If the user is not logged in, they are redirected to `/login`.

All routes except `/login` are wrapped with this component in `App.tsx`.

```tsx
<Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
```

This is client-side only. All actual data access is secured by Firestore security rules server-side.
