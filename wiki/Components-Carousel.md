# Carousel

**File:** `src/components/basic/Carousel.tsx`

A slider component built on [Embla Carousel](https://www.embla-carousel.com/). Used by `CarouselAlbums` and `CarouselStickers`.

## Props

- `slides` - array of React elements to display as slides
- `loop` - enable infinite looping (default: `false`)
- `autoplay` - enable automatic slide transitions (default: `false`)
- `autoplayDelay` - milliseconds between transitions (default: `4000`)

## Usage

```tsx
<Carousel
  slides={[<img src="a.jpg" />, <img src="b.jpg" />]}
  loop={true}
  autoplay={true}
  autoplayDelay={3000}
/>
```

Navigation arrows use the `Button` component with `arrow-left` and `arrow-right` types.
