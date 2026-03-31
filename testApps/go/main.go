package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	simplehook "github.com/bnbarak/antiwebhook/go"
)

func main() {
	mux := http.NewServeMux()

	// Stripe webhooks
	mux.HandleFunc("/stripe/events", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		json.NewDecoder(r.Body).Decode(&body)
		eventType, _ := body["type"].(string)
		if eventType == "" {
			eventType = "unknown event"
		}
		log.Printf("[stripe] %s", eventType)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"received": true})
	})

	// GitHub webhooks
	mux.HandleFunc("/github/push", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		json.NewDecoder(r.Body).Decode(&body)
		ref, _ := body["ref"].(string)
		commits, _ := body["commits"].([]interface{})
		log.Printf("[github] %s %d commits", ref, len(commits))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	})

	// Twilio voice (passthrough -- response goes back to Twilio)
	mux.HandleFunc("/twilio/voice", func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		log.Printf("[twilio] CallSid=%s CallStatus=%s", r.FormValue("CallSid"), r.FormValue("CallStatus"))
		w.Header().Set("Content-Type", "text/xml")
		fmt.Fprint(w, `<Response><Say>Hello from simplehook test app!</Say></Response>`)
	})

	// Generic catch-all
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[webhook] %s %s", r.Method, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"received": true,
			"path":     r.URL.Path,
			"method":   r.Method,
		})
	})

	// Connect to simplehook
	apiKey := os.Getenv("SIMPLEHOOK_KEY")
	if apiKey == "" {
		apiKey = "ak_your_key_here"
	}

	opts := simplehook.ListenOptions{
		ForceEnable: true,
	}
	if serverURL := os.Getenv("SIMPLEHOOK_URL"); serverURL != "" {
		opts.ServerURL = serverURL
	}

	var conn *simplehook.Connection
	if listenerID := os.Getenv("SIMPLEHOOK_LISTENER"); listenerID != "" {
		conn = simplehook.ListenToWebhooksWithID(mux, apiKey, listenerID, opts)
	} else {
		conn = simplehook.ListenToWebhooks(mux, apiKey, opts)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "3003"
	}

	log.Printf("Go test app listening on :%s", port)
	log.Println("Waiting for webhooks via simplehook...")

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigCh
		log.Println("Shutting down...")
		conn.Close()
		os.Exit(0)
	}()

	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
