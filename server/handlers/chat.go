package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"navix/server/services"
	"navix/server/models"
)

// ChatHandler handles the AI interaction endpoints
type ChatHandler struct {
	Gemini    *services.GeminiService
	Ingestion *services.IngestionService
	DB        *sql.DB
}

func (h *ChatHandler) PostChat(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Message      string                   `json:"message"`
		Destination  string                   `json:"destination"`
		Persona      string                   `json:"persona"`
		Preferences  string                   `json:"preferences"`
		LLMMemory    string                   `json:"llm_memory"`
		Budget       float64                  `json:"budget"`
		CurrentSpend float64                  `json:"current_spend"`
		Events       []map[string]interface{} `json:"events"`
		ToolHistory  string                   `json:"tool_history"`
		History              []models.Message         `json:"history"`
		GoogleCalendarStatus string                   `json:"google_calendar_status"`
		CurrentDate          string                   `json:"current_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	chatCtx := services.ChatContext{
		Destination:  body.Destination,
		Persona:      body.Persona,
		Preferences:  body.Preferences,
		LLMMemory:    body.LLMMemory,
		Budget:       body.Budget,
		CurrentSpend: body.CurrentSpend,
		Events:       services.SerializeEvents(body.Events),
		ToolHistory:          body.ToolHistory,
		History:              body.History,
		GoogleCalendarStatus: body.GoogleCalendarStatus,
		CurrentDate:          body.CurrentDate,
	}

	// Set headers for SSE
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	onLog := func(log models.AuditLog) {
		data, _ := json.Marshal(map[string]interface{}{
			"type": "audit",
			"log":  log,
		})
		fmt.Fprintf(w, "data: %s\n\n", string(data))
		flusher.Flush()
	}

	sessionResp, err := h.Gemini.GetChatResponse(body.Message, chatCtx, func(log models.AuditLog) {
		onLog(log)
	})
	
	if err != nil {
		data, _ := json.Marshal(map[string]string{"type": "error", "error": err.Error()})
		fmt.Fprintf(w, "data: %s\n\n", string(data))
		flusher.Flush()
		return
	}

	// If Gemini returned a tool call, stream it to the frontend for approval
	if sessionResp.ToolCall != nil {
		data, _ := json.Marshal(map[string]interface{}{
			"type":      "tool_call",
			"tool_name": sessionResp.ToolCall.ToolName,
			"params":    sessionResp.ToolCall.Params,
		})
		fmt.Fprintf(w, "data: %s\n\n", string(data))
		flusher.Flush()
		return
	}

	// Stream memory update if found
	if sessionResp.MemoryUpdate != "" {
		data, _ := json.Marshal(map[string]interface{}{
			"type":   "memory_update",
			"memory": sessionResp.MemoryUpdate,
		})
		fmt.Fprintf(w, "data: %s\n\n", string(data))
		flusher.Flush()
	}

	// Send final response
	data, err := json.Marshal(map[string]interface{}{
		"type":     "final",
		"response": sessionResp.Text,
	})
	if err != nil {
		fmt.Printf("Error marshaling final response: %v\n", err)
		return
	}
	fmt.Fprintf(w, "data: %s\n\n", string(data))
	flusher.Flush()
}

// PostToolResult handles the final AI response after a tool has been executed and approved
func (h *ChatHandler) PostToolResult(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserMessage string           `json:"user_message"`
		ToolName    string           `json:"tool_name"`
		ToolResult  string           `json:"tool_result"`
		Destination string           `json:"destination"`
		Persona     string           `json:"persona"`
		LLMMemory   string           `json:"llm_memory"`
		Budget      float64          `json:"budget"`
		History     []models.Message `json:"history"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	chatCtx := services.ChatContext{
		Destination: body.Destination,
		Persona:     body.Persona,
		LLMMemory:   body.LLMMemory,
		Budget:      body.Budget,
		History:     body.History,
	}

	// Set headers for SSE
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported", http.StatusInternalServerError)
		return
	}

	onLog := func(log models.AuditLog) {
		data, _ := json.Marshal(map[string]interface{}{
			"type": "audit",
			"log":  log,
		})
		fmt.Fprintf(w, "data: %s\n\n", string(data))
		flusher.Flush()
	}

	sessionResp, err := h.Gemini.ResumeChatWithToolResult(body.UserMessage, chatCtx, body.ToolName, body.ToolResult, onLog)
	if err != nil {
		data, _ := json.Marshal(map[string]interface{}{
			"type":  "error",
			"error": err.Error(),
		})
		fmt.Fprintf(w, "data: %s\n\n", string(data))
		flusher.Flush()
		return
	}

	// Stream memory update if found (e.g. tool revealed preference)
	if sessionResp.MemoryUpdate != "" {
		data, _ := json.Marshal(map[string]interface{}{
			"type":   "memory_update",
			"memory": sessionResp.MemoryUpdate,
		})
		fmt.Fprintf(w, "data: %s\n\n", string(data))
		flusher.Flush()
	}

	// Send final response
	data, err := json.Marshal(map[string]interface{}{
		"type":     "final",
		"response": sessionResp.Text,
	})
	if err != nil {
		fmt.Printf("Error marshaling final tool response: %v\n", err)
		return
	}
	fmt.Fprintf(w, "data: %s\n\n", string(data))
	flusher.Flush()
}

// PostIngest handles TikTok/Instagram URL ingestion
func (h *ChatHandler) PostIngest(w http.ResponseWriter, r *http.Request) {
	var body struct {
		URL          string                   `json:"url"`
		Message      string                   `json:"message"`
		Destination  string                   `json:"destination"`
		Persona      string                   `json:"persona"`
		Preferences  string                   `json:"preferences"`
		LLMMemory    string                   `json:"llm_memory"`
		Budget       float64                  `json:"budget"`
		CurrentSpend float64                  `json:"current_spend"`
		History      []models.Message         `json:"history"`
		CurrentDate  string                   `json:"current_date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	
	fmt.Printf("[Handler] Requesting ingestion for URL: %s (Context: %s)\n", body.URL, body.Message)
	
	// Call the ingestion service (synchronously for now so the UI gets the result)
	learnedContent, err := h.Ingestion.IngestSocialLink(r.Context(), body.URL, body.Message)
	if err != nil {
		http.Error(w, fmt.Sprintf("Ingestion Failed: %v", err), http.StatusInternalServerError)
		return
	}

	// Apply Shadow Agent Critique & Memory Extraction
	chatCtx := services.ChatContext{
		Destination:  body.Destination,
		Persona:      body.Persona,
		Preferences:  body.Preferences,
		LLMMemory:    body.LLMMemory,
		Budget:       body.Budget,
		CurrentSpend: body.CurrentSpend,
		History:      body.History,
		CurrentDate:  body.CurrentDate,
	}

	var auditLogs []models.AuditLog
	onLog := func(log models.AuditLog) {
		auditLogs = append(auditLogs, log)
	}

	// We use the draft content from the video and treat it like a model response that needs auditing
	finalResponse, memoryUpdate, err := h.Gemini.AuditAndRefineResponse(r.Context(), nil, nil, learnedContent, body.Message, chatCtx, onLog)
	if err != nil {
		fmt.Printf("[Handler] Shadow Agent audit failed: %v\n", err)
		// Fallback to raw content if audit fails catastrophically, but usually we want to know
	} else {
		learnedContent = finalResponse
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"response":      learnedContent,
		"memory_update": memoryUpdate,
		"audit_trail":   auditLogs,
	})
}

// PostIngestMemory handles file and URL memory ingestion
func (h *ChatHandler) PostIngestMemory(w http.ResponseWriter, r *http.Request) {
	err := r.ParseMultipartForm(10 << 20) // 10 MB max
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to parse form: %v", err), http.StatusBadRequest)
		return
	}

	urlStr := r.FormValue("url")
	currentMemory := r.FormValue("currentMemory")
	destination := r.FormValue("destination")
	
	// Handle optional file upload
	file, header, err := r.FormFile("file")
	var filePath string
	if err == nil {
		defer file.Close()
		// Save file to temp directory
		tempDir := "./test_assets/temp"
		if _, err := os.Stat(tempDir); os.IsNotExist(err) {
			os.MkdirAll(tempDir, 0755)
		}
		filePath = fmt.Sprintf("%s/memory_%s", tempDir, header.Filename)
		
		dst, err := os.Create(filePath)
		if err != nil {
			http.Error(w, "Failed to create temp file", http.StatusInternalServerError)
			return
		}
		defer dst.Close()
		
		// Copy file data
		if _, err := io.Copy(dst, file); err != nil {
			http.Error(w, "Failed to save file", http.StatusInternalServerError)
			return
		}
	} else if err != http.ErrMissingFile {
		http.Error(w, "Error reading file", http.StatusBadRequest)
		return
	}

	if urlStr == "" && filePath == "" {
		http.Error(w, "Must provide either a file or a URL", http.StatusBadRequest)
		return
	}

	// Process the memory using ingestion service
	result, err := h.Ingestion.IngestMemory(r.Context(), filePath, urlStr, currentMemory)
	if err != nil {
		// Clean up on failure
		if filePath != "" {
			os.Remove(filePath)
		}
		http.Error(w, fmt.Sprintf("Memory Ingestion Failed: %v", err), http.StatusInternalServerError)
		return
	}

	// Shadow Agent Audit
	if destination != "" {
		err = h.Gemini.AuditMemoryUpload(r.Context(), destination, result)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"response": result,
	})
}
