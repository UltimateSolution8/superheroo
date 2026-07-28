export type UserRole = 'BUYER' | 'HELPER' | 'ADMIN' | 'MEDIATOR';
export type TaskStatus =
  | 'AI_PENDING'
  | 'AI_APPROVED'
  | 'ADMIN_REVIEW'
  | 'ADMIN_APPROVED'
  | 'ADMIN_REJECTED'
  | 'PAYMENT_PENDING'
  | 'SCHEDULED_PENDING'
  | 'SEARCHING'
  | 'ASSIGNED'
  | 'ARRIVED'
  | 'STARTED'
  | 'COMPLETED'
  | 'CANCELLED';
export type TaskUrgency = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';

export type AuthUser = {
  id: string;
  role: UserRole;
  phone?: string | null;
  email?: string | null;
  emailVerified?: boolean;
  displayName?: string | null;
  bulkCsvEnabled?: boolean;
};

export type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export type Task = {
  id: string;
  buyerId: string;
  buyerPhone?: string | null;
  buyerName?: string | null;
  title: string;
  description: string;
  urgency: TaskUrgency;
  timeMinutes: number;
  budgetPaise: number;
  lat: number;
  lng: number;
  addressText?: string | null;
  scheduledAt?: string | null;
  status: TaskStatus;
  assignedHelperId?: string | null;
  helperPhone?: string | null;
  helperName?: string | null;
  arrivalOtp?: string | null;
  completionOtp?: string | null;
  workStartedAt?: string | null;
  cancelReason?: string | null;
  cancelledByRole?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
  landmark?: string | null;
  paymentCollectionMode?: 'ONLINE_PREPAID' | 'PAY_AFTER_SERVICE' | null;
  verificationMode?: 'PHOTO_AND_OTP' | 'OTP_ONLY' | null;
};

export type HelperProfile = {
  kycStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  kycRejectionReason?: string | null;
  kycFullName?: string | null;
  kycTokenNumber?: string | null;
  kycQueuePosition?: number | null;
  kycEstimatedWaitMinutes?: number | null;
};

export type CreateTaskPayload = {
  title: string;
  description: string;
  urgency: TaskUrgency;
  timeMinutes: number;
  budgetPaise: number;
  lat: number;
  lng: number;
  addressText?: string | null;
  scheduledAt?: string | null;
  landmark?: string | null;
  paymentCollectionMode: 'PAY_AFTER_SERVICE';
  verificationMode: 'OTP_ONLY';
};
