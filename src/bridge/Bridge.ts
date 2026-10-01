import { AgentAdapter } from "../agents/AgentAdapter.js";
import { TaskEnvelope } from "../protocol/TaskEnvelope.js";
import { AgentResult } from "../protocol/AgentResult.js";
import { FileStateStore } from "../state/FileStateStore.js";

export class Bridge {
  private stateStore: FileStateStore;

  constructor(stateStore: FileStateStore) {
    this.stateStore = stateStore;
  }

  /**
   * Executes a single task envelope with the designated agent adapter,
   * normalizes the output, and persists the task and result to state store.
   */
  public async executeStep(
    task: TaskEnvelope,
    adapter: AgentAdapter
  ): Promise<AgentResult> {
    // 1. Persist current task envelope
    await this.stateStore.saveTask(task);

    // 2. Execute via adapter
    const result = await adapter.execute(task);

    // 3. Persist raw agent output to logs if available
    if (result.rawOutput) {
      await this.stateStore.saveLog(adapter.name, task.taskId, result.rawOutput);
    }

    // 4. Persist structured result
    await this.stateStore.saveResult(result);

    return result;
  }
}
