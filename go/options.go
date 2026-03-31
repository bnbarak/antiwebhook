package simplehook

// ListenOptions configures the simplehook WebSocket tunnel client.
type ListenOptions struct {
	// ForceEnable overrides the production check and connects even in production.
	ForceEnable bool

	// ServerURL overrides the default simplehook WebSocket server URL.
	ServerURL string

	// ListenerID sets a named listener for agent/environment isolation.
	ListenerID string

	// OnConnect is called each time a WebSocket connection is established.
	OnConnect func()

	// OnDisconnect is called each time the WebSocket connection is lost.
	OnDisconnect func()

	// Silent suppresses log output from the client.
	Silent bool
}

// Connection represents an active simplehook tunnel.
// Call Close to disconnect gracefully.
type Connection struct {
	closeCh chan struct{}
	doneCh  chan struct{}
}

func newConnection() *Connection {
	return &Connection{
		closeCh: make(chan struct{}),
		doneCh:  make(chan struct{}),
	}
}

func newClosedConnection() *Connection {
	c := &Connection{
		closeCh: make(chan struct{}),
		doneCh:  make(chan struct{}),
	}
	close(c.closeCh)
	close(c.doneCh)
	return c
}

// Close signals the tunnel goroutine to stop and waits for it to finish.
func (c *Connection) Close() {
	select {
	case <-c.closeCh:
		// already closed
	default:
		close(c.closeCh)
	}
	<-c.doneCh
}

// Done returns a channel that is closed when the connection goroutine has exited.
func (c *Connection) Done() <-chan struct{} {
	return c.doneCh
}
