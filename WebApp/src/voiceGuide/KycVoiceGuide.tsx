import React, { useEffect, useState, useRef } from 'react';
import { Volume2, VolumeX, RotateCcw, ShieldCheck, AlertCircle, Target } from 'lucide-react';
import { speechService } from './speechService';
import { useFieldFocusTracker } from './useFieldFocusTracker';
import './voiceGuideStyles.css';

export interface KycVoiceGuideProps {
  fullName: string;
  docType: string;
  idNumber: string;
  idValidationText?: string | null;
  idFront: File | null;
  idBack: File | null;
  requiresBackUpload: boolean;
  selfie: File | null;
  accountHolderName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifscCode: string;
  ifscResult: any;
  status: string; // 'NOT_SUBMITTED' | 'PENDING' | 'APPROVED' | 'REJECTED'
  submittedReference?: string | null;
  error?: string | null;
  busy?: boolean;
}

export type KycStepState =
  | 'APPROVED'
  | 'PENDING'
  | 'REJECTED'
  | 'FORM_ERROR'
  | 'ID_INVALID'
  | 'NAME'
  | 'ID_NUMBER'
  | 'ID_FRONT'
  | 'ID_BACK'
  | 'SELFIE'
  | 'ACCOUNT_HOLDER'
  | 'ACCOUNT_NUMBER'
  | 'CONFIRM_ACCOUNT'
  | 'IFSC'
  | 'READY';

function determineKycState(props: KycVoiceGuideProps): KycStepState {
  if (props.status === 'APPROVED') return 'APPROVED';
  if (props.submittedReference || props.status === 'PENDING') return 'PENDING';
  if (props.error) return 'FORM_ERROR';
  if (props.status === 'REJECTED' && !props.fullName) return 'REJECTED';

  if (!props.fullName.trim() || props.fullName.trim().length < 2) return 'NAME';
  
  if (props.idValidationText && props.idNumber.trim().length > 0) return 'ID_INVALID';
  if (!props.idNumber.trim()) return 'ID_NUMBER';

  if (!props.idFront) return 'ID_FRONT';
  if (props.requiresBackUpload && !props.idBack) return 'ID_BACK';
  if (!props.selfie) return 'SELFIE';

  // Granular Bank Details Steps
  if (!props.accountHolderName.trim() || props.accountHolderName.trim().length < 2) return 'ACCOUNT_HOLDER';
  
  const cleanAccount = props.accountNumber.replace(/\D/g, '');
  if (!cleanAccount || cleanAccount.length < 9) return 'ACCOUNT_NUMBER';

  const cleanConfirm = props.confirmAccountNumber.replace(/\D/g, '');
  if (!cleanConfirm || cleanConfirm !== cleanAccount) return 'CONFIRM_ACCOUNT';

  if (!props.ifscCode.trim() || !props.ifscResult) return 'IFSC';

  return 'READY';
}

function getKycInstruction(state: KycStepState, props: KycVoiceGuideProps): { title: string; instruction: string; label: string; isError?: boolean } {
  switch (state) {
    case 'APPROVED':
      return {
        title: 'KYC Verified',
        label: 'Approved',
        instruction: 'Your partner KYC has been approved! You are ready to go online and accept tasks.',
      };
    case 'PENDING':
      return {
        title: 'Under Review',
        label: 'Pending',
        instruction: 'Your KYC application has been submitted and is under Admin review. Please wait for verification.',
      };
    case 'REJECTED':
      return {
        title: 'Resubmit KYC',
        label: 'Rejected',
        instruction: 'Your previous KYC was rejected. Please check the reason above, update your details, and resubmit.',
      };
    case 'FORM_ERROR':
      return {
        title: 'Validation Attention',
        label: 'Attention',
        isError: true,
        instruction: props.error || 'Please fix the highlighted fields before submitting.',
      };
    case 'ID_INVALID':
      return {
        title: 'ID Format Notice',
        label: 'ID Check',
        isError: true,
        instruction: props.idValidationText || 'Please check your document ID number format.',
      };
    case 'NAME':
      return {
        title: 'Full Legal Name',
        label: 'Legal Name',
        instruction: 'Enter your full legal name as printed on your government ID document.',
      };
    case 'ID_NUMBER':
      return {
        title: 'Document ID Number',
        label: 'ID Number',
        instruction: `Selected ${props.docType}. Enter your document or ID number.`,
      };
    case 'ID_FRONT':
      return {
        title: 'ID Front Photo',
        label: 'ID Front',
        instruction: 'Upload or capture a clear photo of the front side of your ID document.',
      };
    case 'ID_BACK':
      return {
        title: 'Aadhaar Back Photo',
        label: 'ID Back',
        instruction: 'Upload or capture a clear photo of the back side of your Aadhaar card.',
      };
    case 'SELFIE':
      return {
        title: 'Partner Selfie',
        label: 'Selfie',
        instruction: 'Upload a clear selfie photo showing your face for identity confirmation.',
      };
    case 'ACCOUNT_HOLDER':
      return {
        title: 'Account Holder Name',
        label: 'Bank Holder',
        instruction: 'Enter your bank account holder name as per passbook.',
      };
    case 'ACCOUNT_NUMBER':
      return {
        title: 'Bank Account Number',
        label: 'Account No.',
        instruction: 'Enter your 9 to 18 digit bank account number for direct payout deposits.',
      };
    case 'CONFIRM_ACCOUNT':
      return {
        title: 'Confirm Account Number',
        label: 'Confirm No.',
        instruction: props.confirmAccountNumber.length > 0 && props.confirmAccountNumber !== props.accountNumber
          ? 'Notice: Account numbers do not match yet. Re-enter your bank account number to confirm.'
          : 'Re-enter your bank account number to confirm both numbers match.',
      };
    case 'IFSC':
      return {
        title: 'Verify IFSC',
        label: 'IFSC Code',
        instruction: 'Enter your bank\'s 11-digit IFSC code and click Verify IFSC.',
      };
    case 'READY':
      return {
        title: 'Ready to Submit',
        label: 'Complete',
        instruction: 'All details complete! Click "Submit KYC for Admin Review" to complete your partner onboarding.',
      };
  }
}

export const KycVoiceGuide: React.FC<KycVoiceGuideProps> = (props) => {
  const currentState = determineKycState(props);
  const currentStep = getKycInstruction(currentState, props);
  const { activeField, replayActiveField } = useFieldFocusTracker(true);

  const [isMuted, setIsMuted] = useState<boolean>(() => speechService.isMuted());
  const [isSpeaking, setIsSpeaking] = useState<boolean>(() => speechService.isSpeaking());
  const [ttsSupported, setTtsSupported] = useState<boolean>(true);

  const prevStateRef = useRef<KycStepState | null>(null);
  const prevErrorRef = useRef<string | null>(null);
  const prevIdValidationRef = useRef<string | null>(null);

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

  // Track state changes without auto-speaking (Speech triggers ONLY on cursor hover/focus/click)
  useEffect(() => {
    prevStateRef.current = currentState;
    prevErrorRef.current = props.error || null;
    prevIdValidationRef.current = props.idValidationText || null;
  }, [currentState, props.error, props.idValidationText]);

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

  if (!ttsSupported) return null;

  const activeTitle = activeField ? `Field: ${activeField.label}` : currentStep.title;
  const activeLabel = activeField ? `📍 ${activeField.label}` : currentStep.label;
  const activeInstruction = activeField ? activeField.instruction : currentStep.instruction;

  return (
    <div className={`voice-guide-card ${isSpeaking ? 'speaking' : ''} ${currentStep.isError ? 'has-error' : ''} ${activeField ? 'field-focused' : ''}`}>
      <div className="voice-guide-header">
        <div className="voice-guide-title-wrap">
          <span className={`voice-guide-icon-badge ${currentStep.isError ? 'error-badge' : ''}`}>
            {activeField ? <Target size={16} /> : (currentStep.isError ? <AlertCircle size={16} /> : <ShieldCheck size={16} />)}
          </span>
          <span className="voice-guide-title">KYC Voice Guide</span>
          <span className={`voice-guide-tag ${activeField ? 'focus-tag' : (currentStep.isError ? 'error-tag' : '')}`}>{activeLabel}</span>
        </div>

        <div className="voice-guide-actions">
          <button
            type="button"
            className="voice-btn"
            onClick={handleReplay}
            title="Replay KYC voice instruction"
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
    </div>
  );
};

