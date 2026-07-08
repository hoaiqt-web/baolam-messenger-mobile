import type { ChatGeneratedTask } from '@/Models/chat/types';

/** Read generated_tasks from API message (snake_case or camelCase). */
export function extractGeneratedTasks(item: Record<string, unknown>): ChatGeneratedTask[] {
  const raw = item.generated_tasks ?? item.generatedTasks;
  return Array.isArray(raw) ? (raw as ChatGeneratedTask[]) : [];
}
