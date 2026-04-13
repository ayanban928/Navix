package mcptools

import (
	"context"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// --- Tool Input/Output Structs ---

type AddEventInput struct {
	Title       string  `json:"title"       jsonschema:"title of the event"`
	Description string  `json:"description" jsonschema:"description of the event"`
	Date        string  `json:"date"        jsonschema:"date in YYYY-MM-DD format"`
	Time        string  `json:"time"        jsonschema:"time in HH:MM 24h format"`
	Cost        float64 `json:"cost"        jsonschema:"estimated cost in USD"`
}

type SetBudgetInput struct {
	Amount float64 `json:"amount" jsonschema:"new budget amount in USD"`
}

type UpdateEventInput struct {
	EventID     string  `json:"event_id"    jsonschema:"ID of the event to update"`
	Title       string  `json:"title"       jsonschema:"new title, empty to keep current"`
	Description string  `json:"description" jsonschema:"new description, empty to keep current"`
	Date        string  `json:"date"        jsonschema:"new date YYYY-MM-DD, empty to keep current"`
	Time        string  `json:"time"        jsonschema:"new time HH:MM, empty to keep current"`
	Cost        float64 `json:"cost"        jsonschema:"new cost in USD, -1 to keep current"`
}

type BuildItineraryEvent struct {
	Title       string  `json:"title"       jsonschema:"title of the event"`
	Description string  `json:"description" jsonschema:"brief description"`
	Date        string  `json:"date"        jsonschema:"date in YYYY-MM-DD format"`
	Time        string  `json:"time"        jsonschema:"time in HH:MM 24h format"`
	Cost        float64 `json:"cost"        jsonschema:"estimated cost in USD"`
}

type BuildItineraryInput struct {
	Events []BuildItineraryEvent `json:"events" jsonschema:"array of events to add"`
}

type ClearItineraryInput struct{}

type ToolOutput struct {
	Status  string `json:"status"`
	Message string `json:"message"`
}

// --- Tool Handlers ---
// These return "pending_approval" because the actual mutations happen client-side
// after the user explicitly approves the action in the UI.

func AddEvent(ctx context.Context, req *mcp.CallToolRequest, input AddEventInput) (*mcp.CallToolResult, ToolOutput, error) {
	return nil, ToolOutput{Status: "pending_approval", Message: "Approval needed to add event"}, nil
}

func UpdateEvent(ctx context.Context, req *mcp.CallToolRequest, input UpdateEventInput) (*mcp.CallToolResult, ToolOutput, error) {
	return nil, ToolOutput{Status: "pending_approval", Message: "Approval needed to update event"}, nil
}

func SyncCalendar(ctx context.Context, req *mcp.CallToolRequest, input struct{}) (*mcp.CallToolResult, ToolOutput, error) {
	return nil, ToolOutput{Status: "pending_approval", Message: "Approval needed to sync with Google Calendar"}, nil
}

func SetBudget(ctx context.Context, req *mcp.CallToolRequest, input SetBudgetInput) (*mcp.CallToolResult, ToolOutput, error) {
	return nil, ToolOutput{Status: "pending_approval", Message: "Approval needed to change budget"}, nil
}

func BuildItinerary(ctx context.Context, req *mcp.CallToolRequest, input BuildItineraryInput) (*mcp.CallToolResult, ToolOutput, error) {
	return nil, ToolOutput{Status: "pending_approval", Message: "Approval needed to build itinerary"}, nil
}

func ClearItinerary(ctx context.Context, req *mcp.CallToolRequest, input ClearItineraryInput) (*mcp.CallToolResult, ToolOutput, error) {
	return nil, ToolOutput{Status: "pending_approval", Message: "Approval needed to clear itinerary"}, nil
}

// NewNavixMCPServer creates and returns the configured MCP server.
func NewNavixMCPServer() *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{Name: "navix-tools", Version: "v1.1.0"}, nil)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "add_event",
		Description: "Add a new activity.",
	}, AddEvent)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "update_event",
		Description: "Update an existing activity by ID.",
	}, UpdateEvent)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "set_budget",
		Description: "Set a new trip budget.",
	}, SetBudget)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "build_itinerary",
		Description: "Build a multi-event plan in one batch.",
	}, BuildItinerary)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "clear_itinerary",
		Description: "Delete ALL events from the itinerary..",
	}, ClearItinerary)

	mcp.AddTool(server, &mcp.Tool{
		Name:        "sync_calendar",
		Description: "Sync all tentative events to your Google Calendar.",
	}, SyncCalendar)

	return server
}
