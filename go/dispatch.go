package simplehook

import (
	"bytes"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
)

// hopByHopHeaders are headers that should be stripped when forwarding requests.
var hopByHopHeaders = map[string]bool{
	"host":              true,
	"connection":        true,
	"transfer-encoding": true,
	"content-length":    true,
}

// dispatch builds an http.Request from a RequestFrame, calls the handler, and
// captures the response into a ResponseFrame.
func dispatch(handler http.Handler, frame RequestFrame) ResponseFrame {
	// Decode base64 body
	var bodyReader *bytes.Reader
	var bodyLen int
	if frame.Body != nil {
		decoded, err := base64.StdEncoding.DecodeString(*frame.Body)
		if err != nil {
			return ResponseFrame{
				Type:    "response",
				ID:      frame.ID,
				Status:  502,
				Headers: map[string]string{},
			}
		}
		bodyReader = bytes.NewReader(decoded)
		bodyLen = len(decoded)
	} else {
		bodyReader = bytes.NewReader(nil)
	}

	// Build the path — ensure it starts with /
	path := frame.Path
	if path == "" || !strings.HasPrefix(path, "/") {
		path = "/" + path
	}

	// Build http.Request
	req, err := http.NewRequest(frame.Method, path, bodyReader)
	if err != nil {
		return ResponseFrame{
			Type:    "response",
			ID:      frame.ID,
			Status:  502,
			Headers: map[string]string{},
		}
	}

	// Set sanitized headers
	if frame.Headers != nil {
		for k, v := range frame.Headers {
			lower := strings.ToLower(k)
			if !hopByHopHeaders[lower] {
				req.Header.Set(k, v)
			}
		}
	}

	// Set content-length if there is a body
	if bodyLen > 0 {
		req.ContentLength = int64(bodyLen)
	}

	// Use httptest.NewRecorder to capture the response
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)

	// Build response headers
	respHeaders := make(map[string]string)
	for k, vals := range recorder.Header() {
		if len(vals) > 0 {
			respHeaders[k] = vals[0]
		}
	}

	// Encode response body as base64
	var respBody *string
	if recorder.Body.Len() > 0 {
		encoded := base64.StdEncoding.EncodeToString(recorder.Body.Bytes())
		respBody = &encoded
	}

	return ResponseFrame{
		Type:    "response",
		ID:      frame.ID,
		Status:  recorder.Code,
		Headers: respHeaders,
		Body:    respBody,
	}
}
