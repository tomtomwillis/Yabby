declare module 'webamp/butterchurn' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const WebampWithButterchurn: any;
  export default WebampWithButterchurn;
}

declare module 'butterchurn' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const butterchurn: any;
  export default butterchurn;
}

declare module 'butterchurn-presets' {
  const presets: Record<string, object>;
  export default presets;
}
