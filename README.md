# YabbyVille

A private music community web app built with React, Firebase, and Navidrome. Members can browse albums, place stickers on album covers, post on a message board, create shareable lists, listen to community radio, and upload files.

Built as a Progressive Web App (PWA) so it can be installed on phones and desktops.

## Quick Start

```bash
git clone <your-fork-url>
cd Yabby
npm install
cp example.env .env    # then fill in your credentials (see below)
npm run dev            # starts dev server at http://localhost:5173
```

Other commands:

```bash
npm run build      # TypeScript check + production build
npm run lint       # run ESLint
npm run preview    # preview the production build locally
```

## What You Need to Set Up

The app depends on a few external services. Without them, parts of the UI will be empty or non-functional. Here's what each one does and how to connect your own.

### Firebase (required)

Firebase provides **authentication** (email/password login) and **Firestore** (the database for users, messages, stickers, and lists).

1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** with the Email/Password sign-in method
3. Create a **Firestore Database**
4. Copy your Firebase config values into `.env`:
   ```
   VITE_FIREBASE_API_KEY=
   VITE_FIREBASE_AUTH_DOMAIN=
   VITE_FIREBASE_PROJECT_ID=
   VITE_FIREBASE_STORAGE_BUCKET=
   VITE_FIREBASE_MESSAGING_SENDER_ID=
   VITE_FIREBASE_APP_ID=
   ```
5. Deploy the Firestore security rules from `firestore.rules`:
   ```bash
   firebase deploy --only firestore:rules
   ```

Create user accounts through the Firebase Console.

### Navidrome (required for music features)

[Navidrome](https://www.navidrome.org/) is a self-hosted music server. The app uses the Subsonic API to search albums/artists and display album art. Without it, album carousels, sticker placement search, and artist tagging won't work.

```
VITE_NAVIDROME_SERVER_URL=https://your-navidrome-instance.com
VITE_NAVIDROME_API_USERNAME=
VITE_NAVIDROME_API_PASSWORD=
VITE_NAVIDROME_CLIENT_ID=yabbyville
```

### Copyparty (optional - file uploads)

[Copyparty](https://github.com/9001/copyparty) is a self-hosted file upload server. Used on the Upload page. Without it, the upload page will be empty.

```
VITE_COPYPARTY_BASE_URL=
VITE_COPYPARTY_LOCAL_URL=
```

### Request (SLSKD)

URL for your SLSKD instance

'''
VITE_SLSK_REQUEST_URL=
'''

## Firestore Collections

The app uses these Firestore collections. They are created automatically when users interact with the app:

| Collection | Purpose |
|---|---|
| `users` | User profiles (username, avatar, bio, location) |
| `messages` | Message board posts (with `reactions` and `replies` subcollections) |
| `stickers` | Stickers placed on album covers |
| `lists` | User-created album lists (with `items` subcollection) |
| `news` | Admin-only news posts |
| `admins` | Admin user IDs (manage via Firebase Console) |

Security rules are in `firestore.rules` - deploy them to your Firebase project to enforce permissions.

## Project Structure

```
src/
  pages/           # Route pages (Home, Profile, Stickers, etc.)
  components/
    basic/         # Reusable UI components (Button, Header, Carousel, etc.)
    ...            # Feature components (MessageBoard, StickerGrid, etc.)
  utils/           # Sanitisation, rate limiting, caching
  types/           # TypeScript type definitions
  assets/fonts/    # Custom fonts
  App.tsx          # Routing and layout
  App.css          # Global styles and colour/font variables
  firebaseConfig.ts
public/
  Stickers/        # Avatar images (webp)
  skins/           # Webamp radio player skins
  icons/           # PWA icons
  wiki/            # Wiki HTML content
```

## Styling

Global colours and fonts are CSS variables in `App.css`:

```css
--colour1: #4CAF50;   /* green  */
--colour2: #0000FF;   /* blue   */
--colour3: #FF9F65;   /* orange */
--colour4: #FFFFFF;   /* white  */
--colour5: #333333;   /* dark   */
--font1: 'WorkSans', Arial, sans-serif;
--font2: 'NectoMono', monospace;
```

Components have their own CSS files alongside their `.tsx` files. Pages do not have their own styles - they use component and global styles.

## Wiki

Detailed documentation for each page and component is in the [wiki/](wiki/) folder. See [wiki/Home.md](wiki/Home.md) for the index.

## Tech Stack

- **React 19** + **TypeScript** + **Vite**
- **Firebase** (Auth + Firestore)
- **Navidrome** (Subsonic API)
- **Embla Carousel** for sliders
- **DOMPurify** for HTML sanitisation
- **Webamp** for the radio player
- **vite-plugin-pwa** for PWA support
