# YabbyVilleV2 Documentation

## Colours
Colours are set by the list of colours in the App.css file. If the colours are updated there then they should update across the whole app. 

The colours are:
-  --colour1: #4CAF50;
-  --colour2: #0000FF;
-  --colour3: #FF9F65;
-  --colour4: #FFFFFF;
-  --colour5: #333333;

Colours will be referred to throughout the app like this
`var(--colour1)`

## Text Animations

### Available Animations

#### Floating Effects

- **`float-gentle`** - Smooth up and down movement (8px range, 3s duration)
- **`float-subtle`** - More subtle floating (4px range, 4s duration)

```tsx
<h2 className="animated-text float-gentle">Gently floating title</h2>
<p className="animated-text float-subtle">Subtly floating paragraph</p>
```

#### Breathing Effects

- **`breathe`** - Gentle scaling animation (2% size change, 2.5s duration)
- **`breathe-opacity`** - Subtle opacity pulsing (20% opacity change, 3s duration)

```tsx
<span className="animated-text breathe">Breathing text</span>
<div className="animated-text breathe-opacity">Fading in and out</div>
```

#### Drift Effects

- **`drift-horizontal`** - Left to right gentle movement (6px range, 5s duration)
- **`drift-circular`** - Small circular motion (6px diameter, 6s duration)

```tsx
<h3 className="animated-text drift-horizontal">Drifting sideways</h3>
<p className="animated-text drift-circular">Moving in circles</p>
```

#### Hover Effects

- **`hover-lift`** - Lifts up on mouse hover with subtle shadow
- **`hover-glow`** - Adds glow effect and slight scale on hover

```tsx
<button className="animated-text hover-lift">Hover to lift</button>
<a className="animated-text hover-glow">Hover for glow</a>
```

#### Wave Effects

- **`wave-rotate`** - Very subtle rotation wave (0.5° rotation, 4s duration)

```tsx
<h1 className="animated-text wave-rotate">Gently rotating wave</h1>
```

## Combination Classes

Use multiple animation effects together:

- **`float-breathe`** - Combines floating and breathing effects
- **`drift-fade`** - Combines horizontal drift with opacity breathing

```tsx
<h2 className="animated-text float-breathe">Floating and breathing</h2>
<p className="animated-text drift-fade">Drifting with fade</p>
```

## Speed Modifiers

Adjust animation speed with modifier classes:

- **`slow`** - 6 second duration
- **`fast`** - 1.5 second duration  
- **`very-slow`** - 8 second duration

```tsx
<h1 className="animated-text float-gentle slow">Slow floating</h1>
<span className="animated-text breathe fast">Fast breathing</span>
```

#### Pause on Hover

Add `pause-on-hover` to freeze animations when users hover:

```tsx
<h1 className="animated-text float-gentle pause-on-hover">
  Pauses when you hover
</h1>
```

#### Custom Combinations

Mix and match any classes for unique effects:

```tsx
<h1 className="animated-text float-gentle breathe-opacity slow delay-1">
  Complex multi-effect animation
</h1>
```


## Components
### Button

The `Button` component supports the following props, allowing for flexible customization:

- **`label`** (optional):  
  A string that specifies the text displayed on the button. This is typically used for `basic` buttons but is not required for `close`, `arrow-left`, or `arrow-right` button types.

- **`onClick`** (optional):  
  A function that is triggered when the button is clicked. Use this to define the button's behavior.

- **`type`** (optional):  
  A string that specifies the type of button. The available types are:
  - `'basic'`: A standard button with a label.
  - `'close'`: A circular button, often used to close modals or dialogs.
  - `'arrow-left'`: A button styled with a left arrow icon.
  - `'arrow-right'`: A button styled with a right arrow icon.

- **`className`** (optional):  
  A string that allows you to add custom CSS classes for additional styling.

- **`disabled`** (optional):  
  A boolean that disables the button when set to `true`. Disabled buttons cannot be clicked and are styled accordingly.

- **`size`** (optional):  
  A string that specifies the size of the button. You can use values like `"3em"` or `"50px"` to adjust the button's dimensions.

These props make the `Button` component versatile and reusable across different parts of the application.


- **Basic Button**: Styled with `basic-button` class.
  - Example:
    ```jsx
    <Button label="Sign In" onClick={handleClick} />
    ```

- **Close Button**: Circular button styled with `close-button` class.
  - Example:
    ```jsx
    <Button type="close" onClick={handleClick} className="custom-close-button" />
    ```

- **Arrow Buttons**
  - Example (Left Arrow):
    ```jsx
    <Button type="arrow-left" onClick={handleClick} className="custom-arrow-button" />
    ```
  - Example (Right Arrow):
    ```jsx
    <Button type="arrow-right" onClick={handleClick} className="custom-arrow-button" />
    ```

## Carousel Component

The `Carousel` component is a reusable and customizable carousel/slider for displaying content such as images or other elements - used here for the album covers. It is built using the `embla-carousel-react` library for smooth scrolling and touch support.

The idea is that the same component can be used in different situations so only one file needs editing and all carousels will look the same. The carousel.tsx is the base and then the AlbumCarousel component can use that, fed with the Navidrom API info.

### Props

- **`slides`** (required):  
  An array of React nodes to be displayed as slides in the carousel.

- **`loop`** (optional):  
  A boolean to enable or disable infinite scrolling. Default is `false`.

- **`autoplay`** (optional):  
  A boolean to enable or disable autoplay functionality. Default is `false`.

- **`autoplayDelay`** (optional):  
  A number specifying the delay (in milliseconds) between autoplay transitions. Default is `4000`.

### Example Usage

```tsx
import Carousel from "./components/Carousel";

const slides = [
  <img src="image1.jpg" alt="Slide 1" />,
  <img src="image2.jpg" alt="Slide 2" />,
  <img src="image3.jpg" alt="Slide 3" />,
];

<Carousel slides={slides} loop={true} autoplay={true} autoplayDelay={3000} />;
```

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

## html-react-parser

The `html-react-parser` package is used to safely convert HTML strings into React elements. It's used here for the Wiki Page so that it can be easily downloaded from google docs and updated. 
