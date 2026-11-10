/**
 * Pure mapping from LangGraph stream chunks (streamMode ["updates", "custom"], subgraphs: true)
 * to flat, human-readable log events. Nothing here touches I/O.
 */

export type AgentName = 'invoice-triage' | 'invoice-extractor';

export type AgentLogEvent =
  | { event: 'agent.message'; agent: AgentName; text: string }
  | { event: 'agent.reasoning'; agent: AgentName; text: string }
  | { event: 'tool.called'; agent: AgentName; tool: string; args: string }
  | { event: 'tool.result'; agent: AgentName; tool: string; result: string; isError: boolean }
  | { event: 'subagent.started'; agent: AgentName; subagent: string; task: string }
  | { event: 'subagent.finished'; agent: AgentName; result: string }
  | { event: 'todos.updated'; agent: AgentName; todos: string }
  | { event: 'custom'; agent: AgentName; payload: Record<string, unknown> };

const MAX_FIELD_CHARS = 400;

interface MessageLike {
  type?: string;
  _getType?: () => string;
  name?: string;
  content?: unknown;
  tool_calls?: Array<{ name: string; args: unknown }>;
  additional_kwargs?: { reasoning?: { summary?: Array<{ text?: string }> } };
}

interface TodoLike {
  content?: string;
  status?: string;
}

export function agentForNamespace(namespace: string[]): AgentName {
  return namespace.some((segment) => segment.startsWith('tools:') || segment.startsWith('task')) ? 'invoice-extractor' : 'invoice-triage';
}

export function mapAgentChunk(namespace: string[], mode: string, data: unknown): AgentLogEvent[] {
  const agent = agentForNamespace(namespace);
  if (mode === 'custom') return isRecord(data) ? [{ event: 'custom', agent, payload: data }] : [];
  if (mode !== 'updates' || !isRecord(data)) return [];

  const events: AgentLogEvent[] = [];
  for (const update of Object.values(data)) {
    if (!isRecord(update)) continue;
    if (Array.isArray(update.todos)) events.push({ event: 'todos.updated', agent, todos: formatTodos(update.todos as TodoLike[]) });
    const messages = Array.isArray(update.messages) ? (update.messages as MessageLike[]) : [];
    for (const message of messages) events.push(...mapMessage(agent, message));
  }
  return events;
}

function mapMessage(agent: AgentName, message: MessageLike): AgentLogEvent[] {
  const type = message.type ?? message._getType?.();
  if (type === 'ai') return mapAiMessage(agent, message);
  if (type === 'tool') {
    const result = textOf(message.content);
    if (message.name === 'task') return [{ event: 'subagent.finished', agent, result: truncate(result) }];
    return [{ event: 'tool.result', agent, tool: message.name ?? 'unknown', result: truncate(result), isError: result.startsWith('Error') }];
  }
  return [];
}

function mapAiMessage(agent: AgentName, message: MessageLike): AgentLogEvent[] {
  const events: AgentLogEvent[] = [];
  const reasoning = reasoningOf(message);
  if (reasoning) events.push({ event: 'agent.reasoning', agent, text: truncate(reasoning) });

  const text = textOf(message.content);
  if (text) events.push({ event: 'agent.message', agent, text: truncate(text) });

  for (const call of message.tool_calls ?? []) {
    if (call.name === 'task' && isRecord(call.args)) {
      events.push({
        event: 'subagent.started',
        agent,
        subagent: typeof call.args.subagent_type === 'string' ? call.args.subagent_type : 'unknown',
        task: truncate(typeof call.args.description === 'string' ? call.args.description : ''),
      });
      continue;
    }
    events.push({ event: 'tool.called', agent, tool: call.name, args: truncate(JSON.stringify(call.args)) });
  }
  return events;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => (isRecord(block) && block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .join('')
    .trim();
}

function reasoningOf(message: MessageLike): string {
  const fromKwargs = message.additional_kwargs?.reasoning?.summary?.map((part) => part.text ?? '').join(' ') ?? '';
  if (fromKwargs.trim()) return fromKwargs.trim();
  if (!Array.isArray(message.content)) return '';
  return message.content
    .map((block) => (isRecord(block) && block.type === 'reasoning' && typeof block.reasoning === 'string' ? block.reasoning : ''))
    .join(' ')
    .trim();
}

function formatTodos(todos: TodoLike[]): string {
  return todos.map((todo) => `[${todo.status ?? '?'}] ${todo.content ?? ''}`).join(' | ');
}

function truncate(value: string): string {
  return value.length > MAX_FIELD_CHARS ? `${value.slice(0, MAX_FIELD_CHARS)}…` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
