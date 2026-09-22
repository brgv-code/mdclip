export interface ClipboardContent {
  text?: string | null;
  html?: string | null;
  rtf?: string | null;
}

export interface ClipboardAdapter {
  read(): Promise<ClipboardContent>;
  write(content: ClipboardContent): Promise<void>;
  /** Simulate the paste keystroke in the frontmost app. */
  paste(): Promise<void>;
}
