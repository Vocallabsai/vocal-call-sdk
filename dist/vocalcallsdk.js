

// Default N8N endpoint for uploads
const DEFAULT_UPLOAD_ENDPOINT = "https://n8n.subspace.money/webhook/8ec94330-a43d-46b5-91dc-53ee2373c169";

/**
 * Enhanced dual-stream audio processor with user + agent recording capabilities
 * Based on the sophisticated recording system from the original React component
 */
class DualStreamAudioProcessor {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    
    // Dual-stream recording system (matches original implementation)
    this.micRecordingData = [];     // User voice only
    this.agentRecordingData = [];   // Agent voice only - continuous buffer
    this.isCallRecording = false;
    this.callRecordingSampleRate = sampleRate;
    
    // Anti-jitter buffer system for agent audio
    this.agentRecordingBuffer = [];  // Continuous buffer for agent audio
    this.agentBufferSampleRate = sampleRate;
    this.lastAgentBufferTime = 0;
    this.minBufferChunks = 10;
    this.isBuffering = false;
  }

  startRecording() {
    this.micRecordingData = [];
    this.agentRecordingData = [];
    this.agentRecordingBuffer = [];
    this.isCallRecording = true;
    this.lastAgentBufferTime = 0;
    console.log('[DUAL_STREAM] Started dual-stream recording');
  }

  stopRecording() {
    this.isCallRecording = false;
    
    // Convert agent buffer to final recording data
    this._finalizeAgentRecording();
    
    if (this.micRecordingData.length > 0 || this.agentRecordingData.length > 0) {
      // Combine both streams properly at same sample rate
      const maxLength = Math.max(this.micRecordingData.length, this.agentRecordingData.length);
      const combinedData = new Float32Array(maxLength);
      
      // Mix both audio streams (matches original mixing logic)
      for (let i = 0; i < maxLength; i++) {
        const micSample = i < this.micRecordingData.length ? this.micRecordingData[i] : 0;
        const agentSample = i < this.agentRecordingData.length ? this.agentRecordingData[i] : 0;
        
        // Simple mixing - slightly favor user voice (matches original)
        combinedData[i] = (micSample + agentSample * 0.8) / 1.8;
      }
      
      console.log(`[DUAL_STREAM] Created combined recording: ${combinedData.length} samples`);
      const wavBlob = this.createWavBlob(combinedData, this.callRecordingSampleRate);
      return wavBlob;
    }
    
    console.log('[DUAL_STREAM] No recording data available');
    return null;
  }

  // Add microphone audio continuously (matches original)
  addMicRecordingData(audioData) {
    if (this.isCallRecording && audioData) {
      this.micRecordingData.push(...audioData);
      
      // Sync agent recording length to match microphone
      this._syncAgentRecordingLength();
    }
  }

  // Add agent audio to continuous buffer (anti-jitter) (matches original)
  addAgentRecordingData(audioData, sampleRate) {
    if (!this.isCallRecording || !audioData) return;
    
    // Resample to target sample rate if needed
    let resampledData = audioData;
    if (sampleRate !== this.agentBufferSampleRate) {
      resampledData = this._resampleAudio(audioData, sampleRate, this.agentBufferSampleRate);
    }
    
    // Add to continuous buffer
    this.agentRecordingBuffer.push(...resampledData);
  }

  // Sync agent recording length to match microphone (eliminates jitter) (matches original)
  _syncAgentRecordingLength() {
    const targetLength = this.micRecordingData.length;
    
    if (this.agentRecordingData.length < targetLength) {
      // Need to add more agent data
      const needed = targetLength - this.agentRecordingData.length;
      const available = this.agentRecordingBuffer.length - this.lastAgentBufferTime;
      
      if (available > 0) {
        const toTake = Math.min(needed, available);
        const startIndex = this.lastAgentBufferTime;
        const endIndex = startIndex + toTake;
        
        // Extract audio from buffer
        const agentSlice = this.agentRecordingBuffer.slice(startIndex, endIndex);
        
        // Ensure we have enough data
        if (agentSlice.length < needed) {
          // Pad with silence if not enough agent audio
          const paddedSlice = new Float32Array(needed);
          paddedSlice.set(agentSlice);
          this.agentRecordingData.push(...paddedSlice);
        } else {
          this.agentRecordingData.push(...agentSlice);
        }
        
        this.lastAgentBufferTime = endIndex;
      } else {
        // No agent audio available, add silence
        const silence = new Float32Array(needed);
        this.agentRecordingData.push(...silence);
      }
    }
  }

  // Finalize agent recording from buffer (matches original)
  _finalizeAgentRecording() {
    // Make sure agent recording matches microphone length
    const targetLength = this.micRecordingData.length;
    
    if (this.agentRecordingData.length < targetLength) {
      const needed = targetLength - this.agentRecordingData.length;
      const available = this.agentRecordingBuffer.length - this.lastAgentBufferTime;
      
      if (available > 0) {
        const toTake = Math.min(needed, available);
        const agentSlice = this.agentRecordingBuffer.slice(this.lastAgentBufferTime, this.lastAgentBufferTime + toTake);
        this.agentRecordingData.push(...agentSlice);
      }
      
      // Pad with silence if still not enough
      if (this.agentRecordingData.length < targetLength) {
        const stillNeeded = targetLength - this.agentRecordingData.length;
        const silence = new Float32Array(stillNeeded);
        this.agentRecordingData.push(...silence);
      }
    }
  }

  // Simple linear resampling function (matches original)
  _resampleAudio(inputData, inputSampleRate, outputSampleRate) {
    if (inputSampleRate === outputSampleRate) {
      return inputData;
    }
    
    const ratio = inputSampleRate / outputSampleRate;
    const outputLength = Math.floor(inputData.length / ratio);
    const outputData = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const inputIndex = i * ratio;
      const lowerIndex = Math.floor(inputIndex);
      const upperIndex = Math.min(Math.ceil(inputIndex), inputData.length - 1);
      const fraction = inputIndex - lowerIndex;
      
      // Linear interpolation
      const lowerValue = inputData[lowerIndex] || 0;
      const upperValue = inputData[upperIndex] || 0;
      outputData[i] = lowerValue + (upperValue - lowerValue) * fraction;
    }
    
    return outputData;
  }

  createWavBlob(audioData, sampleRate = 48000, numChannels = 1) {
    const length = audioData.length;
    const bytesPerSample = 2; // 16-bit
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * bytesPerSample;
    const fileSize = 36 + dataSize;
    
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    // Helper function to write strings
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    // WAV header with proper values
    writeString(0, 'RIFF');                    // ChunkID
    view.setUint32(4, fileSize, true);         // ChunkSize (file size - 8)
    writeString(8, 'WAVE');                    // Format
    writeString(12, 'fmt ');                   // Subchunk1ID
    view.setUint32(16, 16, true);              // Subchunk1Size (PCM = 16)
    view.setUint16(20, 1, true);               // AudioFormat (PCM = 1)
    view.setUint16(22, numChannels, true);     // NumChannels
    view.setUint32(24, sampleRate, true);      // SampleRate
    view.setUint32(28, byteRate, true);        // ByteRate
    view.setUint16(32, blockAlign, true);      // BlockAlign
    view.setUint16(34, 16, true);              // BitsPerSample
    writeString(36, 'data');                   // Subchunk2ID
    view.setUint32(40, dataSize, true);        // Subchunk2Size
    
    // Better sample conversion for recordings
    let offset = 44;
    let maxSample = 0;
    
    // First pass: find the maximum sample for intelligent normalization
    for (let i = 0; i < length; i++) {
      maxSample = Math.max(maxSample, Math.abs(audioData[i]));
    }
    
    // Calculate normalization factor (prevent over-amplification of noise)
    const normalizationFactor = maxSample > 0.05 ? Math.min(0.95 / maxSample, 4.0) : 1.0;
    
    // Second pass: convert to 16-bit with intelligent normalization
    for (let i = 0; i < length; i++) {
      let sample = audioData[i] * normalizationFactor;
      
      // Gentle limiting to prevent harsh clipping in recordings
      sample = Math.max(-0.98, Math.min(0.98, sample));
      
      // Convert to 16-bit integer with proper scaling
      const intSample = Math.round(sample * 32767);
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }

  getRecordingStats() {
    return {
      micSamples: this.micRecordingData.length,
      agentSamples: this.agentRecordingData.length,
      agentBufferSamples: this.agentRecordingBuffer.length,
      isRecording: this.isCallRecording
    };
  }
}

/**
 * Upload call recording to R2 storage via n8n endpoint
 */
async function uploadCallRecording(recordingBlob, callId, uploadEndpoint = DEFAULT_UPLOAD_ENDPOINT) {
  try {
    const presignedResponse = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        call_id: callId
      })
    });

    if (!presignedResponse.ok) {
      throw new Error(`Failed to get presigned URL: ${presignedResponse.status} ${presignedResponse.statusText}`);
    }

    const presignedData = await presignedResponse.json();

    if (!presignedData.success || !presignedData.presigned_url) {
      throw new Error('Invalid presigned URL response: ' + JSON.stringify(presignedData));
    }

    const { presigned_url: presignedUrl, download_url: downloadUrl, file_key: fileKey } = presignedData;

    // Upload the recording to the presigned URL
    const uploadResponse = await fetch(presignedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'audio/wav',
      },
      body: recordingBlob
    });

    if (!uploadResponse.ok) {
      throw new Error(`Failed to upload recording: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }

    console.log('[UPLOAD] Download URL:', downloadUrl);

    return {
      success: true,
      downloadUrl: downloadUrl,
      fileKey: fileKey,
      uploadSize: recordingBlob.size
    };

  } catch (error) {
    console.error('[UPLOAD] Error uploading recording:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

export class VocalCallSDK {
  constructor({
    agentId,
    callId,
    inactiveText = 'Talk to Assistant',
    activeText = 'Listening...',
    size = 'medium',
    className = '',
    container = null,
    config = {}
  }) {
    // Core configuration
    this.agentId = agentId;
    this.callId = callId;
    this.inactiveText = inactiveText;
    this.activeText = activeText;
    this.size = size;
    this.className = className;
    this.container = container;
    
    // Default endpoints and settings with recording options
    this.config = {
      endpoints: {
        websocket: 'wss://call-dev.vocallabs.ai/ws/',
        upload: DEFAULT_UPLOAD_ENDPOINT
      },
      audio: {
        sampleRate: 48000,
        echoCancellation: true,
        noiseSuppression: true
      },
      recording: {
        enabled: true,
        autoUpload: true,
        uploadOnCallEnd: true
      },
      ...config
    };

    // Internal state
    this.status = 'idle';
    this.isRecording = false;
    this.lastDisconnectReason = null;
    this.recordingBlob = null; // Store recording blob to prevent double-stop issues
    
    // Core components
    this.wsClient = null;
    this.audioService = null;
    this.audioProcessor = null; // NEW: Enhanced dual-stream processor
    this.buttonElement = null;
    this.statusElement = null;
    
    // Timing and state tracking
    this.startTime = null;
    this.endTime = null;
    this.connectionTimer = null;
    
    // Event callbacks - EXPANDED with upload events
    this.eventCallbacks = {
      onCallStart: [],
      onCallEnd: [],
      onRecordingStart: [],
      onRecordingStop: [],
      onStatusChange: [],
      onError: [],
      onUploadStart: [],
      onUploadSuccess: [],
      onUploadError: []
    };

    // Initialize the SDK
    this._initializeComponents();
  }

  /* ------------------------------------------------------------------
   *  Public API Methods
   * ----------------------------------------------------------------*/

  on(event, callback) {
    if (this.eventCallbacks[event]) {
      this.eventCallbacks[event].push(callback);
    }
    return this;
  }

  off(event, callback) {
    if (this.eventCallbacks[event]) {
      const index = this.eventCallbacks[event].indexOf(callback);
      if (index > -1) {
        this.eventCallbacks[event].splice(index, 1);
      }
    }
    return this;
  }

  async startCall() {
    return this._handleButtonClick();
  }

  async endCall() {
    if (this.isRecording) {
      return this._handleButtonClick();
    }
  }

  getStatus() {
    return {
      status: this.status,
      isRecording: this.isRecording,
      isConnected: this.wsClient?.isConnected || false,
      lastDisconnectReason: this.lastDisconnectReason,
      recordingStats: this.audioProcessor?.getRecordingStats() || null
    };
  }

  renderButton(containerElement = null) {
    const target = containerElement || this.container;
    if (!target) {
      console.error('[VocalCallSDK] No container specified for button rendering');
      return;
    }

    const container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container) {
      console.error('[VocalCallSDK] Container element not found');
      return;
    }

    this._createButtonUI(container);
    return this;
  }

  destroy() {
    this._cleanup();
    if (this.buttonElement) {
      this.buttonElement.remove();
    }
    if (this.statusElement) {
      this.statusElement.remove();
    }
  }

  /* ------------------------------------------------------------------
   *  Core Audio and WebSocket Classes (Internal)
   * ----------------------------------------------------------------*/

  _initializeComponents() {
    this._initializeWebSocketClient();
    this._initializeAudioService();
    
    // NEW: Initialize dual-stream audio processor for recording
    if (this.config.recording.enabled) {
      this.audioProcessor = new DualStreamAudioProcessor(this.config.audio.sampleRate);
    }
  }

  _initializeWebSocketClient() {
    this.wsClient = {
      socket: null,
      isConnected: false,
      manualDisconnect: false,
      streamId: null,
      disconnectSource: null,

      connect: () => {
        if (this.wsClient.socket) {
          try { this.wsClient.socket.close(); } catch {}
        }
        
        const url = `${this.config.endpoints.websocket}?agent=${this.agentId.trim()}_${this.callId.trim()}_web_48000`;
        this.wsClient.socket = new WebSocket(url);

        this.wsClient.socket.onopen = (e) => this._handleWSOpen(e);
        this.wsClient.socket.onmessage = (e) => this._handleWSMessage(e);
        this.wsClient.socket.onclose = (e) => this._handleWSClose(e);
        this.wsClient.socket.onerror = (e) => this._handleWSError(e);
      },

      disconnect: async (source = 'manual') => {
        if (!this.wsClient.socket) return;
        
        this.wsClient.disconnectSource = source;
        this.wsClient.manualDisconnect = true;
        
        // NEW: Handle recording upload before disconnecting
        await this._handleRecordingUpload(source);
        
        try {
          if (this.wsClient.socket.readyState === WebSocket.OPEN) {
            this.wsClient.socket.send(JSON.stringify({ 
              event: 'disconnect', 
              reason: 'Client disconnected' 
            }));
          }
          this.wsClient.socket.onopen = this.wsClient.socket.onmessage = 
          this.wsClient.socket.onclose = this.wsClient.socket.onerror = null;
          this.wsClient.socket.close(1000, 'Client disconnected');
        } finally {
          this.wsClient.isConnected = false;
          this.wsClient.socket = null;
          this._triggerEvent('onCallEnd', this.wsClient.disconnectSource);
        }
      },

      sendAudio: (buffer) => {
        if (!this.wsClient.isConnected) return false;
        if (!this.wsClient.streamId) {
          this.wsClient.streamId = 'MZ' + Math.random().toString(36).slice(2);
        }
        const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        try {
          this.wsClient.socket.send(JSON.stringify({
            event: 'media',
            media: { 
              track: 'inbound', 
              timestamp: Date.now().toString(), 
              payload: b64 
            },
            streamId: this.wsClient.streamId
          }));
          return true;
        } catch (e) {
          console.error('[WS] Error sending audio:', e);
          return false;
        }
      },

      sendPlayedStream: () => {
        if (!this.wsClient.isConnected) return;
        try { 
          this.wsClient.socket.send(JSON.stringify({ 
            event: 'playedStream', 
            name: 'audio' 
          })); 
        } catch {}
      }
    };
  }

  _initializeAudioService() {
    this.audioService = {
      audioContext: null,
      stream: null,
      processor: null,
      source: null,
      isRecording: false,
      audioQueue: [],
      isPlaying: false,
      nextTime: 0,
      activeSources: new Set(),
      queueTimer: null,
      pendingCheckpoint: false,
      minBufferChunks: 10,
      isBuffering: false,

      initialize: async () => {
        this.audioService.audioContext = new (window.AudioContext || window.webkitAudioContext)({ 
          sampleRate: this.config.audio.sampleRate 
        });
        return true;
      },

      startRecording: async (sendFn) => {
        if (this.audioService.isRecording) return false;
        if (!this.audioService.audioContext) await this.audioService.initialize();
        if (this.audioService.audioContext.state === 'suspended') {
          await this.audioService.audioContext.resume();
        }

        try {
          this.audioService.stream = await navigator.mediaDevices.getUserMedia({
            audio: { 
              channelCount: 1, 
              sampleRate: this.config.audio.sampleRate, 
              echoCancellation: this.config.audio.echoCancellation, 
              noiseSuppression: this.config.audio.noiseSuppression 
            }
          });
          
          this.audioService.source = this.audioService.audioContext.createMediaStreamSource(this.audioService.stream);
          
          // Try to use modern AudioWorkletNode, fallback to ScriptProcessorNode
          let useAudioWorklet = false;
          try {
            if (this.audioService.audioContext.audioWorklet) {
              // Create inline AudioWorklet processor
              const processorCode = `
                class AudioProcessor extends AudioWorkletProcessor {
                  process(inputs, outputs, parameters) {
                    const input = inputs[0];
                    if (input.length > 0) {
                      const inputData = input[0];
                      this.port.postMessage(inputData);
                    }
                    return true;
                  }
                }
                registerProcessor('audio-processor', AudioProcessor);
              `;
              
              const processorBlob = new Blob([processorCode], { type: 'application/javascript' });
              const processorUrl = URL.createObjectURL(processorBlob);
              
              await this.audioService.audioContext.audioWorklet.addModule(processorUrl);
              
              this.audioService.processor = new AudioWorkletNode(this.audioService.audioContext, 'audio-processor');
              
              this.audioService.processor.port.onmessage = (event) => {
                if (!this.audioService.isRecording) return;
                const float = event.data;
                
                // NEW: Add microphone audio to dual-stream recorder
                if (this.config.recording.enabled && this.audioProcessor) {
                  this.audioProcessor.addMicRecordingData(float);
                }
                
                // WebSocket sending logic
                const int16 = new Int16Array(float.length);
                for (let i = 0; i < float.length; i++) {
                  const v = Math.max(-1, Math.min(1, float[i]));
                  int16[i] = Math.round(v * 32767);
                }
                
                sendFn(int16.buffer);
              };
              
              URL.revokeObjectURL(processorUrl);
              useAudioWorklet = true;
              console.log('[AUDIO] Using modern AudioWorkletNode');
            }
          } catch (workletError) {
            console.log('[AUDIO] AudioWorklet not supported, falling back to ScriptProcessorNode');
          }
          
          // Fallback to ScriptProcessorNode if AudioWorklet fails
          if (!useAudioWorklet) {
            this.audioService.processor = this.audioService.audioContext.createScriptProcessor(1024, 1, 1);

            this.audioService.processor.onaudioprocess = e => {
              if (!this.audioService.isRecording) return;
              const float = e.inputBuffer.getChannelData(0);
              
              // NEW: Add microphone audio to dual-stream recorder (matches original)
              if (this.config.recording.enabled && this.audioProcessor) {
                this.audioProcessor.addMicRecordingData(float);
              }
              
              // Original WebSocket sending logic
              const int16 = new Int16Array(float.length);
              for (let i = 0; i < float.length; i++) {
                const v = Math.max(-1, Math.min(1, float[i]));
                int16[i] = Math.round(v * 32767);
              }
              
              sendFn(int16.buffer);
            };
          }

          // NEW: Start dual-stream recording collection
          if (this.config.recording.enabled && this.audioProcessor) {
            this.audioProcessor.startRecording();
          }

          this.audioService.source.connect(this.audioService.processor);
          this.audioService.processor.connect(this.audioService.audioContext.destination);
          this.audioService.isRecording = true;
          this.isRecording = true;
          
          this._triggerEvent('onRecordingStart');
          this._updateUI();
          
          return true;
        } catch (error) {
          console.error('[RECORDING] Failed to start recording:', error);
          this._triggerEvent('onError', error);
          return false;
        }
      },

      stopRecording: () => {
        if (!this.audioService.isRecording) return this.recordingBlob; // Return stored blob if already stopped
        
        this.audioService.isRecording = false;
        this.isRecording = false;
        
        // NEW: Get the combined recording blob from dual-stream processor and store it
        if (this.config.recording.enabled && this.audioProcessor) {
          this.recordingBlob = this.audioProcessor.stopRecording();
          console.log('[RECORDING] Stored recording blob:', this.recordingBlob ? `${this.recordingBlob.size} bytes` : 'null');
        }
        
        this._triggerEvent('onRecordingStop');
        this._updateUI();
        
        try {
          if (this.audioService.processor) {
            if (this.audioService.processor.port) {
              // AudioWorkletNode cleanup
              this.audioService.processor.port.onmessage = null;
            }
            this.audioService.processor.disconnect();
          }
          if (this.audioService.source) {
            this.audioService.source.disconnect();
          }
          if (this.audioService.stream) {
            this.audioService.stream.getTracks().forEach(t => t.stop());
          }
        } catch (error) {
          console.error('[DISCONNECT] Error stopping recording:', error);
        }
        
        return this.recordingBlob;
      },

      playAudio: async (buffer, sr = 48000) => {
        if (!this.audioService.audioContext) await this.audioService.initialize();
        if (this.audioService.audioContext.state === 'suspended') {
          await this.audioService.audioContext.resume();
        }

        try {
          const int16 = new Int16Array(buffer);
          
          // Convert to float for processing
          const float = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) {
            float[i] = int16[i] / 32768.0;
          }
          
          // NEW: Add agent audio to dual-stream recorder (matches original)
          if (this.config.recording.enabled && this.audioProcessor) {
            this.audioProcessor.addAgentRecordingData(float, sr);
          }
          
          const processedFloat = this._processIncomingAudio(float);
          const audioBuffer = this.audioService.audioContext.createBuffer(1, processedFloat.length, sr);
          audioBuffer.getChannelData(0).set(processedFloat);

          this.audioService.audioQueue.push(audioBuffer);
          if (!this.audioService.isPlaying && this.audioService.audioQueue.length >= this.audioService.minBufferChunks) {
            this.audioService.isBuffering = false;
            this._processAudioQueue();
          }
        } catch (error) {
          console.error('[PLAYBACK] Error playing audio:', error);
        }
      },

      clearAudio: () => {
        if (this.audioService.queueTimer) { 
          clearTimeout(this.audioService.queueTimer); 
          this.audioService.queueTimer = null; 
        }
        this.audioService.activeSources.forEach(src => { 
          try { src.stop(); } catch {} 
        });
        this.audioService.activeSources.clear();
        this.audioService.audioQueue = [];
        this.audioService.isPlaying = false;
        this.audioService.nextTime = this.audioService.audioContext?.currentTime || 0;
        this.audioService.pendingCheckpoint = false;
        this.audioService.isBuffering = false;
      },

      handleCheckpoint: () => {
        if (this.audioService.audioQueue.length === 0 && this.audioService.activeSources.size === 0) {
          if (this.wsClient.isConnected) this.wsClient.sendPlayedStream();
        } else {
          this.audioService.pendingCheckpoint = true;
        }
      },

      cleanup: () => {
        if (this.audioService.isRecording) this.audioService.stopRecording();
        this.audioService.clearAudio();
        if (this.audioService.audioContext && this.audioService.audioContext.state !== 'closed') {
          this.audioService.audioContext.close();
        }
      }
    };
  }

  /* ------------------------------------------------------------------
   *  Enhanced Recording Upload Handler
   * ----------------------------------------------------------------*/

  async _handleRecordingUpload(disconnectSource) {
    if (!this.config.recording.enabled || 
        !this.config.recording.uploadOnCallEnd || 
        !this.audioProcessor) {
      return;
    }

    try {
      // Use stored recording blob instead of stopping recording again
      let recordingBlob = this.recordingBlob;
      
      // If we don't have a stored blob, try to get it from stopping recording
      if (!recordingBlob && this.audioService.isRecording) {
        recordingBlob = this.audioService.stopRecording();
      }
      
      if (!recordingBlob || recordingBlob.size === 0) {
        console.log('[UPLOAD] No recording data to upload');
        return;
      }

      console.log(`[UPLOAD] Starting upload for call ${this.callId}, size: ${recordingBlob.size} bytes`);
      const stats = this.audioProcessor.getRecordingStats();
      console.log('[UPLOAD] Recording stats:', stats);
      
      this._triggerEvent('onUploadStart', { callId: this.callId, size: recordingBlob.size, stats });

      const result = await uploadCallRecording(
        recordingBlob, 
        this.callId, 
        this.config.endpoints.upload
      );

      if (result.success) {
        console.log('[UPLOAD] Recording uploaded successfully:', result.downloadUrl);
        this._triggerEvent('onUploadSuccess', {
          callId: this.callId,
          downloadUrl: result.downloadUrl,
          fileKey: result.fileKey,
          uploadSize: result.uploadSize,
          disconnectSource,
          stats
        });
      } else {
        console.error('[UPLOAD] Recording upload failed:', result.error);
        this._triggerEvent('onUploadError', {
          callId: this.callId,
          error: result.error,
          disconnectSource,
          stats
        });
      }

    } catch (error) {
      console.error('[UPLOAD] Unexpected error during recording upload:', error);
      this._triggerEvent('onUploadError', {
        callId: this.callId,
        error: error.message,
        disconnectSource
      });
    }
  }

  /* ------------------------------------------------------------------
   *  WebSocket Event Handlers (Enhanced for dual-stream recording)
   * ----------------------------------------------------------------*/

  _handleWSOpen(evt) {
    this.wsClient.isConnected = true;
    this.wsClient.manualDisconnect = false;
    this.wsClient.disconnectSource = null;
    
    // Clear any previous recording blob
    this.recordingBlob = null;
    
    this.wsClient.socket.send(JSON.stringify({
      event: 'start',
      start: { 
        streamId: 'inbound', 
        mediaFormat: { 
          Encoding: 'audio/x-l16', 
          sampleRate: 48000 
        } 
      }
    }));

    clearTimeout(this.connectionTimer);
    this._setStatus('connected');
    this.startTime = new Date();
    this.endTime = null;
    
    this._startRecording();
    this._triggerEvent('onCallStart');
  }

  async _handleWSMessage(evt) {
    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch (e) {
      return;
    }
 
    if (msg.event === 'hangup') {
      this.endTime = new Date();
      this._stopEverything('agent');
      if (this.wsClient.isConnected) {
        await this.wsClient.disconnect('agent');
      }
      this._setStatus('idle');
      this.lastDisconnectReason = 'agent';
    } else if (msg.event === 'media' && msg.media?.payload) {
      // Handle server audio (agent voice)
      if (msg.media.track === 'outbound' || !msg.media.track) {
        try {
          const bin = Uint8Array.from(atob(msg.media.payload), c => c.charCodeAt(0)).buffer;
          await this.audioService.playAudio(bin, 48000); // This will record agent audio
       
        } catch (error) {
          console.error('[PLAYBACK] Error processing server audio:', error);
        }
      }
    } else if (msg.event === 'playAudio' && msg.media?.payload) {
      // Backward compatibility for agent audio
      try {
        const bin = Uint8Array.from(atob(msg.media.payload), c => c.charCodeAt(0)).buffer;
        await this.audioService.playAudio(bin, 48000); // This will record agent audio
      } catch (error) {
        console.error('[PLAYBACK] Error processing agent audio:', error);
      }
    } else if (msg.event === 'clearAudio') {
      this.audioService.clearAudio();
    } else if (msg.event === 'checkpoint') {
      this.audioService.handleCheckpoint();
    } else if (msg.event === 'error') {
      this._stopEverything('error_event');
      this._setStatus('error');
    }
  }

  async _handleWSClose(evt) {
    if (!this.wsClient.isConnected) return;
    
    this.wsClient.isConnected = false;
    const source = this.wsClient.manualDisconnect ? 
      this.wsClient.disconnectSource || 'manual_disconnect' : 
      'server_initiated';
    
    // NEW: Handle recording upload before cleanup
    await this._handleRecordingUpload(source);
    
    this._stopEverything(`ws_disconnected_${source}`);
    this._setStatus('idle');
    this.lastDisconnectReason = source;
  }

  _handleWSError(err) {
    this.wsClient.isConnected = false;
    this._setStatus('error');
    this._triggerEvent('onError', err);
  }

  /* ------------------------------------------------------------------
   *  Audio Processing Methods (Enhanced with buffering)
   * ----------------------------------------------------------------*/

  _processIncomingAudio(audioData) {
    const processed = new Float32Array(audioData.length);
    let maxSample = 0;
    
    for (let i = 0; i < audioData.length; i++) {
      maxSample = Math.max(maxSample, Math.abs(audioData[i]));
    }
    
    const normalizationFactor = maxSample > 0.1 ? Math.min(0.85 / maxSample, 2.5) : 1.8;
    
    for (let i = 0; i < audioData.length; i++) {
      let sample = audioData[i];
      
      if (Math.abs(sample) < 0.002) {
        sample = 0;
      }
      
      sample *= normalizationFactor;
      
      if (sample > 0.9) sample = 0.9 + (sample - 0.9) * 0.1;
      if (sample < -0.9) sample = -0.9 + (sample + 0.9) * 0.1;
      
      processed[i] = sample;
    }
    
    return processed;
  }

  _processAudioQueue() {
    // if (this.audioService.audioQueue.length === 0) {
    //   this.audioService.isPlaying = false;
    //   this.audioService.isBuffering = true;
    //   this._maybeAck();
    //   return;
    // }
    if (this.audioService.audioQueue.length === 0) {
      this.audioService.isPlaying = false;
      this._maybeAck();
      return;
    }

    this.audioService.isPlaying = true;
    const now = this.audioService.audioContext.currentTime;
    this.audioService.nextTime = Math.max(this.audioService.nextTime, now + 0.005);

    const buffer = this.audioService.audioQueue.shift();
    const source = this.audioService.audioContext.createBufferSource();
    source.buffer = buffer;
    
    const playbackGain = this.audioService.audioContext.createGain();
    playbackGain.gain.value = 1.2;
    
    const filter = this.audioService.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 8000;
    filter.Q.value = 0.5;
    
    source.connect(filter);
    filter.connect(playbackGain);
    playbackGain.connect(this.audioService.audioContext.destination);
    
    source.start(this.audioService.nextTime);

    this.audioService.activeSources.add(source);
    source.onended = () => {
      this.audioService.activeSources.delete(source);
      this._maybeAck();
    };

    this.audioService.nextTime += buffer.duration;
    
    // Enhanced buffering logic (matches original)
    // if (this.audioService.audioQueue.length >= this.audioService.minBufferChunks) {
    //   this.audioService.queueTimer = setTimeout(() => this._processAudioQueue(), 1);
    // } else if (this.audioService.audioQueue.length === 0) {
    //   this.audioService.isPlaying = false;
    //   this.audioService.isBuffering = true;
    //   this._maybeAck();
    // } else {
    //   this.audioService.isPlaying = false;  
    //   this.audioService.isBuffering = true;
    // }
    this.audioService.queueTimer = setTimeout(() => this._processAudioQueue(), 3);
  }

  _maybeAck() {
    if (this.audioService.pendingCheckpoint && this.audioService.audioQueue.length <= 1){
      this.audioService.pendingCheckpoint = false;
      if (this.wsClient.isConnected) this.wsClient.sendPlayedStream();
    }
  }

  async _startRecording() {
    if (!this.wsClient.isConnected) {
      this._setStatus('error');
      return;
    }
    
    const ok = await this.audioService.startRecording(buf => {
      if (this.wsClient.isConnected) {
        return this.wsClient.sendAudio(buf);
      }
      return false;
    });
    
    if (!ok) {
      console.error('[RECORDING] Failed to start recording');
      this._setStatus('error');
    }
  }

  _stopEverything(reason = 'manual') {
    if (this.audioService.isRecording) {
      this.audioService.stopRecording();
    }
    this.audioService.clearAudio();
  }

  async _handleButtonClick() {
    if (!this.agentId || !this.callId) { 
      this._setStatus('error'); 
      return; 
    }

    await this.audioService.audioContext?.resume().catch(() => {});

    if (this.isRecording) {
      if (!this.endTime) {
        this.endTime = new Date();
      }
      
      this._stopEverything('user_clicked_stop');
      await this.wsClient.disconnect('user');
      this._setStatus('idle');
      this.lastDisconnectReason = 'user';
      return;
    }

    if (this.status === 'idle' || this.status === 'error') {
      this._setStatus('connecting');
      this.wsClient.manualDisconnect = false;
      this.wsClient.connect();

      this.connectionTimer = setTimeout(() => {
        if (!this.wsClient.isConnected) {
          this._setStatus('error');
          
          if (this.wsClient.socket) {
            this.wsClient.manualDisconnect = true;
            this.wsClient.disconnect('connection_timeout');
          }
        }
      }, 8000);
      return;
    }

    if (this.status === 'connected' && !this.isRecording) {
      this._startRecording();
    }
  }

  _createButtonUI(container) {
    const wrapper = document.createElement('div');
    wrapper.className = 'vocal-call-wrapper inline-flex flex-col items-center gap-1';
    
    this.buttonElement = document.createElement('button');
    this.buttonElement.className = this._getButtonClasses();
    this.buttonElement.setAttribute('aria-label', this.isRecording ? 'Stop recording' : 'Start recording');
    this.buttonElement.addEventListener('click', () => this._handleButtonClick());
    
    this.statusElement = document.createElement('div');
    this.statusElement.className = 'text-xs font-medium';
    
    wrapper.appendChild(this.buttonElement);
    wrapper.appendChild(this.statusElement);
    container.appendChild(wrapper);
    
    this._updateUI();
  }

  _getButtonClasses() {
    const baseClasses = 'relative font-medium shadow transition text-white';
    
    const sizeClasses = {
      'small': 'px-3 py-1 text-sm rounded-md',
      'medium': 'px-4 py-2 text-base rounded-lg',
      'large': 'px-6 py-3 text-lg rounded-xl'
    };

    const statusClasses = {
      'connecting': 'bg-amber-500 cursor-not-allowed opacity-50',
      'error': 'bg-rose-600 cursor-not-allowed opacity-50',
      'connected': this.isRecording ? 'bg-red-600 hover:brightness-110' : 'bg-green-600 hover:brightness-110',
      'idle': 'bg-slate-700/80 hover:brightness-110'
    };

    return [
      baseClasses,
      sizeClasses[this.size] || sizeClasses.medium,
      statusClasses[this.status] || statusClasses.idle,
      this.className
    ].filter(Boolean).join(' ');
  }

  _updateUI() {
    if (!this.buttonElement) return;
    
    const buttonText = this.isRecording ? this.activeText : this.inactiveText;
    
    this.buttonElement.className = this._getButtonClasses();
    this.buttonElement.innerHTML = `
      ${buttonText}
      <span class="ml-2 inline-block h-2 w-2 rounded-full bg-white/70 animate-ping"></span>
    `;
    this.buttonElement.disabled = this.status === 'connecting' || this.status === 'error';
    this.buttonElement.setAttribute('aria-label', this.isRecording ? 'Stop recording' : 'Start recording');
    
    if (this.statusElement) {
      let statusText = '';
      let statusClass = '';
      
      if (this.status === 'connecting') {
        statusText = 'Connecting…';
        statusClass = 'text-amber-500';
      } else if (this.status === 'error') {
        statusText = 'Connection error. Try again.';
        statusClass = 'text-rose-600';
      }
      
      this.statusElement.textContent = statusText;
      this.statusElement.className = `text-xs font-medium ${statusClass}`;
    }
    
    this._triggerEvent('onStatusChange', this.getStatus());
  }

  _setStatus(newStatus) {
    this.status = newStatus;
    this._updateUI();
  }

  _triggerEvent(eventName, ...args) {
    this.eventCallbacks[eventName]?.forEach(callback => {
      try {
        callback(...args);
      } catch (error) {
        console.error(`Error in ${eventName} callback:`, error);
      }
    });
  }

  _cleanup() {
    clearTimeout(this.connectionTimer);
    
    // Clear recording blob
    this.recordingBlob = null;
    
    this._stopEverything('component_unmount');
    if (this.wsClient) {
      this.wsClient.disconnect('component_unmount');
    }
    if (this.audioService) {
      this.audioService.cleanup();
    }
    
    // NEW: Cleanup audio processor
    if (this.audioProcessor) {
      this.audioProcessor = null;
    }
  }
}

// Export for npm package
export default VocalCallSDK;
