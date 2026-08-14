import { SpeechOptions } from './types';

const MUTE_STORAGE_KEY = 'superherooo_voice_guide_muted';

class VoiceGuideSpeechService {
  private isMutedState: boolean = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private speakingState: boolean = false;
  private listeners: Set<() => void> = new Set();
  private voices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      const storedMute = localStorage.getItem(MUTE_STORAGE_KEY);
      this.isMutedState = storedMute === 'true';

      if (this.isSupported()) {
        this.initVoices();
        window.speechSynthesis.onvoiceschanged = () => {
          this.initVoices();
        };
      }
    }
  }

  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  private initVoices(): void {
    if (!this.isSupported()) return;
    this.voices = window.speechSynthesis.getVoices();
  }

  private getBestVoice(): SpeechSynthesisVoice | null {
    if (this.voices.length === 0 && this.isSupported()) {
      this.voices = window.speechSynthesis.getVoices();
    }
    if (this.voices.length === 0) return null;

    // Prefer en-IN (English India), then en-US, en-GB, or any English voice
    const inVoice = this.voices.find(v => v.lang.includes('en-IN') || v.lang.includes('hi-IN'));
    if (inVoice) return inVoice;

    const naturalEnVoice = this.voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
    if (naturalEnVoice) return naturalEnVoice;

    const anyEnVoice = this.voices.find(v => v.lang.startsWith('en'));
    if (anyEnVoice) return anyEnVoice;

    return this.voices[0] || null;
  }

  public isMuted(): boolean {
    return this.isMutedState;
  }

  public isSpeaking(): boolean {
    return this.speakingState;
  }

  public toggleMute(): boolean {
    this.isMutedState = !this.isMutedState;
    if (typeof window !== 'undefined') {
      localStorage.setItem(MUTE_STORAGE_KEY, String(this.isMutedState));
    }
    if (this.isMutedState) {
      this.stop();
    }
    this.notifyListeners();
    return this.isMutedState;
  }

  public setMuted(muted: boolean): void {
    if (this.isMutedState !== muted) {
      this.isMutedState = muted;
      if (typeof window !== 'undefined') {
        localStorage.setItem(MUTE_STORAGE_KEY, String(this.isMutedState));
      }
      if (this.isMutedState) {
        this.stop();
      }
      this.notifyListeners();
    }
  }

  public stop(): void {
    if (!this.isSupported()) return;
    window.speechSynthesis.cancel();
    this.currentUtterance = null;
    this.setSpeaking(false);
  }

  public speak(text: string, options: SpeechOptions = {}): void {
    if (!this.isSupported() || this.isMutedState || !text) return;

    // Cancel ongoing speech to avoid backlog
    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate ?? 0.88; // Calmer, distinct pace so instructions are easy to follow
    utterance.pitch = options.pitch ?? 1.0;
    utterance.volume = options.volume ?? 1.0;
    utterance.lang = options.lang ?? 'en-IN';

    const voice = this.getBestVoice();
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => {
      this.setSpeaking(true);
    };

    utterance.onend = () => {
      this.currentUtterance = null;
      this.setSpeaking(false);
      if (options.onEnd) options.onEnd();
    };

    utterance.onerror = (err) => {
      this.currentUtterance = null;
      this.setSpeaking(false);
      if (options.onError) options.onError(err);
    };

    this.currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  private setSpeaking(val: boolean): void {
    if (this.speakingState !== val) {
      this.speakingState = val;
      this.notifyListeners();
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach(l => l());
  }
}

export const speechService = new VoiceGuideSpeechService();
