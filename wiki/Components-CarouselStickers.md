# CarouselStickers

**File:** `src/components/CarouselStickers.tsx`

Fetches the 10 most recent stickers from Firestore and displays them in a `Carousel`. Also fetches any other stickers placed on those same albums so the popup view is complete.

No props. Used on the Home page.

```tsx
<CarouselStickers />
```

Clicking a sticker card opens a popup showing all stickers on that album, with a "Place Sticker" button using `PlaceSticker` in `popup` mode.
