import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  ingestSocialVideo, 
  chatWithAI, 
  submitToolResult, 
  Event, 
  ChatContextPayload, 
  ToolCallPayload, 
  initiateGoogleLogin,
  Message,
  AuditLog
} from '../services/api';

interface UnifiedChatProps {
  messages: Message[];
  tripContextPayload: ChatContextPayload;
  onEventAdded: (event: Event) => void;
  onEventRemoved?: (eventId: string) => void;
  onEventUpdated?: (event: Event) => void;
  onBudgetChanged?: (amount: number) => void;
  onSyncCalendar?: () => Promise<void>;
  onPreferencesChanged?: (prefs: string) => void;
  onClearItinerary?: () => void;
  onMemoryUpdated?: (memory: string) => void;
  onAuthRequired?: () => void;
  onMessagesChanged: (messages: Message[]) => void;
  events: Event[];
}

const LOADING_PHRASES = [
  "show my thinking..."
];

interface PendingToolCall {
  toolCall: ToolCallPayload;
  userMessage: string;
  placeholderMsgId: string;
}

export function UnifiedChat({ 
  messages, 
  tripContextPayload, 
  onEventAdded, 
  onEventRemoved, 
  onEventUpdated, 
  onBudgetChanged, 
  onSyncCalendar, 
  onPreferencesChanged, 
  onClearItinerary, 
  onMemoryUpdated, 
  onAuthRequired,
  onMessagesChanged, 
  events 
}: UnifiedChatProps) {
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
  const [pendingToolCall, setPendingToolCall] = useState<PendingToolCall | null>(null);
  const [toolHistory, setToolHistory] = useState<Array<{tool: string, params: any, result: string, timestamp: string}>>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [inputText]);


  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, pendingToolCall]);

  const getToolDisplayInfo = (toolCall: ToolCallPayload) => {
    const p = toolCall.params;
    switch (toolCall.tool_name) {
      case 'add_event':
        return {
          icon: '📅',
          action: 'Add Event',
          details: [
            { label: 'Title', value: p.title },
            p.description && { label: 'Description', value: p.description },
            { label: 'Date', value: p.date },
            { label: 'Time', value: p.time },
            { label: 'Cost', value: `$${Number(p.cost || 0).toFixed(2)}` },
          ].filter(Boolean)
        };
      case 'remove_event': {
        const ev = events.find(e => e.id === p.event_id);
        return {
          icon: '🗑️',
          action: 'Remove Event',
          details: [
            { label: 'Event', value: ev ? ev.description : p.event_id },
          ]
        };
      }
      case 'update_event': {
        const ev = events.find(e => e.id === p.event_id);
        const dets: any[] = [{ label: 'Event', value: ev ? ev.description : p.event_id }];
        if (p.title) dets.push({ label: 'New Title', value: p.title });
        if (p.date) dets.push({ label: 'New Date', value: p.date });
        if (p.time) dets.push({ label: 'New Time', value: p.time });
        if (p.cost !== undefined && p.cost >= 0) dets.push({ label: 'New Cost', value: `$${Number(p.cost).toFixed(2)}` });
        return { icon: '✏️', action: 'Update Event', details: dets };
      }
      case 'set_budget':
        return {
          icon: '💰',
          action: 'Set Budget',
          details: [{ label: 'New Budget', value: `$${Number(p.amount).toFixed(2)}` }]
        };
      case 'sync_calendar':
        return {
          icon: '📤',
          action: 'Sync to Google Calendar',
          details: [
            { label: 'Action', value: 'Push all tentative events to your Google Calendar' },
            p.reason && { label: 'Reason', value: p.reason },
          ].filter(Boolean)
        };
      case 'set_preferences':
        return {
          icon: '⚙️',
          action: 'Update Preferences',
          details: [{ label: 'New Preferences', value: p.preferences }]
        };
      case 'build_itinerary': {
        const evts = (p.events as any[]) || [];
        const totalCost = evts.reduce((sum: number, e: any) => sum + (Number(e.cost) || 0), 0);
        return {
          icon: '🗺️',
          action: `Build Full Itinerary (${evts.length} events)`,
          details: [
            { label: 'Events', value: `${evts.length} activities planned` },
            { label: 'Total Cost', value: `$${totalCost.toFixed(2)}` },
            ...evts.slice(0, 6).map((e: any, i: number) => ({
              label: `${e.date} ${e.time}`,
              value: `${e.title} ($${Number(e.cost || 0).toFixed(2)})`
            })),
            ...(evts.length > 6 ? [{ label: '...', value: `and ${evts.length - 6} more` }] : []),
          ]
        };
      }
      case 'clear_itinerary':
        return {
          icon: '🗑️',
          action: 'Clear Entire Itinerary',
          details: [
            { label: 'Warning', value: `This will delete all ${events.length} events` },
          ]
        };
      default:
        return { icon: '🔧', action: toolCall.tool_name, details: [] };
    }
  };

  const handleApproveToolCall = async () => {
    if (!pendingToolCall) return;
    const { toolCall, userMessage, placeholderMsgId } = pendingToolCall;
    const p = toolCall.params;

    // Execute the mutation locally
    let resultMessage = '';
    switch (toolCall.tool_name) {
      case 'add_event': {
        const dateObj = new Date(`${p.date}T${p.time || '12:00'}`);
        const newEvent: Event = {
          id: Date.now().toString(),
          start_time: dateObj.toISOString(),
          end_time: new Date(dateObj.getTime() + 3600000).toISOString(),
          description: p.title + (p.description ? ` - ${p.description}` : ''),
          cost: Number(p.cost || 0),
          source: 'llm',
          is_confirmed: false
        };
        onEventAdded(newEvent);
        resultMessage = `Event "${p.title}" added successfully for ${p.date} at ${p.time}. Cost: $${Number(p.cost || 0).toFixed(2)}`;
        break;
      }
      case 'remove_event':
        if (onEventRemoved) onEventRemoved(p.event_id);
        resultMessage = `Event removed successfully.`;
        break;
      case 'update_event': {
        const existing = events.find(e => e.id === p.event_id);
        if (existing && onEventUpdated) {
          const updated = { ...existing };
          if (p.title) {
            const parts = updated.description.split('-');
            updated.description = p.title + (parts.length > 1 ? ' -' + parts.slice(1).join('-') : '');
          }
          if (p.description) updated.description = (p.title || updated.description.split('-')[0].trim()) + ' - ' + p.description;
          if (p.date || p.time) {
            const currentDate = new Date(updated.start_time);
            const newDate = p.date ? new Date(`${p.date}T${p.time || currentDate.toTimeString().slice(0, 5)}`) : new Date(`${currentDate.toISOString().slice(0, 10)}T${p.time}`);
            updated.start_time = newDate.toISOString();
            updated.end_time = new Date(newDate.getTime() + 3600000).toISOString();
          }
          if (p.cost !== undefined && p.cost >= 0) updated.cost = Number(p.cost);
          onEventUpdated(updated);
        }
        resultMessage = `Event updated successfully.`;
        break;
      }
      case 'set_budget':
        if (onBudgetChanged) onBudgetChanged(Number(p.amount));
        resultMessage = `Budget changed to $${Number(p.amount).toFixed(2)}.`;
        break;
      case 'sync_calendar':
        if (onSyncCalendar) {
          try {
            await onSyncCalendar();
            resultMessage = `All tentative events have been synced to Google Calendar.`;
          } catch (err: any) {
            if (err.message === 'AUTH_REQUIRED') {
              if (onAuthRequired) onAuthRequired();
              resultMessage = `User needs to connect their Google account. A custom login prompt has been shown.`;
            } else {
              resultMessage = `Calendar sync failed: ${err.message}`;
            }
          }
        }
        break;
      case 'set_preferences':
        if (onPreferencesChanged) onPreferencesChanged(p.preferences);
        resultMessage = `Preferences updated to: ${p.preferences}`;
        break;
      case 'build_itinerary': {
        const batchEvents = (p.events as any[]) || [];
        const addedNames: string[] = [];
        for (const ev of batchEvents) {
          const dateObj = new Date(`${ev.date}T${ev.time || '12:00'}`);
          const newEvent: Event = {
            id: (Date.now() + Math.random() * 10000).toString(),
            start_time: dateObj.toISOString(),
            end_time: new Date(dateObj.getTime() + 3600000).toISOString(),
            description: ev.title + (ev.description ? ` - ${ev.description}` : ''),
            cost: Number(ev.cost || 0),
            source: 'llm',
            is_confirmed: false
          };
          onEventAdded(newEvent);
          addedNames.push(ev.title);
        }
        resultMessage = `Full itinerary built with ${batchEvents.length} events: ${addedNames.join(', ')}`;
        break;
      }
      case 'clear_itinerary':
        if (onClearItinerary) onClearItinerary();
        resultMessage = `All ${events.length} events have been cleared from the itinerary.`;
        break;
    }

    setPendingToolCall(null);

    // Record in tool history for state persistence
    const historyEntry = {
      tool: toolCall.tool_name,
      params: toolCall.params,
      result: resultMessage,
      timestamp: new Date().toISOString()
    };
    setToolHistory(prev => [...prev, historyEntry]);

    // Phase 2: Get the LLM's confirmation message
    try {
      const confirmationText = await submitToolResult(
        userMessage,
        toolCall.tool_name,
        resultMessage,
        tripContextPayload,
        () => { }, // No audit logs needed for the confirmation
        (memory) => {
          if (onMemoryUpdated) onMemoryUpdated(memory);
        }
      );

      // Update the placeholder message with the final text
      onMessagesChanged(messages.map(m =>
        m.id === placeholderMsgId
          ? { ...m, text: confirmationText, audit_trail: [{ agent: 'assistant', message: `Tool executed: ${toolCall.tool_name}` }] }
          : m
      ));
    } catch {
      onMessagesChanged(messages.map(m =>
        m.id === placeholderMsgId
          ? { ...m, text: resultMessage }
          : m
      ));
    }
  };

  const handleRejectToolCall = async () => {
    if (!pendingToolCall) return;
    const { toolCall, userMessage, placeholderMsgId } = pendingToolCall;
    setPendingToolCall(null);

    try {
      const rejectionText = await submitToolResult(
        userMessage,
        toolCall.tool_name,
        "User rejected this action.",
        tripContextPayload,
        () => { }
      );
      onMessagesChanged(messages.map(m =>
        m.id === placeholderMsgId
          ? { ...m, text: rejectionText, audit_trail: [{ agent: 'assistant', message: `❌ User rejected: ${toolCall.tool_name}` }] }
          : m
      ));
    } catch {
      onMessagesChanged(messages.map(m =>
        m.id === placeholderMsgId
          ? { ...m, text: "Understood, I won't make that change." }
          : m
      ));
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, overrideText?: string) => {
    if (e) e.preventDefault();
    const textToSubmit = overrideText || inputText;
    if (!textToSubmit.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      text: textToSubmit,
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    const newMessages = [...messages, userMsg];
    onMessagesChanged(newMessages);

    if (!overrideText) setInputText('');
    setLoading(true);

    try {
      // 1. Check for a URL in the message
      const urlRegex = /(https?:\/\/[^\s]+)/;
      const urlMatch = textToSubmit.match(urlRegex);
      const extractedUrl = urlMatch ? urlMatch[0] : null;

      if (extractedUrl) {
        setIsAnalyzingVideo(true);
        // Step A: Extract the user's question (everything except the link)
        const cleanMessage = textToSubmit.replace(extractedUrl, '').trim();

        // Step B: Add a live placeholder immediately so the user sees "thinking" while video processes
        const videoPlaceholderId = (Date.now() + 1).toString();
        const videoPlaceholder: Message = {
          id: videoPlaceholderId,
          text: '',
          sender: 'assistant',
          timestamp: new Date().toISOString(),
          audit_trail: [{ agent: 'assistant', message: 'Fetching and analyzing video content...' }],
        };
        onMessagesChanged([...newMessages, videoPlaceholder]);

        // Step C: Ingest the video content with the user's question as context
        const responseData = await ingestSocialVideo(extractedUrl, cleanMessage, {
          ...tripContextPayload,
          history: newMessages
        });

        // Step D: Update the placeholder with the final response and full audit trail
        const finalAuditTrail: AuditLog[] = [
          { agent: 'assistant', message: 'Video fetched and analyzed. Handing to Shadow Agent for audit.' },
          ...(responseData.audit_trail || [])
        ];
        onMessagesChanged([...newMessages, {
          ...videoPlaceholder,
          text: responseData.response,
          audit_trail: finalAuditTrail,
        }]);

        if (responseData.memory_update && onMemoryUpdated) {
          onMemoryUpdated(responseData.memory_update);
        }
      } else {
        // 2. Regular Chat AI (Streaming with tool support)
        let streamingAuditTrail: AuditLog[] = [];

        // Add an empty assistant message placeholder that we'll fill in real-time
        const assistantPlaceholderId = (Date.now() + 1).toString();
        const placeholderMsg: Message = {
          id: assistantPlaceholderId,
          text: "",
          sender: "assistant",
          timestamp: new Date().toISOString(),
          audit_trail: [],
        };

        const updatedMessages = [...newMessages, placeholderMsg];
        onMessagesChanged(updatedMessages);

        try {
          // Inject tool history into the context
          const contextWithHistory = {
            ...tripContextPayload,
            tool_history: toolHistory.length > 0 ? JSON.stringify(toolHistory) : undefined,
            history: newMessages
          };

          const finalResponse = await chatWithAI(
            textToSubmit,
            contextWithHistory,
            (newLog) => {
              streamingAuditTrail = [...streamingAuditTrail, newLog];
              onMessagesChanged([...newMessages, {
                ...placeholderMsg,
                audit_trail: streamingAuditTrail
              }]);
            },
            (toolCall) => {
              // Gemini requested a tool call — show approval card
              setPendingToolCall({
                toolCall,
                userMessage: textToSubmit,
                placeholderMsgId: assistantPlaceholderId,
              });
            },
            (memory) => {
              if (onMemoryUpdated) onMemoryUpdated(memory);
            }
          );

          // If we got a final text response (no tool call), update
          if (finalResponse && !pendingToolCall) {
            onMessagesChanged([...newMessages, {
              ...placeholderMsg,
              text: finalResponse,
              audit_trail: streamingAuditTrail,
            }]);
          }
        } catch (chatErr) {
          console.error("Streaming error:", chatErr);
          onMessagesChanged([...newMessages, {
            ...placeholderMsg,
            text: "Sorry, I encountered an error while processing your request. Please check if the server is running."
          }]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setIsAnalyzingVideo(false);
    }
  };


  const MAX_MESSAGES = 80;
  const isLimitReached = messages.length >= MAX_MESSAGES;

  return (
    <div className="card" style={{ height: '550px', display: 'flex', flexDirection: 'column', padding: '16px' }}>
      <h3 style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Chat
      </h3>

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          marginBottom: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          paddingRight: '4px'
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              background: msg.sender === 'user' ? 'var(--primary)' : (msg.text ? '#f1f5f9' : 'transparent'),
              color: msg.sender === 'user' ? 'white' : 'var(--text-main)',
              padding: msg.text ? '12px 16px' : '0px 12px',
              borderRadius: '12px',
              borderBottomRightRadius: msg.sender === 'user' ? '2px' : '12px',
              borderBottomLeftRadius: msg.sender === 'assistant' ? '2px' : '12px',
              maxWidth: '85%',
              fontSize: '0.9rem',
              lineHeight: '1.5',
              boxShadow: (msg.sender === 'user' || msg.text) ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              whiteSpace: msg.sender === 'user' ? 'pre-wrap' : 'normal',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word'
            }}
          >
            {msg.sender === 'assistant' ? (
              <div className="markdown-prose" style={{ wordBreak: 'break-word' }}>
                <ReactMarkdown
                  components={{
                    h1: ({node, ...props}) => <h3 style={{marginTop: '8px', marginBottom: '4px', fontSize: '1.2rem', color: 'var(--text-main)'}} {...props} />,
                    h2: ({node, ...props}) => <h3 style={{marginTop: '8px', marginBottom: '4px', fontSize: '1.2rem', color: 'var(--text-main)'}} {...props} />,
                    h3: ({node, ...props}) => <h4 style={{marginTop: '8px', marginBottom: '4px', fontSize: '1.1rem', color: 'var(--text-main)'}} {...props} />,
                    ul: ({node, ...props}) => <ul style={{marginTop: '2px', marginBottom: '4px', paddingLeft: '20px'}} {...props} />,
                    li: ({node, ...props}) => <li style={{marginBottom: '2px'}} {...props} />,
                    p: ({node, ...props}) => <p style={{margin: 0, paddingBottom: '4px'}} {...props} />
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              </div>
            ) : (
              msg.text
            )}

            {/* Collapsible Agent Thinking Logs - Now SUBTLE and UNDER the message */}
            {(msg.audit_trail && msg.audit_trail.length > 0) || (loading && msg.sender === 'assistant' && !msg.text) ? (
              <details style={{ marginTop: msg.text ? '12px' : '0' }} open={!msg.text}>
                <summary style={{
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  color: 'var(--text-muted)',
                  textDecoration: 'underline'
                }}>
                  {LOADING_PHRASES[Math.abs(msg.id.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % LOADING_PHRASES.length]}
                </summary>
                {msg.audit_trail && msg.audit_trail.length > 0 && (
                  <div style={{ marginTop: '8px', fontSize: '0.75rem', fontFamily: 'monospace', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {msg.audit_trail.map((log, i) => (
                      <div key={i} style={{
                        color: log.agent === 'shadow_agent' ? '#b91c1c' : '#1e40af',
                        background: log.agent === 'shadow_agent' ? '#fef2f2' : '#eff6ff',
                        padding: '6px',
                        borderRadius: '4px',
                        borderLeft: `3px solid ${log.agent === 'shadow_agent' ? '#ef4444' : '#3b82f6'}`
                      }}>
                        <strong>{log.agent === 'shadow_agent' ? '[Navix Critique Agent]' : '[Navix]'}</strong>: {log.message}
                      </div>
                    ))}
                  </div>
                )}
              </details>
            ) : null}

          </div>
        ))}

        {/* Tool Call Approval Card */}
        {pendingToolCall && (() => {
          const info = getToolDisplayInfo(pendingToolCall.toolCall);
          return (
            <div style={{
              alignSelf: 'flex-start',
              background: 'linear-gradient(135deg, #f0f9ff, #e0f2fe)',
              border: '1px solid #7dd3fc',
              borderRadius: '12px',
              padding: '16px',
              maxWidth: '85%',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <span style={{ fontSize: '1.3rem' }}>{info.icon}</span>
                <strong style={{ fontSize: '0.95rem', color: '#0369a1' }}>Navix wants to: {info.action}</strong>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                {info.details.map((d: any, i: number) => (
                  <div key={i} style={{ fontSize: '0.85rem', color: '#334155' }}>
                    <strong>{d.label}:</strong> {d.value}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleRejectToolCall}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', border: '1px solid #cbd5e1',
                    background: 'white', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500'
                  }}
                >
                  Reject
                </button>
                <button
                  onClick={handleApproveToolCall}
                  style={{
                    padding: '6px 14px', borderRadius: '6px', border: 'none',
                    background: '#0284c7', color: 'white', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600',
                    boxShadow: '0 1px 3px rgba(2,132,199,0.3)'
                  }}
                >
                  Approve ✓
                </button>
              </div>
            </div>
          );
        })()}

        {isLimitReached && (
          <div style={{ padding: '8px', background: '#fff7ed', border: '1px solid #ffedd5', borderRadius: '4px', fontSize: '0.8rem', color: '#9a3412', textAlign: 'center', marginTop: '12px' }}>
            ⚠️ Chat limit reached (80 msgs) to maintain precision. Please start a new session.
          </div>
        )}
      </div>

      <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '16px', alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          className="input-styled"
          style={{ 
            marginBottom: 0, 
            paddingTop: '12px',
            paddingBottom: '12px',
            lineHeight: '1.4'
          }}
          placeholder={isLimitReached ? "Session limit reached" : "Message or paste URL..."}
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          rows={1}
          disabled={loading || isLimitReached}
        />
        <button
          type="submit"
          className="btn"
          style={{ width: 'auto', padding: '0 16px', height: '46px', opacity: isLimitReached ? 0.5 : 1 }}
          disabled={loading || !inputText.trim() || isLimitReached}
        >
          &rarr;
        </button>
      </form>
    </div>
  );
}
