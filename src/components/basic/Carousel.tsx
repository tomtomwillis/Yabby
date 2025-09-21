import React, { useRef, useCallback } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import Button from "./Button";
import "./Carousel.css";

interface CarouselProps {
  slides: React.ReactNode[];
  loop?: boolean;
  autoplay?: boolean;
  autoplayDelay?: number;
}

export const Carousel: React.FC<CarouselProps> = ({
  slides,
  loop = false,
  autoplay = false,
  autoplayDelay = 4000,
}) => {
  const autoplayPlugin = useRef(
    Autoplay({ delay: autoplayDelay, stopOnInteraction: false })
  );
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop, align: "start" }, // align start helps with multiple slides per view
    autoplay ? [autoplayPlugin.current] : []
  );

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  return (
    <div className="carousel" ref={emblaRef}>
      <div className="carousel__container">
        {slides.map((slide, i) => (
          <div className="carousel__slide" key={i}>
            {slide}
          </div>
        ))}
      </div>

      <div className="carousel__buttons">
        <Button type="arrow-left" onClick={scrollPrev} />
        <Button type="arrow-right" onClick={scrollNext} />
      </div>
    </div>
  );
};


export default Carousel;