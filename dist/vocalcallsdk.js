/* ------------------------------------------------------------------
 *  VocalCallSDK - Complete Audio Call Management Class
 * ----------------------------------------------------------------*/

export class VocalCallSDK {
  constructor({
    agentId,
    callId,
    inactiveText = 'Talk to Assistant',
    activeText = 'Listening...',
    size = 'medium',
    className = '',
    container = null, // DOM element or selector where to render button
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
    
    // Default endpoints and settings
    this.config = {
      endpoints: {
        websocket: 'wss://call-dev.vocallabs.ai/ws/',
        callUpdate: 'https://n8n.subspace.money/webhook/8ec94330-a43d-46b5-91dc-53ee2373cc23',
        recordingUpload: 'https://n8n.subspace.money/webhook/8ec94330-a43d-46b5-91dc-53ee2373c169'
      },
      audio: {
        sampleRate: 48000,
        echoCancellation: true,
        noiseSuppression: true
      },
      ...config
    };

    // Internal state
    this.status = 'idle'; // idle, connecting, connected, error
    this.isRecording = false;
    this.isUploading = false;
    this.lastDisconnectReason = null;
    
    // Core components
    this.wsClient = null;
    this.audioService = null;
    this.buttonElement = null;
    this.statusElement = null;
    
    // Timing and state tracking
    this.startTime = null;
    this.endTime = null;
    this.callUpdateSent = false;
    this.connectionTimer = null;
    
    // Event callbacks
    this.eventCallbacks = {
      onCallStart: [],
      onCallEnd: [],
      onRecordingStart: [],
      onRecordingStop: [],
      onRecordingReady: [],
      onStatusChange: [],
      onError: []
    };

    // Initialize the SDK
    this._initializeComponents();
  }

  /* ------------------------------------------------------------------
   *  Public API Methods
   * ----------------------------------------------------------------*/

  /**
   * Add event listeners
   */
  on(event, callback) {
    if (this.eventCallbacks[event]) {
      this.eventCallbacks[event].push(callback);
    }
    return this;
  }

  /**
   * Remove event listeners
   */
  off(event, callback) {
    if (this.eventCallbacks[event]) {
      const index = this.eventCallbacks[event].indexOf(callback);
      if (index > -1) {
        this.eventCallbacks[event].splice(index, 1);
      }
    }
    return this;
  }

  /**
   * Start a call programmatically
   */
  async startCall() {
    return this._handleButtonClick();
  }

  /**
   * End a call programmatically
   */
  async endCall() {
    if (this.isRecording) {
      return this._handleButtonClick();
    }
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      status: this.status,
      isRecording: this.isRecording,
      isUploading: this.isUploading,
      isConnected: this.wsClient?.isConnected || false,
      lastDisconnectReason: this.lastDisconnectReason
    };
  }

  /**
   * Render UI button to specified container
   */
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

  /**
   * Cleanup and destroy the SDK instance
   */
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

      disconnect: (source = 'manual') => {
        if (!this.wsClient.socket) return;
        
        this.wsClient.disconnectSource = source;
        this.wsClient.manualDisconnect = true;
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

      // Recording data
      micRecordingData: [],
      agentRecordingData: [],
      isCallRecording: false,
      agentRecordingBuffer: [],
      lastAgentBufferTime: 0,

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
          this.audioService.processor = this.audioService.audioContext.createScriptProcessor(1024, 1, 1);

          this.audioService.processor.onaudioprocess = e => {
            if (!this.audioService.isRecording) return;
            const float = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(float.length);
            for (let i = 0; i < float.length; i++) {
              const v = Math.max(-1, Math.min(1, float[i]));
              int16[i] = Math.round(v * 32767);
            }
            
            this._addMicRecordingData(float);
            sendFn(int16.buffer);
          };

          this.audioService.source.connect(this.audioService.processor);
          this.audioService.processor.connect(this.audioService.audioContext.destination);
          this.audioService.isRecording = true;
          this.isRecording = true;
          
          this._startCallRecording();
          this._triggerEvent('onRecordingStart');
          this._updateUI();
          
          return true;
        } catch (error) {
          console.error('[RECORDING] Error starting recording:', error);
          this._triggerEvent('onError', error);
          return false;
        }
      },

      stopRecording: () => {
        if (!this.audioService.isRecording) return null;
        
        this.audioService.isRecording = false;
        this.isRecording = false;
        
        const recordingBlob = this._stopCallRecording();
        this._triggerEvent('onRecordingStop');
        this._updateUI();
        
        try {
          if (this.audioService.processor) {
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
        
        return recordingBlob;
      },

      playAudio: async (buffer, sr = 48000) => {
        if (!this.audioService.audioContext) await this.audioService.initialize();
        if (this.audioService.audioContext.state === 'suspended') {
          await this.audioService.audioContext.resume();
        }

        try {
          const int16 = new Int16Array(buffer);
          const float = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) {
            float[i] = int16[i] / 32768.0;
          }
          
          const processedFloat = this._processIncomingAudio(float);
          const audioBuffer = this.audioService.audioContext.createBuffer(1, processedFloat.length, sr);
          audioBuffer.getChannelData(0).set(processedFloat);

          this.audioService.audioQueue.push(audioBuffer);
          if (!this.audioService.isPlaying) this._processAudioQueue();
          
          if (this.audioService.isCallRecording) {
            this._addToRecordingBuffer(float, sr);
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
   *  WebSocket Event Handlers
   * ----------------------------------------------------------------*/

  _handleWSOpen(evt) {
    this.wsClient.isConnected = true;
    this.wsClient.manualDisconnect = false;
    this.wsClient.disconnectSource = null;
    
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
    this.callUpdateSent = false;
    
    this._sendCallUpdate({ CallStatus: 'in-progress' }).catch(err => {
      console.error('[WS] Error sending in-progress update:', err);
    });
    
    this._startRecording();
    this._triggerEvent('onCallStart');
  }

  _handleWSMessage(evt) {
    let msg;
    try {
      msg = JSON.parse(evt.data);
    } catch (e) {
      return;
    }

    if (msg.event === 'hangup') {
      this.endTime = new Date();
      this._handleCallEndWithRecording('agent');
      this._stopEverything('agent');
      if (this.wsClient.isConnected) {
        this.wsClient.disconnect('agent');
      }
      this._setStatus('idle');
      this.lastDisconnectReason = 'agent';
    } else if (msg.event === 'media' && msg.media?.payload) {
      if (msg.media.track === 'outbound' || !msg.media.track) {
        try {
          const bin = Uint8Array.from(atob(msg.media.payload), c => c.charCodeAt(0)).buffer;
          this.audioService.playAudio(bin, 48000);
        } catch (error) {
          console.error('[PLAYBACK] Error processing server audio:', error);
        }
      }
    } else if (msg.event === 'playAudio' && msg.media?.payload) {
      try {
        const bin = Uint8Array.from(atob(msg.media.payload), c => c.charCodeAt(0)).buffer;
        this.audioService.playAudio(bin, 48000);
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

  _handleWSClose(evt) {
    if (!this.wsClient.isConnected) return;
    
    this.wsClient.isConnected = false;
    const source = this.wsClient.manualDisconnect ? 
      this.wsClient.disconnectSource || 'manual_disconnect' : 
      'server_initiated';
    
    if (!this.callUpdateSent) {
      if (!this.endTime) {
        this.endTime = new Date();
      }
      
      const hangupSourceMap = {
        'user': 'user',
        'user_clicked_stop': 'user',
        'agent': 'agent',
        'connection_timeout': 'timeout',
        'component_unmount': 'system',
        'error_event': 'error',
        'error': 'error',
        'manual_disconnect': 'user',
        'server_initiated': 'server',
        'normal_close': 'server',
        'abnormal_close': 'error'
      };
      
      const hangupSource = hangupSourceMap[source] || source;
      this._handleCallEndWithRecording(hangupSource);
    }
    
    this._stopEverything(`ws_disconnected_${source}`);
    this._setStatus('idle');
    this.lastDisconnectReason = source;
  }

  _handleWSError(err) {
    this.wsClient.isConnected = false;
    this._setStatus('error');
    
    if (!this.callUpdateSent) {
      if (!this.endTime) {
        this.endTime = new Date();
      }
      this._handleCallEndWithRecording('error');
    }
    
    this._triggerEvent('onError', err);
  }

  /* ------------------------------------------------------------------
   *  Audio Processing Methods
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
    this.audioService.queueTimer = setTimeout(() => this._processAudioQueue(), 3);
  }

  _maybeAck() {
    if (
      this.audioService.pendingCheckpoint &&
      this.audioService.audioQueue.length === 0 &&
      this.audioService.activeSources.size === 0
    ) {
      this.audioService.pendingCheckpoint = false;
      if (this.wsClient.isConnected) this.wsClient.sendPlayedStream();
    }
  }

  /* ------------------------------------------------------------------
   *  Recording Management
   * ----------------------------------------------------------------*/

  _startCallRecording() {
    this.audioService.micRecordingData = [];
    this.audioService.agentRecordingData = [];
    this.audioService.agentRecordingBuffer = [];
    this.audioService.isCallRecording = true;
    this.audioService.lastAgentBufferTime = 0;
  }

  _stopCallRecording() {
    this.audioService.isCallRecording = false;
    this._finalizeAgentRecording();
    
    if (this.audioService.micRecordingData.length > 0 || this.audioService.agentRecordingData.length > 0) {
      const maxLength = Math.max(this.audioService.micRecordingData.length, this.audioService.agentRecordingData.length);
      const combinedData = new Float32Array(maxLength);
      
      for (let i = 0; i < maxLength; i++) {
        const micSample = i < this.audioService.micRecordingData.length ? this.audioService.micRecordingData[i] : 0;
        const agentSample = i < this.audioService.agentRecordingData.length ? this.audioService.agentRecordingData[i] : 0;
        combinedData[i] = (micSample + agentSample * 0.8) / 1.8;
      }
      
      return this._createWavBlob(combinedData, this.config.audio.sampleRate);
    }
    
    return null;
  }

  _addMicRecordingData(audioData) {
    if (this.audioService.isCallRecording && audioData) {
      this.audioService.micRecordingData.push(...audioData);
      this._syncAgentRecordingLength();
    }
  }

  _addToRecordingBuffer(audioData, sampleRate) {
    if (!this.audioService.isCallRecording || !audioData) return;
    
    let resampledData = audioData;
    if (sampleRate !== this.config.audio.sampleRate) {
      resampledData = this._resampleAudio(audioData, sampleRate, this.config.audio.sampleRate);
    }
    
    this.audioService.agentRecordingBuffer.push(...resampledData);
  }

  _syncAgentRecordingLength() {
    const targetLength = this.audioService.micRecordingData.length;
    
    if (this.audioService.agentRecordingData.length < targetLength) {
      const needed = targetLength - this.audioService.agentRecordingData.length;
      const available = this.audioService.agentRecordingBuffer.length - this.audioService.lastAgentBufferTime;
      
      if (available > 0) {
        const toTake = Math.min(needed, available);
        const startIndex = this.audioService.lastAgentBufferTime;
        const endIndex = startIndex + toTake;
        const agentSlice = this.audioService.agentRecordingBuffer.slice(startIndex, endIndex);
        
        if (agentSlice.length < needed) {
          const paddedSlice = new Float32Array(needed);
          paddedSlice.set(agentSlice);
          this.audioService.agentRecordingData.push(...paddedSlice);
        } else {
          this.audioService.agentRecordingData.push(...agentSlice);
        }
        
        this.audioService.lastAgentBufferTime = endIndex;
      } else {
        const silence = new Float32Array(needed);
        this.audioService.agentRecordingData.push(...silence);
      }
    }
  }

  _finalizeAgentRecording() {
    const targetLength = this.audioService.micRecordingData.length;
    
    if (this.audioService.agentRecordingData.length < targetLength) {
      const needed = targetLength - this.audioService.agentRecordingData.length;
      const available = this.audioService.agentRecordingBuffer.length - this.audioService.lastAgentBufferTime;
      
      if (available > 0) {
        const toTake = Math.min(needed, available);
        const agentSlice = this.audioService.agentRecordingBuffer.slice(
          this.audioService.lastAgentBufferTime, 
          this.audioService.lastAgentBufferTime + toTake
        );
        this.audioService.agentRecordingData.push(...agentSlice);
      }
      
      if (this.audioService.agentRecordingData.length < targetLength) {
        const stillNeeded = targetLength - this.audioService.agentRecordingData.length;
        const silence = new Float32Array(stillNeeded);
        this.audioService.agentRecordingData.push(...silence);
      }
    }
  }

  _resampleAudio(inputData, inputSampleRate, outputSampleRate) {
    if (inputSampleRate === outputSampleRate) return inputData;
    
    const ratio = inputSampleRate / outputSampleRate;
    const outputLength = Math.floor(inputData.length / ratio);
    const outputData = new Float32Array(outputLength);
    
    for (let i = 0; i < outputLength; i++) {
      const inputIndex = i * ratio;
      const lowerIndex = Math.floor(inputIndex);
      const upperIndex = Math.min(Math.ceil(inputIndex), inputData.length - 1);
      const fraction = inputIndex - lowerIndex;
      const lowerValue = inputData[lowerIndex] || 0;
      const upperValue = inputData[upperIndex] || 0;
      outputData[i] = lowerValue + (upperValue - lowerValue) * fraction;
    }
    
    return outputData;
  }

  /* ------------------------------------------------------------------
   *  WAV File Creation
   * ----------------------------------------------------------------*/

  _createWavBlob(audioData, sampleRate = 48000, numChannels = 1) {
    const length = audioData.length;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = length * bytesPerSample;
    const fileSize = 36 + dataSize;
    
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, fileSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    let offset = 44;
    let maxSample = 0;
    
    for (let i = 0; i < length; i++) {
      maxSample = Math.max(maxSample, Math.abs(audioData[i]));
    }
    
    const normalizationFactor = maxSample > 0.05 ? Math.min(0.95 / maxSample, 4.0) : 1.0;
    
    for (let i = 0; i < length; i++) {
      let sample = audioData[i] * normalizationFactor;
      sample = Math.max(-0.98, Math.min(0.98, sample));
      const intSample = Math.round(sample * 32767);
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }

  /* ------------------------------------------------------------------
   *  Network Utilities
   * ----------------------------------------------------------------*/

  async _fetchWithTimeout(resource, options = {}, timeout = 5000) {
    return Promise.race([
      fetch(resource, options),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);
  }

  async _sendCallUpdate({ CallStatus, HangupSource = 'none', downloadUrl = null }) {
    const formatDate = (d) => d ? d.toISOString().replace('T', ' ').substring(0, 19) : null;
    
    const StartTime = formatDate(this.startTime);
    const EndTime = formatDate(this.endTime);
    const Duration = this.startTime && this.endTime
      ? Math.floor((this.endTime - this.startTime) / 1000)
      : 0;

    const updateData = {
      input: {
        request: {
          CallStatus,
          Direction: 'outbound',
          Duration,
          StartTime,
          EndTime,
          agent_id: this.agentId,
          call_id: this.callId,
          env: 'dev',
          HangupSource,
          RecordingUrl: downloadUrl
        }
      }
    };

    let attempts = 0;
    const maxAttempts = 3;
    let lastError;

    while (attempts < maxAttempts) {
      try {
        const res = await this._fetchWithTimeout(this.config.endpoints.callUpdate, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        }, 5000);

        if (res.ok) {
          return await res.json();
        } else {
          lastError = new Error('Failed to update call');
        }
      } catch (e) {
        lastError = e;
      }
      attempts++;
    }

    console.error('[CALL UPDATE] Error sending call update:', lastError);
    throw new Error('Try again: Unable to update call after 3 attempts');
  }

  async _uploadCallRecording(recordingBlob, callId) {
    try {
      const presignedResponse = await fetch(this.config.endpoints.recordingUpload, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_id: callId })
      });

      if (!presignedResponse.ok) {
        throw new Error(`Failed to get presigned URL: ${presignedResponse.status} ${presignedResponse.statusText}`);
      }

      const presignedData = await presignedResponse.json();

      if (!presignedData.success || !presignedData.presigned_url) {
        throw new Error('Invalid presigned URL response: ' + JSON.stringify(presignedData));
      }

      const { presigned_url: presignedUrl, download_url: downloadUrl, file_key: fileKey } = presignedData;

      const uploadResponse = await fetch(presignedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'audio/wav' },
        body: recordingBlob
      });

      if (!uploadResponse.ok) {
        throw new Error(`Failed to upload recording: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }

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

  /* ------------------------------------------------------------------
   *  Call Management
   * ----------------------------------------------------------------*/

  async _handleCallEndWithRecording(hangupSource) {
    if (this.callUpdateSent) return;
    
    this.callUpdateSent = true;
    this.isUploading = true;
    this._updateUI();
    
    let downloadUrl = null;
    
    try {
      const recordingBlob = this.audioService.stopRecording();
      
      if (recordingBlob && recordingBlob.size > 0) {
        try {
          const uploadPromise = this._uploadCallRecording(recordingBlob, this.callId);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Upload timeout after 5 minutes')), 5 * 60 * 1000)
          );
          
          const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);
          
          if (uploadResult && uploadResult.success) {
            downloadUrl = uploadResult.downloadUrl;
            this._triggerEvent('onRecordingReady', recordingBlob, downloadUrl);
          }
        } catch (uploadError) {
          console.error('[CALL_END] Upload error:', uploadError);
        }
      }
    } catch (error) {
      console.error('[CALL_END] Error during recording handling:', error);
    }
    
    try {
      await this._sendCallUpdate({
        CallStatus: 'completed',
        HangupSource: hangupSource,
        downloadUrl: downloadUrl
      });
      
      this._triggerEvent('onCallEnd', hangupSource, downloadUrl);
    } catch (error) {
      console.error('[CALL_END] Error during call update:', error);
      this.callUpdateSent = false;
      this._triggerEvent('onError', error);
      throw error;
    } finally {
      this.isUploading = false;
      this._updateUI();
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
      
      try {
        await this._handleCallEndWithRecording('user');
      } catch (error) {
        console.error('[CLICK] Error handling user disconnect:', error);
      }
      
      this._stopEverything('user_clicked_stop');
      this.wsClient.disconnect('user');
      this._setStatus('idle');
      this.lastDisconnectReason = 'user';
      return;
    }

    if (this.status === 'idle' || this.status === 'error') {
      this._setStatus('connecting');
      this.wsClient.manualDisconnect = false;
      this.wsClient.connect();

      this.connectionTimer = setTimeout(async () => {
        if (!this.wsClient.isConnected) {
          this._setStatus('error');
          
          if (!this.callUpdateSent) {
            if (!this.endTime) {
              this.endTime = new Date();
            }
            
            try {
              await this._handleCallEndWithRecording('connection_timeout');
            } catch (error) {
              console.error('[TIMEOUT] Error handling connection timeout:', error);
            }
          }
          
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

  /* ------------------------------------------------------------------
   *  UI Management
   * ----------------------------------------------------------------*/

  _createButtonUI(container) {
    // Create wrapper div
    const wrapper = document.createElement('div');
    wrapper.className = 'vocal-call-wrapper inline-flex flex-col items-center gap-1';
    
    // Create button
    this.buttonElement = document.createElement('button');
    this.buttonElement.className = this._getButtonClasses();
    this.buttonElement.setAttribute('aria-label', this.isRecording ? 'Stop recording' : 'Start recording');
    this.buttonElement.addEventListener('click', () => this._handleButtonClick());
    
    // Create status element
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

    const processingClasses = this.isUploading ? 'bg-amber-500 cursor-not-allowed opacity-50' : '';

    return [
      baseClasses,
      sizeClasses[this.size] || sizeClasses.medium,
      processingClasses || statusClasses[this.status] || statusClasses.idle,
      this.className
    ].filter(Boolean).join(' ');
  }

  _updateUI() {
    if (!this.buttonElement) return;
    
    // Update button
    const buttonText = this.isUploading ? 'Processing...' : 
                      (this.isRecording ? this.activeText : this.inactiveText);
    
    this.buttonElement.className = this._getButtonClasses();
    this.buttonElement.innerHTML = `
      ${buttonText}
      <span class="ml-2 inline-block h-2 w-2 rounded-full bg-white/70 animate-ping"></span>
    `;
    this.buttonElement.disabled = this.status === 'connecting' || this.status === 'error' || this.isUploading;
    this.buttonElement.setAttribute('aria-label', this.isRecording ? 'Stop recording' : 'Start recording');
    
    // Update status text
    if (this.statusElement) {
      let statusText = '';
      let statusClass = '';
      
      if (this.status === 'connecting') {
        statusText = 'Connecting…';
        statusClass = 'text-amber-500';
      } else if (this.status === 'error') {
        statusText = 'Connection error. Try again.';
        statusClass = 'text-rose-600';
      } else if (this.isUploading) {
        statusText = 'Uploading recording…';
        statusClass = 'text-blue-500';
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
    
    if (this.startTime && !this.callUpdateSent) {
      if (!this.endTime) {
        this.endTime = new Date();
      }
      this._handleCallEndWithRecording('component_unmount').catch(err => {
        console.error('Failed to handle call end with recording on cleanup:', err);
      });
    }
    
    this._stopEverything('component_unmount');
    if (this.wsClient) {
      this.wsClient.disconnect('component_unmount');
    }
    if (this.audioService) {
      this.audioService.cleanup();
    }
  }
}