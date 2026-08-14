import { UserRole } from '../types';

export type LoginUiState =
  | 'ROLE_SELECT'
  | 'TYPING_PHONE'
  | 'PHONE_READY'
  | 'OTP_SENT'
  | 'OTP_READY'
  | 'BUSY'
  | 'ERROR'
  | 'SUCCESS';

export interface VoiceGuideStep {
  state: LoginUiState;
  title: string;
  instruction: string;
  shortLabel: string;
}

export interface VoiceGuideProps {
  role: UserRole;
  phone: string;
  otpSent: boolean;
  otp: string;
  busy: boolean;
  error: string | null;
  isAuthenticated?: boolean;
  onSelectRole?: (role: UserRole) => void;
}

export interface SpeechOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  lang?: string;
  onEnd?: () => void;
  onError?: (err: any) => void;
}
