/**
 * Minimal type declarations for the pdfjs-dist Node (legacy) build.
 *
 * pdfjs-dist 4.9.155 ships no `exports` map and its `types` field covers only
 * the bare entry point, so this subpath has no declarations of its own. Only
 * the members this project uses are declared here.
 */
declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export interface PdfTextItem {
    str: string;
    /** [scaleX, skewX, skewY, scaleY, translateX, translateY] — x is [4], y is [5]. */
    transform: number[];
    width: number;
    height: number;
    hasEOL: boolean;
  }

  export interface PdfTextContent {
    items: Array<PdfTextItem | { type: string }>;
  }

  export interface PdfPageProxy {
    getTextContent(): Promise<PdfTextContent>;
    cleanup(): void;
  }

  export interface PdfDocumentProxy {
    numPages: number;
    getPage(pageNumber: number): Promise<PdfPageProxy>;
    destroy(): Promise<void>;
  }

  export interface GetDocumentParameters {
    data?: Uint8Array;
    password?: string;
    useSystemFonts?: boolean;
    disableFontFace?: boolean;
    useWorkerFetch?: boolean;
    isEvalSupported?: boolean;
  }

  export function getDocument(src: GetDocumentParameters): { promise: Promise<PdfDocumentProxy> };
}
