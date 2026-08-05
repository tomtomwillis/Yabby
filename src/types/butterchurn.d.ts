declare module 'butterchurn' {
  export interface Visualizer {
    connectAudio(audioNode: AudioNode): void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    loadPreset(preset: any, blendTime?: number): void;
    setRendererSize(width: number, height: number): void;
    render(): void;
  }

  export interface VisualizerOptions {
    width?: number;
    height?: number;
    pixelRatio?: number;
    textureRatio?: number;
  }

  const butterchurn: {
    createVisualizer(
      audioContext: AudioContext,
      canvas: HTMLCanvasElement,
      options: VisualizerOptions,
    ): Visualizer;
  };
  export default butterchurn;
}

declare module 'butterchurn-presets' {
  const butterchurnPresets: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getPresets(): Record<string, any>;
  };
  export default butterchurnPresets;
}
