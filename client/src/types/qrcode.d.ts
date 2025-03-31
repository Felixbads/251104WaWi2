declare module 'qrcode' {
  interface QRCodeOptions {
    version?: number;
    errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    margin?: number;
    scale?: number;
    width?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  }

  function toDataURL(text: string, options?: QRCodeOptions): Promise<string>;
  function toCanvas(canvas: HTMLCanvasElement, text: string, options?: QRCodeOptions): Promise<void>;
  function toString(text: string, options?: QRCodeOptions): Promise<string>;

  export { toDataURL, toCanvas, toString };
  export default { toDataURL, toCanvas, toString };
}