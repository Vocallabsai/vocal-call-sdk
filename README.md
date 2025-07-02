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
  agentId: 'your-agent-id',
  callId: 'unique-call-id',
  container: '#call-button-container'
});

callSDK.renderButton();
```

## Configuration

```javascript
new VocalCallSDK({
  agentId: 'your-agent-id',     // Required
  callId: 'unique-call-id',     // Required
  container: '#container',      // DOM element or selector
  inactiveText: 'Talk to AI',   // Button text when idle
  activeText: 'Listening...',   // Button text when recording
  size: 'medium',               // 'small', 'medium', 'large'
  className: 'custom-class'     // Additional CSS classes
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
  .on('onError', (error) => console.error('Error:', error));
```

## React Example

```jsx
import { useEffect, useRef } from 'react';
import { VocalCallSDK } from 'vocal-call-sdk';

function VoiceCall({ agentId }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const sdk = new VocalCallSDK({
      agentId,
      callId: `call-${Date.now()}`,
      container: containerRef.current
    });

    sdk.renderButton();
    return () => sdk.destroy();
  }, [agentId]);

  return <div ref={containerRef} />;
}
```

## Browser Requirements

- Chrome 60+, Firefox 55+, Safari 11+, Edge 79+
- WebSocket, Web Audio API, getUserMedia support

## License

This project is licensed under the MIT License.