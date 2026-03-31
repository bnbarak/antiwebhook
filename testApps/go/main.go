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
		log.Printf("[stripe] %v", body["type"])
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"received": true})
	})

	// GitHub webhooks
	mux.HandleFunc("/github/push", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		json.NewDecoder(r.Body).Decode(&body)
		log.Printf("[github] ref=%v", body["ref"])
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	})

	// Twilio voice
	mux.HandleFunc("/twilio/voice", func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		log.Printf("[twilio] CallSid=%s CallStatus=%s", r.FormValue("CallSid"), r.FormValue("CallStatus"))
		w.Header().Set("Content-Type", "text/xml")
		fmt.Fprint(w, `<Response><Say>Hello from simplehook test app!</Say></Response>`)
	})

	// Generic webhook endpoint
	mux.HandleFunc("/webhook", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[webhook] %s %s", r.Method, r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"received": true,
			"path":     r.URL.Path,
			"method":   r.Method,
		})
	})

	// Health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		fmt.Fprint(w, "ok")
	})

	// Connect to simplehook
	apiKey := os.Getenv("SIMPLEHOOK_KEY")
	if apiKey == "" {
		apiKey = "ak_your_key_here"
	}

	opts := &simplehook.ListenOptions{
		ForceEnable: true,
	}
	if listenerID := os.Getenv("SIMPLEHOOK_LISTENER"); listenerID != "" {
		opts.ListenerID = listenerID
	}
	if serverURL := os.Getenv("SIMPLEHOOK_URL"); serverURL != "" {
		opts.ServerURL = serverURL
	}

	conn := simplehook.ListenToWebhooks(mux, apiKey, opts)

	port := os.Getenv("PORT")
	if port == "" {
		port = "3002"
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
