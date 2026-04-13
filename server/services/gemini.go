package services

import (
	"context"
	"encoding/json"
	"fmt"
	"navix/server/models"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

// GeminiService handles the primary chat and red-teaming logic
type GeminiService struct {
	ApiKey string
}

// ChatContext defines the unified context passed to both agents
type ChatContext struct {
	Destination  string  `json:"destination"`
	Persona      string  `json:"persona"`
	Preferences  string  `json:"preferences"`
	LLMMemory    string  `json:"llm_memory"`
	Budget       float64 `json:"budget"`
	CurrentSpend float64 `json:"current_spend"`
	Events       string           `json:"events"`       // JSON-serialized current itinerary
	ToolHistory  string           `json:"tool_history"` // JSON-serialized history of past tool calls
	History              []models.Message `json:"history"`      // Full conversation history
	GoogleCalendarStatus string           `json:"google_calendar_status"`
	CurrentDate          string           `json:"current_date"`
}

type ChatSessionResponse struct {
	Text         string
	MemoryUpdate string
	ToolCall     *ToolCallResult
}

// ToolCallResult is returned when Gemini emits a function call
type ToolCallResult struct {
	ToolName string                 `json:"tool_name"`
	Params   map[string]interface{} `json:"params"`
}

// buildGeminiTools returns the genai.Tool definitions for function calling
func buildGeminiTools() []*genai.Tool {
	return []*genai.Tool{
		{
			FunctionDeclarations: []*genai.FunctionDeclaration{
				{
					Name:        "add_event",
					Description: "Add a new event to the trip itinerary. Use this when the user asks to plan, schedule, or add an activity.",
					Parameters: &genai.Schema{
						Type: genai.TypeObject,
						Properties: map[string]*genai.Schema{
							"title":       {Type: genai.TypeString, Description: "Title of the event"},
							"description": {Type: genai.TypeString, Description: "Description of the event"},
							"date":        {Type: genai.TypeString, Description: "Date in YYYY-MM-DD format"},
							"time":        {Type: genai.TypeString, Description: "Time in HH:MM 24h format"},
							"cost":        {Type: genai.TypeNumber, Description: "Estimated cost in USD"},
						},
						Required: []string{"title", "date", "time", "cost"},
					},
				},

				{
					Name:        "update_event",
					Description: "Update an existing itinerary event's details. Use when the user wants to change time, cost, or description.",
					Parameters: &genai.Schema{
						Type: genai.TypeObject,
						Properties: map[string]*genai.Schema{
							"event_id":    {Type: genai.TypeString, Description: "ID of the event to update"},
							"title":       {Type: genai.TypeString, Description: "New title (empty to keep current)"},
							"description": {Type: genai.TypeString, Description: "New description (empty to keep current)"},
							"date":        {Type: genai.TypeString, Description: "New date YYYY-MM-DD (empty to keep current)"},
							"time":        {Type: genai.TypeString, Description: "New time HH:MM (empty to keep current)"},
							"cost":        {Type: genai.TypeNumber, Description: "New cost in USD (-1 to keep current)"},
						},
						Required: []string{"event_id"},
					},
				},
				{
					Name:        "set_budget",
					Description: "Change the trip budget. Use when the user wants to increase or decrease their total budget.",
					Parameters: &genai.Schema{
						Type: genai.TypeObject,
						Properties: map[string]*genai.Schema{
							"amount": {Type: genai.TypeNumber, Description: "New budget amount in USD"},
						},
						Required: []string{"amount"},
					},
				},

				{
					Name:        "build_itinerary",
					Description: "Build a complete multi-day itinerary with multiple events at once. Use this ONLY after you have asked the user clarifying questions and have enough information to plan a full trip schedule. This adds all the events in a single batch.",
					Parameters: &genai.Schema{
						Type: genai.TypeObject,
						Properties: map[string]*genai.Schema{
							"events": {
								Type:        genai.TypeArray,
								Description: "Array of events to add to the itinerary",
								Items: &genai.Schema{
									Type: genai.TypeObject,
									Properties: map[string]*genai.Schema{
										"title":       {Type: genai.TypeString, Description: "Title of the event"},
										"description": {Type: genai.TypeString, Description: "Brief description"},
										"date":        {Type: genai.TypeString, Description: "Date in YYYY-MM-DD format"},
										"time":        {Type: genai.TypeString, Description: "Time in HH:MM 24h format"},
										"cost":        {Type: genai.TypeNumber, Description: "Estimated cost in USD"},
									},
									Required: []string{"title", "date", "time", "cost"},
								},
							},
						},
						Required: []string{"events"},
					},
				},
				{
					Name:        "clear_itinerary",
					Description: "Delete ALL events from the itinerary at once. Use when the user asks to clear, reset, wipe, or start over with their itinerary.",
					Parameters: &genai.Schema{
						Type: genai.TypeObject,
						Properties: map[string]*genai.Schema{
							"confirm": {Type: genai.TypeBoolean, Description: "Must be true to confirm clearing all events"},
						},
						Required: []string{"confirm"},
					},
				},
				{
					Name:        "sync_calendar",
					Description: "Push all tentative and built itinerary events to your Google Calendar.",
					Parameters: &genai.Schema{
						Type: genai.TypeObject,
						Properties: map[string]*genai.Schema{
							"reason": {Type: genai.TypeString, Description: "Optional reason for syncing (e.g. 'Finalizing the plan')"},
						},
					},
				},
			},
		},
	}
}

// GetChatResponse interacts with Gemini to get a planned travel response via an argument loop.
// It uses a callback to stream audit logs in real-time.
// Returns: (ChatSessionResponse, error)
func (s *GeminiService) GetChatResponse(userMessage string, chatCtx ChatContext, onLog func(models.AuditLog)) (ChatSessionResponse, error) {
	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(s.ApiKey))
	if err != nil {
		return ChatSessionResponse{}, fmt.Errorf("failed to create gemini client: %v", err)
	}
	defer client.Close()

	model := client.GenerativeModel("gemini-3-flash-preview")

	// Register tools for function calling
	model.Tools = buildGeminiTools()
	model.ToolConfig = &genai.ToolConfig{
		FunctionCallingConfig: &genai.FunctionCallingConfig{
			Mode: genai.FunctionCallingAuto,
		},
	}

	// Prepare conversation history for the chat session
	var history []*genai.Content
	for _, m := range chatCtx.History {
		role := "user"
		if m.Sender == "assistant" {
			role = "model"
		}
		history = append(history, &genai.Content{
			Role:  role,
			Parts: []genai.Part{genai.Text(m.Text)},
		})
	}

	session := model.StartChat()
	session.History = history

	// Fast Path: Check if this is a planning request
	if !s.isPlanningRequest(userMessage) {
		onLog(models.AuditLog{Agent: "assistant", Message: "Fast-path: Small talk detected, skipping adversarial audit."})

		assistantSystemMsg := fmt.Sprintf("You are Navix, a friendly travel assistant. Destination: %s. Persona: %s.\nTrip Memory: %s\nBudget constraints: Total $%.2f, Spent $%.2f. Preferences: %s\nIf the user mentions a link or a video, encourage them to paste it here so you can analyze it for them.",
			chatCtx.Destination, chatCtx.Persona, chatCtx.LLMMemory, chatCtx.Budget, chatCtx.CurrentSpend, chatCtx.Preferences)

		model.SystemInstruction = &genai.Content{
			Parts: []genai.Part{genai.Text(assistantSystemMsg)},
		}

		resp, err := session.SendMessage(ctx, genai.Text(userMessage))
		if err != nil {
			return ChatSessionResponse{}, fmt.Errorf("failed to generate assistant response: %v", err)
		}
		return ChatSessionResponse{Text: extractText(resp)}, nil
	}

	// Build context strings for the prompt
	eventsContext := "No events yet."
	if chatCtx.Events != "" {
		eventsContext = chatCtx.Events
	}

	toolHistoryContext := ""
	if chatCtx.ToolHistory != "" {
		toolHistoryContext = fmt.Sprintf("\n\nPREVIOUS TOOL CALLS THIS SESSION:\n%s", chatCtx.ToolHistory)
	}

	assistantSystemMsg := fmt.Sprintf(`Today is %s. You are Navix, a travel assistant. Destination: %s. Persona: %s.
Trip Memory: %s
Budget constraints: Total $%.2f, Spent $%.2f.
Current Preferences: %s

CURRENT ITINERARY (use these IDs when modifying/removing events):
%s%s

CRITICAL: You MUST use function calls for any action requests. NEVER respond with text saying you cannot do something if a matching tool exists.

TOOL USAGE RULES (follow these STRICTLY):
- User wants to add a SINGLE activity → call add_event
- User wants to change/update/modify an event → call update_event
- User wants to set/change budget → call set_budget
- User wants to clear/reset/wipe/delete ALL events or start over → call clear_itinerary
- User asks for a FULL itinerary/plan → follow the ITINERARY PLANNING PROTOCOL below
- ONLY respond with plain text for general questions or casual conversation.

ITINERARY PLANNING PROTOCOL:
When the user asks for a full itinerary or trip plan:
1. MANDATORY: Search the conversation history, current "Trip Memory", and "Preferences" for information already provided.
2. IF AND ONLY IF information is missing, ask for it. Do NOT ask for:
   - Dates/Duration if provided in history (e.g., "5 days starting Nov 20").
   - Interests if the user said "surprise me" or listed them earlier.
   - Pace if already mentioned (e.g., "fast paced" or "marathon").
3. DO NOT repeat yourself. If you've asked a question and the user answered it, MOVE ON.
4. Once you have the bare essentials, call build_itinerary IMMEDIATELY.

CALENDAR SYNC RULES:
- The current Google Calendar status is: %s.
- If status is "disconnected" and user asks about their calendar/schedule, explain that you can't see their personal events and suggest they login using the prompt on screen.
- If a sync_calendar tool result indicates "User needs to connect their Google account", inform the user that you've triggered a login prompt on their screen. Encourage them to connect and then tell you when they are ready to try again.

- Always use realistic cost estimates based on the destination.`,
		chatCtx.CurrentDate, chatCtx.Destination, chatCtx.Persona, chatCtx.LLMMemory,
		chatCtx.Budget, chatCtx.CurrentSpend, chatCtx.Preferences, 
		eventsContext, toolHistoryContext, chatCtx.GoogleCalendarStatus)

	model.SystemInstruction = &genai.Content{
		Parts: []genai.Part{genai.Text(assistantSystemMsg)},
	}

	// Turn 1: Assistant Draft (with tools available)
	onLog(models.AuditLog{Agent: "assistant", Message: "Processing request with tool capabilities..."})
	draftResp, err := session.SendMessage(ctx, genai.Text(userMessage))
	if err != nil {
		return ChatSessionResponse{}, fmt.Errorf("failed to generate assistant draft: %v", err)
	}

	// Check if Gemini returned a function call
	if len(draftResp.Candidates) > 0 && len(draftResp.Candidates[0].Content.Parts) > 0 {
		for _, part := range draftResp.Candidates[0].Content.Parts {
			if fc, ok := part.(genai.FunctionCall); ok {
				onLog(models.AuditLog{Agent: "assistant", Message: fmt.Sprintf("Tool call: %s — requesting user approval.", fc.Name)})
				return ChatSessionResponse{
					ToolCall: &ToolCallResult{
						ToolName: fc.Name,
						Params:   fc.Args,
					},
				}, nil
			}
		}
	}

	// No function call — proceed with normal argument loop
	draftText := extractText(draftResp)
	// Turn 2: Audit & Refine
	finalText, memoryUpdate, err := s.AuditAndRefineResponse(ctx, model, session, draftText, userMessage, chatCtx, onLog)
	if err != nil {
		return ChatSessionResponse{}, err
	}

	return ChatSessionResponse{Text: finalText, MemoryUpdate: memoryUpdate}, nil
}

// AuditAndRefineResponse performs the Shadow Agent audit loop on a draft response.
// It can be used both during active chat sessions and for one-off ingestion results.
func (s *GeminiService) AuditAndRefineResponse(
	ctx context.Context,
	model *genai.GenerativeModel,
	session *genai.ChatSession,
	draftText string,
	userMessage string,
	chatCtx ChatContext,
	onLog func(models.AuditLog),
) (string, string, error) {
	if model == nil {
		client, err := genai.NewClient(ctx, option.WithAPIKey(s.ApiKey))
		if err != nil {
			return "", "", fmt.Errorf("failed to create client for audit: %v", err)
		}
		defer client.Close()
		model = client.GenerativeModel("gemini-3-flash-preview")
	}

	onLog(models.AuditLog{Agent: "assistant", Message: "Draft complete. Handing to Shadow Agent for audit."})

	// Turn 2: Shadow Agent Audit & Memory Extraction
	shadowSystemMsg := fmt.Sprintf(`You are the Navix Shadow Agent. You have TWO roles:
1. ADVERSARIAL AUDITOR: Find flaws in the Assistant's response for the trip to %s. 
   - CRITICAL: Check if the Assistant is asking a question the user ALREADY answered in the History or Preferences.
   - Budget limit: $%.2f. Current spend: $%.2f.
   - If the response is redundant, repetitive, or violates constraints, output: "AUDIT: VIOLATION [reason]"
   - Otherwise, output: "AUDIT: PASS"

2. MEMORY MANAGER: Extract NEW information about the traveler from this current exchange.
   - Look for: Specific interests, food allergies, travel style, must-sees, or any hard requirements.
   - If you learn something new, output: "MEMORY: [A concise 1-sentence summary of new knowledge]"
   - Otherwise, output: "MEMORY: NONE"

Current User Instructions/Preferences: %s`, chatCtx.Destination, chatCtx.Budget, chatCtx.CurrentSpend, chatCtx.Preferences)

	auditPrompt := fmt.Sprintf("%s\n\nUser Request: %s\n\nAssistant Proposed Response:\n%s", shadowSystemMsg, userMessage, draftText)

	onLog(models.AuditLog{Agent: "shadow_agent", Message: "Auditing proposal and extracting traveler insights..."})
	shadowResp, err := model.GenerateContent(ctx, genai.Text(auditPrompt))
	if err != nil {
		return "", "", fmt.Errorf("failed to generate shadow critique: %v", err)
	}
	shadowText := extractText(shadowResp)

	onLog(models.AuditLog{Agent: "shadow_agent", Message: "Critique finished: " + shadowText})

	// Parse Memory Update
	memoryUpdate := ""
	if strings.Contains(shadowText, "MEMORY:") {
		parts := strings.Split(shadowText, "MEMORY:")
		if len(parts) > 1 {
			memStr := strings.TrimSpace(strings.Split(parts[1], "\n")[0])
			if memStr != "NONE" {
				memoryUpdate = memStr
			}
		}
	}

	// Turn 3: Refinement (if VIOLATION)
	if strings.Contains(strings.ToUpper(shadowText), "AUDIT: VIOLATION") {
		onLog(models.AuditLog{Agent: "assistant", Message: "Violation detected. Refining plan to comply with constraints."})
		
		assistantSystemMsg := fmt.Sprintf(`Today is %s. You are Navix, a travel assistant. Destination: %s. Persona: %s.
Trip Memory: %s
Budget constraints: Total $%.2f, Spent $%.2f.
Current Preferences: %s

CRITICAL: Resolve the conflict identified by the Shadow Agent.`,
			chatCtx.CurrentDate, chatCtx.Destination, chatCtx.Persona, chatCtx.LLMMemory,
			chatCtx.Budget, chatCtx.CurrentSpend, chatCtx.Preferences)

		refinePrompt := fmt.Sprintf("%s\n\nUser Request: %s\n\nYour previous draft:\n%s\n\nThe Shadow Agent found a conflict:\n%s\n\nRewrite your response to safely address the user's request while resolving the conflict. Be helpful and natural.",
			assistantSystemMsg, userMessage, draftText, shadowText)

		var finalResp *genai.GenerateContentResponse
		if session != nil {
			finalResp, err = session.SendMessage(ctx, genai.Text(refinePrompt))
		} else {
			finalResp, err = model.GenerateContent(ctx, genai.Text(refinePrompt))
		}

		if err != nil {
			return "", "", fmt.Errorf("failed to generate refinement: %v", err)
		}

		finalText := extractText(finalResp)
		onLog(models.AuditLog{Agent: "assistant", Message: "Plan adjusted. Sending final secure response."})
		return finalText, memoryUpdate, nil
	}

	// If PASS, just return the draft
	return draftText, memoryUpdate, nil
}

// ResumeChatWithToolResult continues the conversation after user approves/rejects a tool call
func (s *GeminiService) ResumeChatWithToolResult(userMessage string, chatCtx ChatContext, toolName string, toolResult string, onLog func(models.AuditLog)) (ChatSessionResponse, error) {
	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(s.ApiKey))
	if err != nil {
		return ChatSessionResponse{}, fmt.Errorf("failed to create gemini client: %v", err)
	}
	defer client.Close()

	model := client.GenerativeModel("gemini-3-flash-preview")

	// Prepare conversation history
	var history []*genai.Content
	for _, m := range chatCtx.History {
		role := "user"
		if m.Sender == "assistant" {
			role = "model"
		}
		history = append(history, &genai.Content{
			Role:  role,
			Parts: []genai.Part{genai.Text(m.Text)},
		})
	}

	session := model.StartChat()
	session.History = history

	assistantSystemMsg := fmt.Sprintf("You are Navix, a travel assistant for a trip to %s. Persona: %s.\nTrip Memory: %s",
		chatCtx.Destination, chatCtx.Persona, chatCtx.LLMMemory)

	model.SystemInstruction = &genai.Content{
		Parts: []genai.Part{genai.Text(assistantSystemMsg)},
	}

	prompt := fmt.Sprintf(`The user's original request: "%s"
You called the tool "%s" and the result was: %s

Please provide a brief, friendly confirmation to the user. ALSO, determine if this tool execution reveals any new traveler preferences.
Output format:
AUDIT: PASS
MEMORY: [1-sentence update or NONE]
CONFIRMATION: [friendly text]`, userMessage, toolName, toolResult)

	onLog(models.AuditLog{Agent: "assistant", Message: "Generating confirmation and extracting tool-based insights..."})
	resp, err := session.SendMessage(ctx, genai.Text(prompt))
	if err != nil {
		return ChatSessionResponse{}, fmt.Errorf("failed to generate tool result response: %v", err)
	}

	fullText := extractText(resp)

	// Simple parsing for ResumeChat case
	memoryUpdate := ""
	if strings.Contains(fullText, "MEMORY:") {
		parts := strings.Split(fullText, "MEMORY:")
		if len(parts) > 1 {
			memStr := strings.TrimSpace(strings.Split(parts[1], "\n")[0])
			if memStr != "NONE" {
				memoryUpdate = memStr
			}
		}
	}

	confirmation := fullText
	if strings.Contains(fullText, "CONFIRMATION:") {
		parts := strings.Split(fullText, "CONFIRMATION:")
		confirmation = strings.TrimSpace(parts[1])
	}

	return ChatSessionResponse{Text: confirmation, MemoryUpdate: memoryUpdate}, nil
}

func (s *GeminiService) isPlanningRequest(text string) bool {
	t := strings.ToLower(text)
	keywords := []string{
		"yes", "no", "plan", "itinerary", "iter", "travel", "flight", "hotel",
		"dinner", "restaurant", "budget", "cost", "spend", "visit", "trip", "where",
		"when", "recommend", "suggest", "stay", "book", "reservation",
		"add", "remove", "delete", "cancel", "update", "change", "schedule", "set",
		"clear", "reset", "wipe", "start over", "days", "pace", "morning", "night",
		"interests", "food", "surprise", "marathon", "fast", "slow", "relaxed",
	}

	// If the message is very short, and doesn't have keywords, it's likely small talk
	if len(text) < 15 {
		hasKeyword := false
		for _, kw := range keywords {
			if strings.Contains(t, kw) {
				hasKeyword = true
				break
			}
		}
		if !hasKeyword {
			return false
		}
	}

	// Default to planning mode for safety
	return true
}

func extractText(resp *genai.GenerateContentResponse) string {
	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return "Empty response."
	}
	if part, ok := resp.Candidates[0].Content.Parts[0].(genai.Text); ok {
		return string(part)
	}
	return "Unrecognized format."
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// SerializeEvents converts a list of event maps into a string for the LLM context
func SerializeEvents(events []map[string]interface{}) string {
	if len(events) == 0 {
		return "No events yet."
	}
	data, err := json.MarshalIndent(events, "", "  ")
	if err != nil {
		return "No events yet."
	}
	return string(data)
}

// AuditMemoryUpload uses the Shadow Agent to audit incoming memory profiles
func (s *GeminiService) AuditMemoryUpload(ctx context.Context, destination string, proposedMemory string) error {
	client, err := genai.NewClient(ctx, option.WithAPIKey(s.ApiKey))
	if err != nil {
		return fmt.Errorf("failed to create gemini client: %v", err)
	}
	defer client.Close()

	model := client.GenerativeModel("gemini-3-flash-preview")

	shadowSystemMsg := fmt.Sprintf(`You are the Navix Shadow Agent, an adversarial auditor. 
Your ONLY job is to verify that the following proposed Core LLM Memory actually contains VALID travel information related to the user's destination: %s.

CRITICAL RULES:
1. If the proposed memory indicates that the source was about completely random/unrelated topics (e.g., math, stats, programming) or states "no relevant travel context found", output "VIOLATION: The uploaded document appears completely unrelated to travel."
2. If the memory discusses facts clearly related to an entirely different geographical destination (e.g., a Paris hotel guide for a Tokyo trip), output "VIOLATION: This document is for the wrong destination."
3. ONLY output "PASS" if the proposed memory genuinely contains valid travel preferences.`, destination)

	auditPrompt := fmt.Sprintf("%s\n\nProposed Core LLM Memory:\n%s", shadowSystemMsg, proposedMemory)

	fmt.Printf("[Shadow Agent] Auditing memory upload for destination: %s\n", destination)
	resp, err := model.GenerateContent(ctx, genai.Text(auditPrompt))
	if err != nil {
		return fmt.Errorf("audit failed to generate: %v", err)
	}

	auditText := extractText(resp)
	fmt.Printf("[Shadow Agent] Memory Audit Result: %s\n", auditText)

	if strings.Contains(strings.ToUpper(auditText), "VIOLATION") {
		return fmt.Errorf("%s", auditText)
	}

	return nil
}
