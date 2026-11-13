import { App, ButtonComponent, Modal } from "obsidian";

export interface CorrectionOutcome {
  status: "applied" | "unchanged" | "skipped" | "failed";
  reason: string;
  stopBatch?: boolean;
  retryable?: boolean;
}

export interface NoteResult extends CorrectionOutcome {
  path: string;
}

export interface CorrectionBatch {
  total: number;
  results: NoteResult[];
  running: boolean;
  stopped: boolean;
  stopReason: string;
}

export function batchSummary(batch: CorrectionBatch): string {
  const count = (status: CorrectionOutcome["status"]) => batch.results.filter(result => result.status === status).length;
  return `${batch.results.length}/${batch.total} notes: ${count("applied")} applied, ${count("unchanged")} unchanged, ${count("skipped")} skipped, ${count("failed")} failed.`;
}

/** Manual view only. Paths and outcomes stay in memory and are never sent to diagnostics. */
export class CorrectionResultsModal extends Modal {
  private timer: number | null = null;
  constructor(app: App, private batch: CorrectionBatch, private stop: () => void, private retry: () => void) { super(app); }
  onOpen(): void {
    this.render();
    this.timer = window.setInterval(() => this.render(), 1000);
  }
  onClose(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.contentEl.empty();
  }
  private render(): void {
    const root = this.contentEl;
    // Keep controls and the scrolling results list in place while progress updates.
    if (!root.querySelector(".culebra-batch-summary")) {
      root.createEl("h2", { text: "Culebra note results" });
      root.createEl("p", { cls: "culebra-batch-summary", attr: { "aria-live": "polite" } });
      root.createEl("p", { cls: "culebra-batch-state" });
      const actions = root.createDiv();
      new ButtonComponent(actions).setButtonText("Stop remaining notes").onClick(() => { this.stop(); this.render(); }).buttonEl.addClass("culebra-batch-stop");
      new ButtonComponent(actions).setButtonText("Retry failed notes").onClick(() => { this.close(); this.retry(); }).buttonEl.addClass("culebra-batch-retry");
      root.createDiv({ cls: "culebra-batch-results" });
      root.createEl("p", { text: "Results are kept until the next run or plugin reload. A stopped run lets its active correction finish. Billing or write failures that may have charged are excluded from automatic retry." });
    }
    const summary = root.querySelector<HTMLElement>(".culebra-batch-summary")!;
    const text = batchSummary(this.batch);
    if (summary.textContent !== text) summary.setText(text);
    root.querySelector<HTMLElement>(".culebra-batch-state")!.setText(this.batch.running ? (this.batch.stopped ? "Stopping after the active note." : "Run in progress.") : this.batch.stopReason || "Run finished.");
    root.querySelector<HTMLButtonElement>(".culebra-batch-stop")!.disabled = !this.batch.running || this.batch.stopped;
    root.querySelector<HTMLButtonElement>(".culebra-batch-retry")!.disabled = this.batch.running || !this.batch.results.some(result => result.status === "failed" && result.retryable);
    const list = root.querySelector<HTMLElement>(".culebra-batch-results")!;
    while (list.childElementCount < this.batch.results.length) {
      const result = this.batch.results[list.childElementCount];
      const row = list.createDiv();
      row.createEl("strong", { text: `${result.path}: ${result.status}` });
      row.createEl("p", { text: result.reason });
    }
  }
}
