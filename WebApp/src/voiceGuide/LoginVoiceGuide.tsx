import React, { useEffect, useState, useRef } from 'react';
import { Volume2, VolumeX, RotateCcw, Sparkles, User, Zap, Target } from 'lucide-react';
import { LoginUiState, VoiceGuideProps, VoiceGuideStep } from './types';
import { speechService } from './speechService';
import { useFieldFocusTracker } from './useFieldFocusTracker';
import './voiceGuideStyles.css';

function determineState(props: VoiceGuideProps): LoginUiState {
  if (props.isAuthenticated) return 'SUCCESS';
  if (props.busy) return 'BUSY';
  if (props.error) return 'ERROR';
  
  const cleanPhone = props.phone.replace(/\D/g, '');
  const cleanOtp = props.otp.trim();

  if (props.otpSent) {
    return cleanOtp.length >= 4 ? 'OTP_READY' : 'OTP_SENT';
  }

  if (cleanPhone.length >= 10) {
    return 'PHONE_READY';
  }

  if (cleanPhone.length > 0) {
    return 'TYPING_PHONE';
  }

  return 'ROLE_SELECT';
}

function getStepDetails(state: LoginUiState, props: VoiceGuideProps): VoiceGuideStep {
  const roleName = props.role === 'HELPER' ? 'Partner' : 'Superherooo';

  switch (state) {
    case 'ROLE_SELECT':
      return {
        state,
        title: `${roleName} Mode`,
        shortLabel: roleName,
        instruction: props.role === 'HELPER'
          ? 'Switched to Partner login mode. Partner KYC is required before going online. Enter your 10-digit Indian mobile number.'
          : 'Switched to Superherooo login mode. Enter your 10-digit Indian mobile number to continue.',
      };
    case 'TYPING_PHONE':
      return {
        state,
        title: 'Step 1: Typing Number',
        shortLabel: 'Typing',
        instruction: `Entering mobile number for ${roleName} account. Complete all 10 digits.`,
      };
    case 'PHONE_READY':
      return {
        state,
        title: 'Step 2: Get OTP',
        shortLabel: 'Ready',
        instruction: `Mobile number entered. Click the "Get OTP" button to receive your login code.`,
      };
    case 'OTP_SENT':
      return {
        state,
        title: 'Step 3: Enter OTP',
        shortLabel: 'OTP Sent',
        instruction: `OTP code generated for ${roleName} login. Enter the code shown on screen to proceed.`,
      };
    case 'OTP_READY':
      return {
        state,
        title: 'Step 4: Verify & Login',
        shortLabel: 'OTP Filled',
        instruction: `OTP entered. Click "Verify and Continue" to sign in as ${roleName}.`,
      };
    case 'BUSY':
      return {
        state,
        title: 'Processing',
        shortLabel: 'Wait',
        instruction: `Verifying your ${roleName} login details, please wait...`,
      };
    case 'ERROR':
      return {
        state,
        title: 'Notice',
        shortLabel: 'Error',
        instruction: props.error || 'An error occurred. Please try again.',
      };
    case 'SUCCESS':
      return {
        state,
        title: 'Success',
        shortLabel: 'Logged in',
        instruction: `Signed in successfully as ${roleName}! Redirecting...`,
      };
  }
}

export const LoginVoiceGuide: React.FC<VoiceGuideProps> = (props) => {
  const currentState = determineState(props);
  const currentStep = getStepDetails(currentState, props);
  const { activeField, replayActiveField } = useFieldFocusTracker(true);

  const [isMuted, setIsMuted] = useState<boolean>(() => speechService.isMuted());
  const [isSpeaking, setIsSpeaking] = useState<boolean>(() => speechService.isSpeaking());
  const [ttsSupported, setTtsSupported] = useState<boolean>(true);

  const prevStateRef = useRef<LoginUiState | null>(null);
  const prevRoleRef = useRef<string | null>(null);

  useEffect(() => {
    setTtsSupported(speechService.isSupported());

    const unsubscribe = speechService.subscribe(() => {
      setIsMuted(speechService.isMuted());
      setIsSpeaking(speechService.isSpeaking());
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Track state or role changes without auto-speaking (Speech triggers ONLY on field hover/focus/click)
  useEffect(() => {
    prevStateRef.current = currentState;
    prevRoleRef.current = props.role;
  }, [currentState, props.role]);

  const handleToggleMute = () => {
    const muted = speechService.toggleMute();
    if (!muted) {
      const activeInstruction = activeField ? activeField.instruction : currentStep.instruction;
      speechService.speak(activeInstruction);
    }
  };

  const handleReplay = () => {
    if (activeField) {
      replayActiveField();
    } else {
      speechService.speak(currentStep.instruction);
    }
  };

  const handleSelectSuperheroooGuide = () => {
    if (props.onSelectRole) {
      props.onSelectRole('BUYER');
    }
    const text = 'Superherooo Login Guide activated. Enter your 10-digit mobile number to book Superherooo tasks.';
    speechService.speak(text);
  };

  const handleSelectPartnerGuide = () => {
    if (props.onSelectRole) {
      props.onSelectRole('HELPER');
    }
    const text = 'Partner Login Guide activated. Partner KYC is required before going online. Enter your 10-digit mobile number.';
    speechService.speak(text);
  };

  if (!ttsSupported) {
    return null;
  }

  const activeTitle = activeField ? `Field: ${activeField.label}` : currentStep.title;
  const activeLabel = activeField ? `📍 ${activeField.label}` : currentStep.shortLabel;
  const activeInstruction = activeField ? activeField.instruction : currentStep.instruction;

  return (
    <div className={`voice-guide-card ${isSpeaking ? 'speaking' : ''} ${activeField ? 'field-focused' : ''}`}>
      <div className="voice-guide-header">
        <div className="voice-guide-title-wrap">
          <span className="voice-guide-icon-badge">
            {activeField ? <Target size={16} /> : <Sparkles size={16} />}
          </span>
          <span className="voice-guide-title">Voice Assistant</span>
          <span className={`voice-guide-tag ${activeField ? 'focus-tag' : ''}`}>{activeLabel}</span>
        </div>

        <div className="voice-guide-actions">
          <button
            type="button"
            className="voice-btn"
            onClick={handleReplay}
            title="Replay voice instruction"
          >
            <RotateCcw size={14} /> Repeat
          </button>
          <button
            type="button"
            className={`voice-btn ${isMuted ? 'muted' : 'active'}`}
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute voice guide' : 'Mute voice guide'}
          >
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            {isMuted ? 'Muted' : 'Voice On'}
          </button>
        </div>
      </div>

      <div className="voice-guide-body">
        <div className="voice-wave-container" aria-hidden="true">
          <span className="voice-wave-bar" />
          <span className="voice-wave-bar" />
          <span className="voice-wave-bar" />
          <span className="voice-wave-bar" />
        </div>
        <p className="voice-instruction-text">
          <strong>{activeTitle}:</strong> {activeInstruction}
        </p>
      </div>

      <div className="voice-guide-role-buttons">
        <button
          type="button"
          className={`voice-role-btn ${props.role === 'BUYER' ? 'active-role' : ''}`}
          onClick={handleSelectSuperheroooGuide}
        >
          <User size={15} /> Superherooo Guide
        </button>
        <button
          type="button"
          className={`voice-role-btn ${props.role === 'HELPER' ? 'active-role' : ''}`}
          onClick={handleSelectPartnerGuide}
        >
          <Zap size={15} /> Partner Guide
        </button>
      </div>
    </div>
  );
};
