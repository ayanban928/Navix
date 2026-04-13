package services

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"navix/server/db"

	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/option"
)

// IngestionService handles the learning from external social media URLs
type IngestionService struct {
	ApiKey  string
	Fetcher *VideoFetcher
	DB      *sql.DB
}

// IngestSocialLink parses a TikTok or Instagram URL and extracts trip-relevant content.
func (s *IngestionService) IngestSocialLink(ctx context.Context, url string, userRequest string) (string, error) {
	fmt.Printf("[Ingestion] Starting ingestion for: %s\n", url)

	// 1. Fetch the raw video content (Real Download)
	videoPath, err := s.Fetcher.FetchVideo(url)
	if err != nil {
		return "", fmt.Errorf("failed to fetch video: %v", err)
	}
	// CLEANUP: Delete the local file after we are done
	defer os.Remove(videoPath)

	// 1b. Persist video bytes to database (if DB is available)
	if s.DB != nil {
		videoBytes, readErr := os.ReadFile(videoPath)
		if readErr == nil {
			mimeType := "video/mp4"
			if strings.HasSuffix(strings.ToLower(videoPath), ".webm") {
				mimeType = "video/webm"
			}
			assetID, saveErr := db.SaveMediaAsset(s.DB, "", url, mimeType, videoBytes)
			if saveErr != nil {
				fmt.Printf("[Ingestion] Warning: failed to persist video to DB: %v\n", saveErr)
			} else {
				fmt.Printf("[Ingestion] Video persisted to DB as asset: %s\n", assetID)
			}
		}
	}


	// 2. Initialize Gemini Client
	client, err := genai.NewClient(ctx, option.WithAPIKey(s.ApiKey))
	if err != nil {
		return "", fmt.Errorf("failed to create client: %v", err)
	}
	defer client.Close()

	// 3. Upload video to Gemini File API
	file, err := os.Open(videoPath)
	if err != nil {
		return "", fmt.Errorf("failed to open video file: %v", err)
	}
	defer file.Close()

	fmt.Printf("[Ingestion] Uploading video to Gemini File API...\n")
	gFile, err := client.UploadFile(ctx, "", file, &genai.UploadFileOptions{
		DisplayName: "Social Media Ingestion Video",
	})
	if err != nil {
		return "", fmt.Errorf("file upload failed: %v", err)
	}
	fmt.Printf("[Ingestion] Upload complete. URI: %s\n", gFile.URI)

	// Wait for the file to be ACTIVE (processed by Google)
	fmt.Printf("[Ingestion] Waiting for Gemini to process video...\n")
	start := time.Now()
	for gFile.State == genai.FileStateProcessing {
		if time.Since(start) > 40*time.Second {
			return "", fmt.Errorf("timeout waiting for video to be processed")
		}
		time.Sleep(1 * time.Second)
		
		// Refresh file state
		gFile, err = client.GetFile(ctx, gFile.Name)
		if err != nil {
			return "", fmt.Errorf("failed to check file status: %v", err)
		}
	}

	if gFile.State != genai.FileStateActive {
		return "", fmt.Errorf("file entered unexpected state: %v", gFile.State)
	}
	fmt.Printf("[Ingestion] Video is ACTIVE. Starting multimodal analysis...\n")

	// 4. Generate content from video
	model := client.GenerativeModel("gemini-3-flash-preview")
	
	// DYNAMIC PROMPT: Adjust based on whether the user asked a specific question
	var prompt string
	if userRequest != "" {
		prompt = fmt.Sprintf("The user has a specific request about this video: \"%s\"\n\nAnalyze the video and answer their request. Use professional Markdown formatting (bolding, subheaders) to make your response easy to read. Use double line breaks between sections.", userRequest)
	} else {
		prompt = `Watch this travel video and create a professional itinerary summary.
		
		FORMATTING RULES:
		- Use Markdown headers (###) for location names.
		- Use **bold text** for costs and key highlights.
		- Use bullet points for specific features or tips.
		- Use double line breaks between different sections for a clean, spacious look.
		
		For each item, include:
		- A header with the PLACE NAME (###)
		- **ESTIMATED COST**
		- A detailed description of what makes it special.
		
		Return the results as a stunning, well-formatted travel report.`
	}

	resp, err := model.GenerateContent(ctx,
		genai.FileData{URI: gFile.URI},
		genai.Text(prompt),
	)
	if err != nil {
		return "", fmt.Errorf("failed to analyze video: %v", err)
	}

	if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
		return "Gemini watched the video but found no specific travel items.", nil
	}

	// Extract response text
	var learnedContent string
	if part, ok := resp.Candidates[0].Content.Parts[0].(genai.Text); ok {
		learnedContent = string(part)
	} else {
		learnedContent = "Unexpected response format from Gemini."
	}

	return learnedContent, nil
}

// IngestMemory processes uploaded files or URLs to extract travel context.
func (s *IngestionService) IngestMemory(ctx context.Context, filePath string, urlStr string, currentMemory string) (string, error) {
	fmt.Println("[Ingestion] Starting memory ingest...")
	
	client, err := genai.NewClient(ctx, option.WithAPIKey(s.ApiKey))
	if err != nil {
		return "", fmt.Errorf("failed to create client: %v", err)
	}
	defer client.Close()

	var contentParts []genai.Part

	// 1. Process File if provided
	if filePath != "" {
		defer os.Remove(filePath)

		// Persist file bytes to database (if DB is available)
		if s.DB != nil {
			fileBytes, readErr := os.ReadFile(filePath)
			if readErr == nil {
				fMime := "text/plain"
				if strings.HasSuffix(strings.ToLower(filePath), ".pdf") {
					fMime = "application/pdf"
				}
				assetID, saveErr := db.SaveMediaAsset(s.DB, "", "", fMime, fileBytes)
				if saveErr != nil {
					fmt.Printf("[Ingestion] Warning: failed to persist document to DB: %v\n", saveErr)
				} else {
					fmt.Printf("[Ingestion] Document persisted to DB as asset: %s\n", assetID)
				}
			}
		}

		file, err := os.Open(filePath)
		if err != nil {
			return "", fmt.Errorf("failed to open file: %v", err)
		}
		
		mimeType := "text/plain"
		if strings.HasSuffix(strings.ToLower(filePath), ".pdf") {
			mimeType = "application/pdf"
		}

		fmt.Printf("[Ingestion] Uploading memory document %s (MIME: %s)...\n", filePath, mimeType)
		gFile, err := client.UploadFile(ctx, "", file, &genai.UploadFileOptions{
			DisplayName: "User Memory Document",
			MIMEType:    mimeType,
		})
		file.Close()
		if err != nil {
			return "", fmt.Errorf("file upload failed: %v", err)
		}

		// Wait for ACTIVE state
		start := time.Now()
		for gFile.State == genai.FileStateProcessing {
			if time.Since(start) > 40*time.Second {
				return "", fmt.Errorf("timeout waiting for document processing")
			}
			time.Sleep(1 * time.Second)
			gFile, err = client.GetFile(ctx, gFile.Name)
			if err != nil {
				return "", fmt.Errorf("failed to check file status: %v", err)
			}
		}
		
		if gFile.State != genai.FileStateActive {
			return "", fmt.Errorf("document entered unexpected state: %v", gFile.State)
		}
		
		contentParts = append(contentParts, genai.FileData{URI: gFile.URI})
	}

	// 2. Process URL if provided
	if urlStr != "" {
		fmt.Printf("[Ingestion] Fetching URL: %s\n", urlStr)
		resp, err := http.Get(urlStr)
		if err == nil {
			defer resp.Body.Close()
			bodyBytes, _ := io.ReadAll(resp.Body)
			
			// Append the raw HTML/text to the prompt (Gemini is great at parsing this)
			// Limit to first 500k bytes to fit in context
			bodyStr := string(bodyBytes)
			if len(bodyStr) > 500000 {
				bodyStr = bodyStr[:500000]
			}
			urlPart := fmt.Sprintf("Here is the raw content from the user's provided link (%s):\n\n%s", urlStr, bodyStr)
			contentParts = append(contentParts, genai.Text(urlPart))
		} else {
			fmt.Printf("[Ingestion] Failed to fetch URL, relying purely on Gemini knowledge: %v\n", err)
			contentParts = append(contentParts, genai.Text(fmt.Sprintf("The user shared this link for context: %s. Analyze what you can from the URL.", urlStr)))
		}
	}

	// 3. Generate Summary
	prompt := `You are Navix, an elite travel memory compiler. The user has uploaded the following documents and/or chat history.
	
	Your task is to extract the user's core travel philosophy, tendencies, and overarching preferences. Do NOT simply summarize the conversation. Focus on pulling out what kind of traveler they are so this can serve as their Core LLM Memory for future itinerary planning.
	
	Extract things like:
	- Travel Pacing & Vibe (e.g., relaxed, fast-paced, luxury, backpacker)
	- Dietary Tendencies
	- Accommodation Style
	- Activity Priorities
	
	FORMATTING RULES:
	- Use professional Markdown formatting.
	- Use subheaders (###) for distinct categories.
	- Use **bold text** to highlight key traits or strict constraints.
	- Use bullet points under each header.
	- Include double line breaks between sections to ensure a clean, spaced-out, and highly readable layout.
	- CRITICAL: DO NOT output any HTML tags like <br>. Use standard markdown line breaks.
	- CRITICAL: If the uploaded document or chat is completely unrelated to travel (e.g., mathematics, random news), DO NOT invent travel preferences. Output EXACTLY: "The uploaded document appears completely unrelated to travel."
`

	if currentMemory != "" && currentMemory != "Memory reset based on trip start." {
		prompt += fmt.Sprintf("\n\nCRITICAL CONTEXT: The user already has an existing Core LLM Memory profile. You MUST merge your newly extracted insights seamlessly into the existing profile below. Do NOT lose ANY of the previous constraints/traits. Output a single cohesive profile.\n\n--- EXISTING CORE LLM MEMORY ---\n%s", currentMemory)
	}

	contentParts = append(contentParts, genai.Text(prompt))

	model := client.GenerativeModel("gemini-3-flash-preview")
	genResp, err := model.GenerateContent(ctx, contentParts...)
	if err != nil {
		return "", fmt.Errorf("failed to analyze memory: %v", err)
	}

	if len(genResp.Candidates) == 0 || len(genResp.Candidates[0].Content.Parts) == 0 {
		return "No relevant travel context found in the provided files.", nil
	}

	if part, ok := genResp.Candidates[0].Content.Parts[0].(genai.Text); ok {
		return string(part), nil
	}

	return "Unexpected response format from Gemini.", nil
}
