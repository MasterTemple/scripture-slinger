export {};

// The package's web and bundler entry points export this, but its typings leave it out.
declare module 'logoxide' {
  /** Resolves once the WebAssembly module is loaded. */
  export const initialized: Promise<void>;
}
