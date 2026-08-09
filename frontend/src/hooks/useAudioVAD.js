import { useEffect, useRef, useState, useCallback } from 'react';
import * as ort from 'onnxruntime-web';

const SAMPLE_RATE       = 16000;
const SPEECH_THRESHOLD  = 0.75;   // 75% confidence — coughs/sneezes alone won't cross this
const WINDOW_SIZE       = 512;    // 32 ms per window @ 16 kHz
const SILENCE_TIMEOUT   = 2000;   // Wait 2s of silence after speech before closing clip
const MAX_RECORD_SECS   = 30000;  // Max 30s single clip safety cap
const MIN_RMS           = 0.015;  // Minimum mic volume — filters out ambient noise & faint sounds
const SUSTAINED_FRAMES  = 8;     // Must see 8 consecutive speech frames (~256 ms) before flagging

/**
 * useAudioVAD — real-time Silero VAD v5 with Dynamic Continuous Speech Recording
 * Records as long as human speech continues, closing and uploading the clip 1.5s after speech ends.
 */
export function useAudioVAD({ stream, onSpeechDetected }) {
  const [vadStatus, setVadStatus] = useState('loading');
  const [vadProb, setVadProb]     = useState(0);
  const [audioRms, setAudioRms]   = useState(0);
  const [isRecording, setIsRecording] = useState(false);

  // Sustained-speech counter — prevents single cough/sneeze from triggering a violation
  const sustainedFramesRef = useRef(0);

  const sessionRef          = useRef(null);
  const lastUpdateRef       = useRef(0);
  const recorderRef         = useRef(null);
  const chunksRef           = useRef([]);
  const silenceTimerRef     = useRef(null);
  const maxDurationTimerRef = useRef(null);

  // Silero VAD v5 state tensor: shape [2, 1, 128] = 256 floats
  const stateRef = useRef(new Float32Array(2 * 1 * 128).fill(0));

  // ── Load ONNX model ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function loadModel() {
      try {
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/';
        ort.env.wasm.numThreads = 1;

        const response = await fetch('/models/silero_vad.onnx');
        if (!response.ok) throw new Error(`HTTP ${response.status} loading model`);
        const modelBuffer = await response.arrayBuffer();

        const session = await ort.InferenceSession.create(modelBuffer, {
          executionProviders: ['wasm'],
        });

        if (cancelled) return;

        sessionRef.current = session;
        console.log('[VAD] ✓ Silero VAD v5 loaded successfully | inputs:', session.inputNames);
        setVadStatus('active');
      } catch (e) {
        if (!cancelled) {
          console.error('[VAD] ✗ Model load failed:', e.message);
          setVadStatus('error');
        }
      }
    }

    loadModel();
    return () => { cancelled = true; };
  }, []);

  // ── Stop Recording Handler ──────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      console.log('[VAD] 🎙 Dynamic recording STOPPED (speech ended)');
      recorderRef.current.stop();
      setIsRecording(false);
    }
  }, []);

  // ── Start or Extend Dynamic Continuous Recording ────────────────────────────
  const extendRecording = useCallback(() => {
    if (!stream) return;

    // Reset silence timer: stop recording after 1.5 seconds of silence
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      stopRecording();
    }, SILENCE_TIMEOUT);

    // If not currently recording, start MediaRecorder now!
    if (!recorderRef.current || recorderRef.current.state !== 'recording') {
      chunksRef.current = [];
      const audioTracks = stream.getAudioTracks();
      if (!audioTracks || audioTracks.length === 0) return;
      const audioStream = new MediaStream(audioTracks);

      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
        .find(t => MediaRecorder.isTypeSupported(t)) || '';

      try {
        const rec = new MediaRecorder(audioStream, mimeType ? { mimeType } : {});
        recorderRef.current = rec;

        rec.ondataavailable = e => {
          if (e.data?.size > 0) chunksRef.current.push(e.data);
        };
        rec.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
          recorderRef.current = null;
          setIsRecording(false);
          console.log('[VAD] 🎙 Dynamic speech clip finalized, total size:', blob.size, 'bytes');
          if (blob.size > 0 && typeof onSpeechDetected === 'function') {
            onSpeechDetected(blob);
          }
        };

        rec.start(100);
        setIsRecording(true);
        console.log('[VAD] 🎙 Dynamic recording STARTED (continuous mode)');

        // Safety cap: max 30s per single continuous clip
        if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
        maxDurationTimerRef.current = setTimeout(() => {
          stopRecording();
        }, MAX_RECORD_SECS);
      } catch (e) {
        console.warn('[VAD] MediaRecorder error:', e.message);
        recorderRef.current = null;
        setIsRecording(false);
      }
    }
  }, [stream, onSpeechDetected, stopRecording]);

  // ── Real-time audio processing loop ────────────────────────────────────────
  useEffect(() => {
    if (!stream || vadStatus !== 'active') return;

    let audioCtx, source, processor, silentGain;

    try {
      audioCtx = new AudioContext({ sampleRate: SAMPLE_RATE });

      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }

      source     = audioCtx.createMediaStreamSource(stream);
      processor  = audioCtx.createScriptProcessor(WINDOW_SIZE, 1, 1);
      silentGain = audioCtx.createGain();
      silentGain.gain.value = 0; // Mute output so microphone isn't echoed to speakers

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioCtx.destination);

      processor.onaudioprocess = async (event) => {
        const session = sessionRef.current;
        if (!session) return;

        const pcm = event.inputBuffer.getChannelData(0); // Float32Array[512]

        // Calculate audio volume (RMS) to ensure microphone is receiving signal
        let sum = 0;
        for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
        const rms = Math.sqrt(sum / pcm.length);

        try {
          const feeds = {
            input: new ort.Tensor('float32', Float32Array.from(pcm), [1, WINDOW_SIZE]),
            state: new ort.Tensor('float32', new Float32Array(stateRef.current), [2, 1, 128]),
            sr:    new ort.Tensor('int64',   new BigInt64Array([16000n]), []),
          };

          const result = await session.run(feeds);

          if (result.stateN) {
            stateRef.current = Float32Array.from(result.stateN.data);
          }

          const speechProb = Number(result.output.data[0]);

          const now = Date.now();
          if (now - lastUpdateRef.current > 100) {
            lastUpdateRef.current = now;
            setVadProb(speechProb);
            setAudioRms(rms);
          }

          // Dynamic continuous speech trigger
          // Require sustained loud speech across multiple frames to avoid false positives
          // (coughs, sneezes, or brief throat-clearing should NOT trigger violations)
          if (speechProb >= SPEECH_THRESHOLD && rms > MIN_RMS) {
            sustainedFramesRef.current += 1;
            if (sustainedFramesRef.current >= SUSTAINED_FRAMES) {
              extendRecording();
            }
          } else {
            // Reset counter on any non-speech frame — must be CONTINUOUS speech to trigger
            sustainedFramesRef.current = 0;
          }
        } catch (err) {
          // Ignore individual frame execution hiccups
        }
      };
    } catch (e) {
      console.error('[VAD] AudioContext error:', e.message);
    }

    return () => {
      try { processor?.disconnect(); }  catch {}
      try { source?.disconnect(); }     catch {}
      try { silentGain?.disconnect(); } catch {}
      try { audioCtx?.close(); }        catch {}
      try { stopRecording(); }          catch {}
    };
  }, [stream, vadStatus, extendRecording, stopRecording]);

  return { vadStatus, vadProb, audioRms, isRecording };
}
