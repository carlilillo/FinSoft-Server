declare module 'heic-decode' {
  interface DecodedHeicImage {
    width: number;
    height: number;
    /** RGBA pixels. */
    data: Uint8ClampedArray;
  }

  function decode(input: { buffer: Uint8Array }): Promise<DecodedHeicImage>;
  export default decode;
}
