package services

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// VideoFetcher identifies and downloads raw video content from social URLs
type VideoFetcher struct {
	AssetsDir string
}

// FetchVideo takes a social media URL and returns a local path to the downloaded MP4.
func (f *VideoFetcher) FetchVideo(url string) (string, error) {
	fmt.Printf("[VideoFetcher] 'Shopping' for REAL video at: %s...\n", url)

	// Ensure temp directory exists
	tempDir := filepath.Join(f.AssetsDir, "temp")
	if _, err := os.Stat(tempDir); os.IsNotExist(err) {
		os.MkdirAll(tempDir, 0755)
	}

	// Generate a unique filename based on timestamp
	timestamp := time.Now().Format("20060102150405")
	outputPath := filepath.Join(tempDir, fmt.Sprintf("video_%s.mp4", timestamp))

	// Resolve yt-dlp binary: prefer YT_DLP_PATH env var, otherwise search $PATH
	ytDlpPath := os.Getenv("YT_DLP_PATH")
	var cmd *exec.Cmd

	// System check for ffmpeg (logs to Render console)
	_, ffmpegErr := exec.LookPath("ffmpeg")
	if ffmpegErr != nil {
		fmt.Println("[VideoFetcher] WARNING: 'ffmpeg' not found. Downloads requiring merging will fail. Forcing simple MP4 format.")
	}

	// Common bypass flags for Instagram/TikTok/YouTube
	args := []string{
		"--no-check-certificate",
		"--no-playlist",
		"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		// Priority: 1. Merged MP4, 2. Any single MP4 file, 3. Best overall fallback
		"-f", "best[ext=mp4]/best",
		"-o", outputPath,
		url,
	}

	if ytDlpPath != "" {
		cmd = exec.Command(ytDlpPath, args...)
	} else {
		// Try a few common locations for a standalone binary
		standalones := []string{"./yt-dlp", "../yt-dlp", "/opt/render/project/src/yt-dlp", "yt-dlp"}
		var foundPath string
		for _, s := range standalones {
			if info, err := os.Stat(s); err == nil && !info.IsDir() {
				foundPath = s
				break
			}
			if p, err := exec.LookPath(s); err == nil {
				foundPath = p
				break
			}
		}

		if foundPath != "" {
			fmt.Printf("[VideoFetcher] Found standalone yt-dlp at: %s\n", foundPath)
			cmd = exec.Command(foundPath, args...)
		} else {
			// FALLBACK: Try running via python module
			fmt.Println("[VideoFetcher] No standalone binary found, attempting fallback to 'python3 -m yt_dlp'...")
			fullArgs := append([]string{"-m", "yt_dlp"}, args...)
			cmd = exec.Command("python3", fullArgs...)
		}
	}

	// Combine stdout and stderr for better debugging
	output, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("[VideoFetcher] Error: %v, Output: %s\n", err, string(output))
		// RETURN THE REAL OUTPUT TO THE USER
		return "", fmt.Errorf("yt-dlp error: %s (exit status 1)", string(output))
	}

	fmt.Printf("[VideoFetcher] Successfully downloaded video to: %s\n", outputPath)
	return outputPath, nil
}
