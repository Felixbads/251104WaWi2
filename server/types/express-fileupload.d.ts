declare module 'express-fileupload' {
  import { Request } from 'express';

  interface UploadedFile {
    name: string;
    data: Buffer;
    size: number;
    encoding: string;
    tempFilePath: string;
    truncated: boolean;
    mimetype: string;
    md5: string;
    mv(path: string, callback: (err?: any) => void): void;
    mv(path: string): Promise<void>;
  }

  interface FileUploadRequestHandler {
    (req: Request, res: Response, next: NextFunction): void;
  }

  interface Options {
    abortOnLimit?: boolean;
    createParentPath?: boolean;
    debug?: boolean;
    limitHandler?: ((req: Request, res: Response, next: NextFunction) => void) | boolean;
    parseNested?: boolean;
    preserveExtension?: boolean | number;
    responseOnLimit?: string;
    safeFileNames?: boolean | RegExp;
    tempFileDir?: string;
    uploadTimeout?: number;
    useTempFiles?: boolean;
    uriDecodeFileNames?: boolean;
  }

  function fileUpload(options?: Options): FileUploadRequestHandler;

  export = fileUpload;
  export { UploadedFile };
}