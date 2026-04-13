package services

import (
	"context"
	"fmt"

	"golang.org/x/oauth2"
	"google.golang.org/api/calendar/v3"
	"google.golang.org/api/option"
)

type GoogleCalendarService struct {
	Config *oauth2.Config
}

// FetchEvents retrieves calendar events for the authenticated user.
func (s *GoogleCalendarService) FetchEvents(ctx context.Context, token *oauth2.Token) ([]*calendar.Event, error) {
	client := s.Config.Client(ctx, token)

	srv, err := calendar.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		return nil, fmt.Errorf("unable to retrieve Calendar client: %v", err)
	}

	// Fetch primary calendar events
	events, err := srv.Events.List("primary").
		ShowDeleted(false).
		SingleEvents(true).
		TimeMin("2026-01-01T00:00:00Z"). // Sync all of 2026
		MaxResults(5000).
		OrderBy("startTime").
		Do()
	if err != nil {
		return nil, fmt.Errorf("unable to retrieve user's events: %v", err)
	}

	return events.Items, nil
}

// PushEvent creates a new event in the user's primary calendar.
func (s *GoogleCalendarService) PushEvent(ctx context.Context, token *oauth2.Token, event *calendar.Event) (*calendar.Event, error) {
	client := s.Config.Client(ctx, token)

	srv, err := calendar.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		return nil, fmt.Errorf("unable to retrieve Calendar client: %v", err)
	}

	createdEvent, err := srv.Events.Insert("primary", event).Do()
	if err != nil {
		return nil, fmt.Errorf("unable to insert event: %v", err)
	}

	return createdEvent, nil
}

// DeleteEvent removes an event from the user's primary calendar by ID.
func (s *GoogleCalendarService) DeleteEvent(ctx context.Context, token *oauth2.Token, eventId string) error {
	client := s.Config.Client(ctx, token)

	srv, err := calendar.NewService(ctx, option.WithHTTPClient(client))
	if err != nil {
		return fmt.Errorf("unable to retrieve Calendar client: %v", err)
	}

	err = srv.Events.Delete("primary", eventId).Do()
	if err != nil {
		return fmt.Errorf("unable to delete event: %v", err)
	}

	return nil
}
