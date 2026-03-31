package simplehook

import (
	"os"
)

// isProduction returns true if the environment indicates production.
// Checks GO_ENV and ENV environment variables for exact match.
func isProduction() bool {
	if os.Getenv("GO_ENV") == "production" {
		return true
	}
	if os.Getenv("ENV") == "production" {
		return true
	}
	return false
}

// isExplicitlyDisabled returns true if SIMPLEHOOK_ENABLED is set to "false".
func isExplicitlyDisabled() bool {
	return os.Getenv("SIMPLEHOOK_ENABLED") == "false"
}
