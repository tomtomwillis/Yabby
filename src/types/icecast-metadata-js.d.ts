declare module 'icecast-metadata-js' {
  export class IcecastReadableStream {
    constructor(
      response: Response,
      options: {
        onMetadata?: (metadata: { metadata: { StreamTitle?: string } }) => void;
        onStream?: (value: { stream: Uint8Array }) => void;
        onError?: (error: Error) => void;
        metadataTypes?: string[];
        icyDetectionTimeout?: number;
      }
    );
    get icyMetaInt(): number;
    get readableStream(): ReadableStream;
    startReading(): Promise<void>;
    static asyncIterator(readableStream: ReadableStream): AsyncIterable<Uint8Array>;
  }

  export class IcecastMetadataReader {
    constructor(options: {
      onMetadata?: (value: { metadata: { StreamTitle?: string } }) => void;
      onStream?: (value: { stream: Uint8Array }) => void;
      onError?: (error: Error) => void;
      icyMetaInt?: number;
      icyDetectionTimeout?: number;
      metadataTypes?: string[];
    });
    readAll(chunk: Uint8Array): void;
    asyncReadAll(chunk: Uint8Array): Promise<void>;
  }
}
