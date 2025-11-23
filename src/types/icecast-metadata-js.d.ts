declare module 'icecast-metadata-js' {
  export class IcecastMetadataReader {
    constructor(options: any);
    asyncReadAll(chunk: Uint8Array): Promise<void>;
  }
}
