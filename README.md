# YabbyVilleV2 Documentation

## App Structure

I've tried to keep the app as clean as possible so it's easy to find everything.
The main elements of the app are split into:

### Components (src/components)
- The chunks of code that are responsible for a specific task.
- I've separated components into Basic and Complex components
  - Basic Components are ones that get reused lots throughout the app like buttons and textboxes
  - The Complex components do a more complex and specific job. A complex component might use a Basic component to complete it's job
- css Stylings for the components are stored with the tsx files of the components

### Pages (src/pages)
  - The code that represents the different pages of the website
  - Where possible these are kept as simple as possible and just made up from different components
  - There are no stylings for pages - these are managed either by the component stylings or by the app.css styling


### Other significant files/folders
- Assets (folder -> src/assets)
  - Where the fonts are stored
- public
  - public/Stickers contains the files for all the stickers
  - public/wiki contains the files associated with the wiki page
    - this folder is excluded by the gitignore currently for security and will need to be added manually to the public folder
- .env
  - This stores all the secure information about the system and is not included in the github files. It will need to be manually added to the root folder of the album.
  - I've made efforts to ensure that all references to the server are in here so it can be easily swapped out for another project
  - I've created a file called example.env that can be used to see the structure of the current env

## Styling
Styling in the app is managed predominantly by the App.css file. I've tried to make it so that any of the main logic of styling is here so any app-wide changes can be made here.

Components have their own css styling associated with them. Pages do not have their own styling and just use the app.css and component styling.

I've attempted to ensure that there is a styling hierarcy in all components to make changes simple.
For example the styling for all buttons is controlled by the button.css file. Components like Messageboard.tsx and the Carousel.tsx use buttons. If the button.css styling is changed it will change across all components that use buttons.

### Colours
Colours are set by the list of colours in the App.css file. If the colours are updated there then they should update across the whole app. 

The colours are:
-  --colour1: #4CAF50;
-  --colour2: #0000FF;
-  --colour3: #FF9F65;
-  --colour4: #FFFFFF;
-  --colour5: #333333;

Colours will be referred to throughout the app like this
`var(--colour1)`

### Fonts
Fonts are set in the App.css file. Like colours, if these are updated in App.css then they should change across the whole app

-  font1: 'WorkSans', Arial, sans-serif; 
-  font2: 'NectoMono', monospace; 

Fonts will be referred to in the code like this
`var(--font1)`




## Basic Components

### Button
All buttons used across the app use this component. The component has several versions: 

- **Basic**: A standard button with a label.
- **Close**: A button with a close (X) icon.
- **Arrow-Left**: A button with a left arrow icon.
- **Arrow-Right**: A button with a right arrow icon.
- **Submit**: A button used for form submissions.

#### Examples:

- **Basic Button**:
  ```tsx
  <Button label="Click Me" onClick={() => alert('Button clicked!')} type="basic" />
  ```

- **Close Button**:
  ```tsx
  <Button type="close" onClick={() => alert('Close button clicked!')} size="2em" />
  ```

### Carousel

The `Carousel` component is used to display a customizable and interactive carousel/slider. It supports features like looping, autoplay, and navigation buttons. The carousel is used by the CarouselAlbums and CaourselStickers components.

#### Props:
- **slides**: An array of `ReactNode` elements to be displayed as slides.
- **loop**: A boolean to enable or disable looping of slides (default: `false`).
- **autoplay**: A boolean to enable or disable autoplay (default: `false`).
- **autoplayDelay**: The delay (in milliseconds) between autoplay transitions (default: `4000`).

#### Example:

- **Basic Carousel**:
  ```tsx
  <Carousel
    slides={[
      <img src="slide1.jpg" alt="Slide 1" />,
      <img src="slide2.jpg" alt="Slide 2" />,
      <img src="slide3.jpg" alt="Slide 3" />,
    ]}
    loop={true}
    autoplay={true}
    autoplayDelay={3000}
  />
  ```

### Header
The `Header` component is used to display the navigation (eg home, listen etc) and title of the app. It can turn into a burger navigation button when the page width is small enough (eg on mobile). 

#### Props:
- **title**: The main title text to display in the header.
- **subtitle**: The subtitle text to display below the title.

#### Example:

- **Basic Header**:
  ```tsx
  <Header title="YabbyVille" subtitle="Your music, your way" />
  ```

### MessageTextBox
The `MessageTextBox` component is a versatile text input box designed for sending messages. It includes features like word and character limits, auto-resizing, and an optional send button.

#### Props:
- **placeholder**: Placeholder text for the input box (default: `"Type here"`).
- **value**: The current value of the text box (for controlled input).
- **onSend**: A callback function triggered when the send button is clicked or `Ctrl+Enter`/`Cmd+Enter` is pressed.
- **onChange**: A callback function triggered when the text changes.
- **disabled**: Disables the text box and send button (default: `false`).
- **maxWords**: Maximum number of words allowed (default: `250`).
- **className**: Additional CSS classes for custom styling.
- **showSendButton**: Controls the visibility of the send button (default: `true`).
- **showCounter**: Controls the visibility of the word/character counter (default: `true`).
- **children**: Custom child elements, such as a custom send button.

#### Features:
- **Auto-Resizing**: The text box automatically adjusts its height based on the content.
- **Word and Character Limits**: Displays a counter and prevents input beyond the specified limits.
- **Keyboard Shortcuts**: Supports `Ctrl+Enter`/`Cmd+Enter` for sending messages.
- **Customizable Send Button**: Allows passing a custom button as a child.

#### Examples:

- **Basic MessageTextBox**:
  ```tsx
  <MessageTextBox
    placeholder="Type your message..."
    onSend={(text) => console.log("Message sent:", text)}
  />
  ```

- **MessageTextBox with Custom Limits**:
  ```tsx
  <MessageTextBox
    maxWords={100}
    onSend={(text) => console.log("Message sent:", text)}
    showCounter={true}
  />
  ```

- **MessageTextBox with Custom Send Button**:
  ```tsx
    <MessageTextBox
    onSend={(text) => console.log("Message sent:", text)}
    showSendButton={false}
  >
    <Button type="submit" label="Custom Send" />
  </MessageTextBox>
  ```

### Star
The `Star` component is an animated SVG star with a dynamic distortion effect. It uses an `feTurbulence` filter to create a "stop-motion" style animation, making the star appear to distort over time. This component is only used once in the App.tsx file.

- **Basic Star**:
  ```tsx
  <Star />
  ```

### Text Animations
The `TextAnimations.css` file provides reusable CSS classes for gentle and dynamic text animations. These include floating, breathing, drifting, and hover effects. These are only currently used for the floating effect on the header but it could be reused anywhere.

#### Example:
- **Floating Animation**:
  ```html
  <h1 class="animated-text float-gentle">Floating Text</h1>
  ```

### Tips
The `Tips` component displays helpful tips to users. Visibility can be configured for mobile and/or desktop devices.

#### Props:
- **text**: The tip text to display (can include emojis).
- **showOnMobile**: Boolean to show tip on mobile devices (default: `true`).
- **showOnDesktop**: Boolean to show tip on desktop (default: `false`).

#### Example:
```tsx
<Tips
  text="💡 Long press the heart to see who reacted"
  showOnMobile={true}
  showOnDesktop={false}
/>
```

### ForumMessageBox

The `ForumMessageBox` component is a rich text editor designed for posting messages with artist/album tagging functionality. It uses a WYSIWYG editor and integrates with the Navidrome API to search and tag artists and albums by typing `@` followed by a search query. In future updates, this could be refactored to also power sticker messages. 

#### Props:

- **placeholder**: Placeholder text for the input box (default: `"Type your message..."`).
- **value**: The current value of the text box (for controlled input).
- **onSend**: A callback function triggered when the send button is clicked.
- **disabled**: Disables the text box and send button (default: `false`).
- **maxWords**: Maximum number of words allowed (default: `250`).
- **maxChars**: Maximum number of characters allowed (default: `1000`).
- **className**: Additional CSS classes for custom styling.
- **showSendButton**: Controls the visibility of the send button (default: `true`).

#### Features:

- **Rich Text Editing**: Uses a WYSIWYG editor for HTML content creation.
- **Artist/Album Tagging**: Type `@` followed by a search term to search for artists and albums from Navidrome. Results appear as you type (minimum 3 characters).
- **Hyperlink Creation**: Selected artists/albums are automatically converted into hyperlinks pointing to the Navidrome interface.
- **Word and Character Limits**: Displays a counter and prevents input beyond specified limits.
- **Search Results**: Shows top 3 matching artists and albums as clickable buttons.
- **Hyperlink Protection**: Prevents accidental modification of inserted hyperlinks.

#### Examples:

- **Basic ForumMessageBox**:
  ```tsx
  <ForumMessageBox
    placeholder="Share your thoughts..."
    onSend={(html) => console.log("Message sent:", html)}
  />
  ```

- **ForumMessageBox with Custom Limits**:
  ```tsx
  <ForumMessageBox
    maxWords={150}
    maxChars={750}
    onSend={(html) => console.log("Message sent:", html)}
  />
  ```

- **ForumMessageBox without Send Button**:
  ```tsx
  <ForumMessageBox
    onSend={(html) => console.log("Message sent:", html)}
    showSendButton={false}
  />
  ```

#### Usage Example with Tagging:
1. Type `@` followed by an artist or album name (e.g., `@Beatles`)
2. Search results appear after 3 characters
3. Click a result to insert it as a hyperlink
4. The link format: `https://music.yabbyville.xyz/app/#/artist/{id}/show`

### AlbumSearchBox

The `AlbumSearchBox` component is a dual-purpose input field that allows users to either search for albums by typing their name OR paste a Navidrome album URL. It automatically detects which input method is being used and handles them appropriately.

#### Props:

- **placeholder**: Placeholder text for the input box (default: `"Search for an album or paste URL..."`).
- **onAlbumSelect**: A callback function triggered when a user selects an album from search results. Receives the album ID as a parameter.
- **onUrlSubmit**: A callback function triggered when a user submits a URL. Receives the full URL as a parameter.

#### Features:

- **Auto-Search**: Automatically searches for albums as the user types (minimum 3 characters).
- **URL Detection**: Intelligently detects when user is pasting a URL (starts with "https:") and disables search.
- **Album Search**: Searches only albums (not artists) from the Navidrome API.
- **Debounced Search**: 300ms delay prevents excessive API calls while typing.
- **Results Dropdown**: Shows up to 5 matching albums with album name and artist.
- **Clean UI**: Search results appear below the input with clear album/artist information.
- **Automatic Cleanup**: Clears input and results after selection or submission.

#### Examples:

- **Basic AlbumSearchBox**:
  ```tsx
  <AlbumSearchBox
    onAlbumSelect={(albumId) => fetchAlbumDetails(albumId)}
    onUrlSubmit={(url) => handleUrlPaste(url)}
  />
  ```

- **AlbumSearchBox with Custom Placeholder**:
  ```tsx
  <AlbumSearchBox
    placeholder="Find an album to add a sticker..."
    onAlbumSelect={(albumId) => console.log("Selected album:", albumId)}
    onUrlSubmit={(url) => console.log("URL pasted:", url)}
  />
  ```

#### Usage Flow:

**Searching by Album Name:**
1. User starts typing an album name (e.g., "Abbey Road")
2. After 3 characters, search results appear automatically
3. Up to 5 albums shown with name and artist
4. User clicks a result
5. `onAlbumSelect` callback fires with the album ID

**Pasting URL:**
1. User pastes a Navidrome album URL (e.g., "https://music.yabbyville.xyz/app/#/album/123/show")
2. Search is automatically disabled (URL detected)
3. Send button appears
4. User clicks send or presses Enter
5. `onUrlSubmit` callback fires with the URL

#### Integration:

This component is used by `PlaceSticker.tsx` in both `url-input` and `inline-url` modes to provide a flexible album selection experience.

### UserMessages

The `UserMessages` component is used to display messages from users. It's used for displaying the stickers and also for the messageboard. It includes their username, message content, timestamp, and an optional sticker (emoji or image). It also supports a close button for dismissing the message.

#### Props:
- **username**: The name of the user sending the message.
- **message**: The content of the message. This renders HTML links so long as the link points to yabbyville.xyz.
- **timestamp**: The time the message was sent.
- **userSticker**: An optional sticker (emoji or image URL) to represent the user.
- **onClose**: A callback function triggered when the close button is clicked.
- **hideCloseButton**: A boolean to hide the close button (default: `false`).
- **reactions**: An optional array of reaction objects (each containing `userId`, `username`, `timestamp`) for displaying who reacted to the message.
- **reactionCount**: An optional number indicating the total number of reactions.
- **currentUserReacted**: An optional boolean indicating if the current user has reacted to the message.
- **onToggleReaction**: An optional callback function triggered when the user clicks the heart reaction button.

#### Example:

- **Basic UserMessage**:
  ```tsx
  <UserMessage
  username="JaneDoe"
  message="Check out my new avatar!"
  timestamp="2025-09-21 11:00 AM"
  userSticker="/Stickers/avatar.webp"
  onClose={() => console.log("Message closed")}
  />
  ```

- **UserMessage with Reactions**:
  ```tsx
  <UserMessage
  username="JaneDoe"
  message="Check out my new album!"
  timestamp="2025-09-21 11:00 AM"
  userSticker="/Stickers/avatar.webp"
  onClose={() => console.log("Message closed")}
  reactions={[{ userId: '123', username: 'John', timestamp: {} }]}
  reactionCount={1}
  currentUserReacted={false}
  onToggleReaction={() => console.log("Reaction toggled")}
  />
  ```

## Complex Components

### AvatarPreview
Used to add the dropdown menu that lets users change their profile image on the profile page

### CarouselAlbums
Fetches the 10 most recent albums from Navidrome and displays them in the basic `Carousel.tsx` component.

### CarouselStickers
Fetches the 10 most recent stickers and displays them in the `Carousel.tsx` component. Once the 10 most recent stickers are fetched it will also fetch any other stickers that have been put on those 10 albums.

Sticker information displayed using the `UserMessages.tsx` component

### MessageBoard
Handles all the code for the messageboard. Uses the `UserMessages.tsx` and the `ForumMessageBox.tsx` component.

#### Props:
- **enableReactions**: A boolean to enable heart reactions on messages (default: `false`). When enabled, users can react to messages with a heart, and see who else has reacted.

#### Features:
- **Heart Reactions**: Users can react to messages once by clicking/tapping the heart icon. Clicking again removes their reaction.
- **Reaction Count**: Displays the total number of reactions on each message.
- **Reaction Tooltip**:
  - Desktop: Hover over the reaction area to see usernames
  - Mobile: Long press the reaction area (hold for 500ms) to see usernames
- **Real-time Updates**: Reactions are stored in Firestore subcollections and update in real-time.

#### Example:
```tsx
// Without reactions (default)
<MessageBoard />

// With reactions enabled
<MessageBoard enableReactions={true} />
```

### PlaceSticker & PlaceStickerCore

The `PlaceSticker` component is a unified system for adding stickers to albums across the entire application. It has been refactored to eliminate code duplication and provide three different modes of operation.

#### Architecture:

- **PlaceStickerCore.tsx**: The core component containing all shared sticker placement logic (drag & drop, coordinate conversion, Firestore submission, user sticker fetching). This is the single source of truth for sticker placement functionality.

- **PlaceSticker.tsx**: A wrapper component that provides three different modes by utilizing PlaceStickerCore:

#### Modes:

1. **url-input** (Home Page)
   - Shows `AlbumSearchBox` in a styled container
   - User can either search for albums by name OR paste a Navidrome album URL
   - Opens popup with PlaceStickerCore for sticker placement
   ```tsx
   <PlaceSticker /> // defaults to url-input mode
   ```

2. **popup** (CarouselStickers & StickerGrid)
   - Receives pre-loaded album information via props
   - Opens directly in popup mode
   - Includes back button for dual-state popup navigation
   ```tsx
   <PlaceSticker
     mode="popup"
     albumInfo={selectedAlbum}
     isVisible={true}
     onClose={handleClose}
     onBack={handleBack}
     showBackButton={true}
   />
   ```

3. **inline-url** (Stickers Page)
   - Shows `AlbumSearchBox` without container styling
   - User can search for albums by name OR paste URL
   - Opens popup with PlaceStickerCore when album is selected
   ```tsx
   <PlaceSticker mode="inline-url" />
   ```

#### Features:
- **Album Search**: Type album names to search and select from Navidrome library (powered by `AlbumSearchBox`)
- **URL Support**: Paste Navidrome album URLs for quick album selection
- **Drag and Drop**: Interactive sticker positioning on album covers
- **Normalized Coordinates**: Consistent positioning across all screen sizes
- **Real-time Updates**: Visual feedback during sticker placement
- **Firebase Integration**: Sticker storage and retrieval via Firestore
- **User Stickers**: Automatic fetching of user's selected avatar/sticker
- **Auto-refresh**: Page reloads on successful submission to show new sticker

#### Components Using PlaceSticker:
- **Home Page**: Uses `url-input` mode for standalone sticker placement
- **CarouselStickers**: Uses `popup` mode when clicking "Place Sticker on Album"
- **StickerGrid**: Uses `popup` mode when clicking "Place Sticker on Album"
- **Stickers Page**: Uses `inline-url` mode for quick sticker placement at top of page

### StickerGrid
The `StickerGrid` component displays all albums that have stickers on them in a grid layout. It fetches stickers from Firestore, groups them by album, and shows the album covers with stickers overlaid at their saved positions. The component supports two sorting modes (chronological and shuffle) and includes pagination for better performance.

#### Props:
- **sortMode**: `'chronological' | 'shuffle'` - Controls how albums are sorted in the grid
- **shuffleKey**: A number that triggers a re-shuffle when changed

The component uses the `UserMessages.tsx` component to display sticker messages in the popup and the `MessageTextBox.tsx` component for adding new stickers.

### PrivateRoute
Allows the website to be kept secure. Prevents someone not logged into the site from accessing anything other than the login page.

### Stats
Fetches statistics about the Navidrome server like the number of albums. Also contains the dancing ascii man.

### WikiParser
Allows the information from the wiki.html file to be passed into the wiki page. Doesn't currently work very well tbh as it doesn't scale with the page width for unknown reasons.




## Progressive Web App (PWA)

YabbyVille is a Progressive Web App, which means users can install it on their devices and use it like a native app

### Installation Instructions:

**Android/Chrome:**
1. Visit the deployed site
2. Tap the "Add to Home Screen" prompt or browser menu
3. Tap "Install"

**iOS/Safari:**
1. Visit the deployed site
2. Tap the Share button
3. Scroll down and tap "Add to Home Screen"
4. Tap "Add"

**Desktop (Chrome/Edge):**
1. Visit the deployed site
2. Look for install icon in address bar or browser menu
3. Click "Install YabbyVille"

### PWA Implementation Files:

The PWA functionality is implemented through the following key files:

- **`vite.config.ts`**
  Configures the `vite-plugin-pwa` plugin with manifest settings, caching strategies, and service worker options. Defines which assets to cache and how API requests should be handled.

- **`src/main.tsx`**
  Registers the service worker when the app loads and handles update prompts and offline notifications.

- **`src/vite-env.d.ts`**
  TypeScript type declarations for the PWA virtual modules.

- **`index.html`**
  Contains PWA meta tags for theme colors, manifest link, and iOS-specific meta tags for home screen installation.

- **`public/manifest.json`**
  Web app manifest defining app name, icons, theme colors, and display mode for installation.

- **`public/icons/`**
  Contains app icons in various sizes:
  - `icon-192x192.png` - Standard PWA icon
  - `icon-512x512.png` - Large PWA icon
  - `apple-touch-icon.png` - iOS home screen icon (180x180)

### Technical Details:
- Service worker automatically caches stickers, fonts, and app assets
- API requests to music.yabbyville.xyz are cached with NetworkFirst strategy
- Manifest configured for standalone display with custom theme colors
- Icons optimized for all platforms (192x192, 512x512, Apple touch icon)
- Auto-generated service worker handles precaching and runtime caching via Workbox

## Packages Used

- **react-router-dom**
  This package is used to handle routing within the application. It allows for navigation between different pages or components without requiring a full page reload, enabling a seamless single-page application (SPA) experience. Features like `useNavigate` and `Route` make it easy to manage navigation and define routes in the app.

- **react_icons**
  This package is used for adding basic icons like the close button, arrows, and other visual elements to enhance the user interface.

- **firebase**
  Firebase is used for authentication and backend services in the app. It simplifies user authentication, database management, and other backend functionalities, allowing for a seamless integration of these features into the application.

- **react-firebase-hooks**
  This package provides a set of reusable React hooks for Firebase. It simplifies the integration of Firebase services like authentication, Firestore, and Realtime Database into React applications. For example, the `useAuthState` hook is used to track the authentication state of the user, making it easy to determine if a user is logged in or not. This reduces boilerplate code and improves the readability of the app.

- **embla-carousel-react**
  This package is used to create highly customizable and performant carousels in the application. It provides a lightweight and flexible carousel solution with smooth scrolling and touch support. Embla makes it easy to implement sliders for showcasing images, content, or other interactive elements.

- **html-react-parser**

  The `html-react-parser` package is used to safely convert HTML strings into React elements. It's used here for the Wiki Page so that it can be easily downloaded from google docs and updated.

- **react-simple-wysiwyg**

  This package provides a simple WYSIWYG (What You See Is What You Get) rich text editor for React. It's used in the `ForumMessageBox` component to allow users to create formatted messages with bold, italic, links, and other text styling options. The editor outputs HTML that can be stored and displayed with formatting intact.

- **vite-plugin-pwa**

  This Vite plugin enables Progressive Web App (PWA) functionality with zero-config service worker generation. It uses Workbox under the hood to create a service worker that precaches app assets and provides offline support. The plugin generates the web app manifest and handles service worker registration automatically. It's configured to cache all stickers, fonts, and API requests for optimal performance and offline capability. 
