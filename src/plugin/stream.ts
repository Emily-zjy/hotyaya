import type { RunEvent } from "../shared/protocol";
export class EventDecoder {
  private buffer = "";
  constructor(private emit: (event: RunEvent) => void) {}
  feed(chunk: string): void {
    this.buffer += chunk;
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const block = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      if (data) this.emit(JSON.parse(data) as RunEvent);
    }
    if (this.buffer.length > 4_000_000) throw new Error("流式响应过大。");
  }
}
