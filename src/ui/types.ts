import type { Action, Artifact, RunEvent } from "../shared/protocol";
import type { Snapshot } from "../plugin/edits";
export interface CompanionHost {
  capture(): Snapshot;
  run(
    action: Action,
    instruction: string,
    snapshot: Snapshot,
    history: { role: "user" | "assistant"; content: string }[],
    emit: (event: RunEvent) => void,
    signal: AbortSignal,
  ): Promise<void>;
  apply(snapshot: Snapshot, text: string): void;
  undo(): void;
  /** Save into the vault next to the source note; returns the vault path. */
  saveArtifact(artifact: Artifact, snapshot?: Snapshot): Promise<string>;
  /** Browser-style download through the system "Save as" dialog. */
  downloadArtifact(artifact: Artifact): Promise<void>;
  openFile(file: string): Promise<void>;
  insertArtifact?(artifact: Artifact, snapshot: Snapshot): Promise<void>;
  previewArtifact(artifact: Artifact): Promise<void>;
  /** Local object URL for showing a generated image inline. */
  artifactUrl?(artifact: Artifact): Promise<string>;
  openSettings(): void;
  setQuiet(quiet: boolean): void;
  isQuiet(): boolean;
  petUrl(state: "idle" | "busy" | "reading" | "success" | "error"): string;
  disable(): void;
  /** Restores the conversation after switching notes and back. */
  session?: { load(): ChatSession | undefined; save(state: ChatSession): void };
}
/** Per-note chat state kept by the plugin while Obsidian runs. */
export interface ChatSession {
  messages: unknown[];
  open: boolean;
}
export interface CompanionHandle {
  open(action?: Action, snapshot?: Snapshot): void;
  /** A reading comment from the plugin; "error" when it could not be produced. */
  comment(text: string, tone?: "ok" | "error"): void;
  busy(value: boolean): void;
}
