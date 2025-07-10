# VocalCallSDK

A JavaScript SDK that provides a complete voice calling interface with WebSocket communication, audio recording/playback, and automatic UI management.

## Installation

```bash
npm install vocal-call-sdk
```

## Quick Start

```javascript
import { VocalCallSDK } from 'vocal-call-sdk';

const callSDK = new VocalCallSDK({
  websocketUrl: 'wss://call-dev.vocallabs.ai/ws/?agent=your-agent_call-123_web_48000',
  container: '#call-button-container'
});

callSDK.renderButton();
```

## Configuration

```javascript
new VocalCallSDK({
  websocketUrl: 'wss://your-server.com/ws/call-endpoint', // Required
  container: '#container',      // DOM element or selector
  inactiveText: 'Talk to AI',   // Button text when idle
  activeText: 'Listening...',   // Button text when recording
  size: 'medium',               // 'small', 'medium', 'large'
  className: 'custom-class',    // Additional CSS classes
  config: {                     // Optional audio settings
    audio: {
      sampleRate: 48000,
      echoCancellation: true,
      noiseSuppression: true
    }
  }
});
```

## Methods

```javascript
// Render button
callSDK.renderButton();

// Start/end calls programmatically
await callSDK.startCall();
await callSDK.endCall();

// Get status
const status = callSDK.getStatus();
// Returns: { status, isRecording, isConnected, lastDisconnectReason }

// Clean up
callSDK.destroy();
```

## Events

```javascript
callSDK
  .on('onCallStart', () => console.log('Call started'))
  .on('onCallEnd', (reason) => console.log('Call ended:', reason))
  .on('onRecordingStart', () => console.log('Recording started'))
  .on('onRecordingStop', () => console.log('Recording stopped'))
  .on('onStatusChange', (status) => console.log('Status:', status))
  .on('onError', (error) => console.error('Error:', error));
```

## React Example

```jsx
import { useEffect, useRef } from 'react';
import { VocalCallSDK } from 'vocal-call-sdk';

function VoiceCall({ websocketUrl }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const sdk = new VocalCallSDK({
      websocketUrl,
      container: containerRef.current
    });

    sdk.renderButton();

    // Handle events
    sdk.on('onCallStart', () => console.log('Call started'))
       .on('onCallEnd', (reason) => console.log('Call ended:', reason))
       .on('onError', (error) => console.error('Call error:', error));

    return () => sdk.destroy();
  }, [websocketUrl]);

  return <div ref={containerRef} />;
}

// Usage
function App() {
  const wsUrl = 'wss://call-dev.vocallabs.ai/ws/?agent=my-agent_call-123_web_48000';
  
  return (
    <div>
      <h1>Voice Assistant</h1>
      <VoiceCall websocketUrl={wsUrl} />
    </div>
  );
}
```

## CDN Usage

```html
<script src="https://cdn.jsdelivr.net/npm/vocal-call-sdk@1.0.0/dist/vocalcallsdk.js"></script>
<script>
  // Make sure VocalCallSDK is available globally
  const sdk = new VocalCallSDK({
    websocketUrl: 'wss://your-server.com/ws/call-endpoint',
    container: '#call-container'
  });
  
  sdk.renderButton();
</script>
```

## WebSocket URL Format

The WebSocket URL should be a complete endpoint that your server expects. Common formats include:

```javascript
// Basic format
'wss://your-domain.com/ws/call'

// With query parameters
'wss://call-dev.vocallabs.ai/ws/?agent=agent-id_call-id_web_48000'

// With authentication
'wss://api.yourservice.com/voice?token=your-auth-token&session=session-id'
```

## API Reference

### Constructor Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `websocketUrl` | string | Yes | - | Complete WebSocket URL for the voice service |
| `container` | string/Element | No | null | DOM element or CSS selector for button placement |
| `inactiveText` | string | No | 'Talk to Assistant' | Button text when not recording |
| `activeText` | string | No | 'Listening...' | Button text when recording |
| `size` | string | No | 'medium' | Button size: 'small', 'medium', 'large' |
| `className` | string | No | '' | Additional CSS classes for the button |
| `config` | object | No | {} | Additional configuration options |

### Status Values

- `idle` - Not connected, ready to start
- `connecting` - Attempting to connect
- `connected` - Connected and ready/recording
- `error` - Connection or other error occurred

## Browser Requirements

- Chrome 60+, Firefox 55+, Safari 11+, Edge 79+
- WebSocket, Web Audio API, getUserMedia support
- HTTPS required for microphone access (except localhost)

## Error Handling

```javascript
sdk.on('onError', (error) => {
  console.error('SDK Error:', error);
  
  // Handle different error types
  if (error.name === 'NotAllowedError') {
    alert('Microphone access denied. Please allow microphone access.');
  } else if (error.name === 'NotFoundError') {
    alert('No microphone found. Please connect a microphone.');
  }
});
```

## License

This project is licensed under the MIT License.