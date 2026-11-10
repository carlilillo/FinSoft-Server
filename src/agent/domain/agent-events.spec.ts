import { mapAgentChunk } from './agent-events.js';

describe('mapAgentChunk', () => {
  it('maps triage tool calls and subagent delegation from the coordinator', () => {
    const message = {
      type: 'ai',
      content: 'Delegating the Iberdrola invoice.',
      tool_calls: [
        { id: '1', name: 'record_triage', args: { emailId: 'E1', verdict: 'likely_invoice' } },
        { id: '2', name: 'task', args: { subagent_type: 'invoice-extractor', description: 'emailId: E1' } },
      ],
    };
    const events = mapAgentChunk([], 'updates', { model_request: { messages: [message] } });

    expect(events.map((event) => event.event)).toEqual(['agent.message', 'tool.called', 'subagent.started']);
    expect(events[2]).toMatchObject({ agent: 'invoice-triage', subagent: 'invoice-extractor', task: 'emailId: E1' });
  });

  it('attributes subgraph chunks to the extractor and flags tool errors', () => {
    const result = { type: 'tool', content: 'Error (INVOICE_TOTALS_MISMATCH): …', tool_call_id: '3', name: 'save_invoice' };
    const [event] = mapAgentChunk(['tools:abc'], 'updates', { tools: { messages: [result] } });
    expect(event).toMatchObject({ event: 'tool.result', agent: 'invoice-extractor', tool: 'save_invoice', isError: true });
  });

  it('reports todo updates and subagent results', () => {
    const done = { type: 'tool', content: '01J… — Iberdrola — 106.00 EUR — 3 lines', tool_call_id: '2', name: 'task' };
    const events = mapAgentChunk([], 'updates', {
      'TodoListMiddleware.after_model': { todos: [{ content: 'Triage batch', status: 'completed' }] },
      tools: { messages: [done] },
    });
    expect(events).toEqual([
      { event: 'todos.updated', agent: 'invoice-triage', todos: '[completed] Triage batch' },
      { event: 'subagent.finished', agent: 'invoice-triage', result: '01J… — Iberdrola — 106.00 EUR — 3 lines' },
    ]);
  });

  it('passes custom writer events through and ignores other modes', () => {
    expect(mapAgentChunk([], 'custom', { event: 'invoice.saved' })).toEqual([
      { event: 'custom', agent: 'invoice-triage', payload: { event: 'invoice.saved' } },
    ]);
    expect(mapAgentChunk([], 'messages', {})).toEqual([]);
  });

  it('attributes every chunk of an imported-document thread to the document extractor', () => {
    const message = { type: 'ai', content: 'NOT_AN_INVOICE: a quote', tool_calls: [] };
    const [event] = mapAgentChunk(['tools:abc'], 'updates', { model_request: { messages: [message] } }, 'document-extractor');
    expect(event).toMatchObject({ event: 'agent.message', agent: 'document-extractor', text: 'NOT_AN_INVOICE: a quote' });
  });
});
