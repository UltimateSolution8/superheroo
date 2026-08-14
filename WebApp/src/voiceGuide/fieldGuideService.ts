export interface FieldGuideInfo {
  id: string;
  label: string;
  instruction: string;
}

const FIELD_GUIDE_DATABASE: Record<string, FieldGuideInfo> = {
  email: {
    id: 'email',
    label: 'Email Address',
    instruction: 'Please enter a valid email address (e.g. user@domain.com) to receive account notifications and receipts.',
  },
  phone: {
    id: 'phone',
    label: 'Mobile Number',
    instruction: 'Enter your 10-digit Indian mobile number starting with 6, 7, 8, or 9.',
  },
  otp: {
    id: 'otp',
    label: 'Verification OTP',
    instruction: 'Enter the verification OTP code sent to your mobile phone.',
  },
  password: {
    id: 'password',
    label: 'Password',
    instruction: 'Enter a secure password with at least 8 characters, including a letter and a number.',
  },
  confirmPassword: {
    id: 'confirmPassword',
    label: 'Confirm Password',
    instruction: 'Re-enter your password to confirm both passwords match.',
  },
  fullName: {
    id: 'fullName',
    label: 'Full Legal Name',
    instruction: 'Enter your full legal name as printed on your government ID card.',
  },
  docType: {
    id: 'docType',
    label: 'Identity Document Type',
    instruction: 'Select your government identity document type: Aadhaar Card, PAN Card, or Voter ID.',
  },
  idNumber: {
    id: 'idNumber',
    label: 'Document ID Number',
    instruction: 'Enter your 12-digit Aadhaar number or valid government document ID number.',
  },
  idFront: {
    id: 'idFront',
    label: 'ID Front Upload',
    instruction: 'Click to select and upload a clear photo of the front side of your ID document.',
  },
  idBack: {
    id: 'idBack',
    label: 'Aadhaar Back Upload',
    instruction: 'Click to select and upload a clear photo of the back side of your Aadhaar card.',
  },
  selfie: {
    id: 'selfie',
    label: 'Partner Selfie',
    instruction: 'Upload a clear selfie photo showing your face for identity verification.',
  },
  accountHolderName: {
    id: 'accountHolderName',
    label: 'Account Holder Name',
    instruction: 'Enter your bank account holder name exactly as printed on your passbook.',
  },
  accountNumber: {
    id: 'accountNumber',
    label: 'Bank Account Number',
    instruction: 'Enter your 9 to 18 digit bank account number for direct payout deposits.',
  },
  confirmAccountNumber: {
    id: 'confirmAccountNumber',
    label: 'Confirm Account Number',
    instruction: 'Re-enter your bank account number to verify both numbers match.',
  },
  ifscCode: {
    id: 'ifscCode',
    label: 'Bank IFSC Code',
    instruction: 'Enter your bank\'s 11-character IFSC code (e.g., SBIN0001234) and click Verify.',
  },
  location: {
    id: 'location',
    label: 'Service Location',
    instruction: 'Type your area, street, or landmark to search and set location coordinates.',
  },
  taskTitle: {
    id: 'taskTitle',
    label: 'Task Category / Title',
    instruction: 'Describe what kind of service or assistance you need.',
  },
  taskNotes: {
    id: 'taskNotes',
    label: 'Task Details',
    instruction: 'Provide clear instructions or special requirements for the service partner.',
  },
  amount: {
    id: 'amount',
    label: 'Offered Amount',
    instruction: 'Enter the proposed budget or offer amount in Indian Rupees.',
  },
  supportMessage: {
    id: 'supportMessage',
    label: 'Support Message',
    instruction: 'Write your question or message for our customer support team.',
  },
};

/**
 * Detect field guidance from HTML element attributes or ID/Name matching.
 */
export function detectFieldInstruction(element: HTMLElement): FieldGuideInfo | null {
  if (!element) return null;

  // Priority 1: Explicit custom data-voice-guide attribute
  const customGuide = element.getAttribute('data-voice-guide') || element.getAttribute('data-field-guide');
  const customLabel = element.getAttribute('data-voice-label') || element.getAttribute('aria-label') || 'Input Field';
  if (customGuide) {
    return {
      id: element.id || 'custom',
      label: customLabel,
      instruction: customGuide,
    };
  }

  // Priority 2: Check input type, id, name, placeholder, label
  const tag = element.tagName.toLowerCase();
  const inputType = (element as HTMLInputElement).type || '';
  const idAttr = (element.id || '').toLowerCase();
  const nameAttr = (element as HTMLInputElement).name ? (element as HTMLInputElement).name.toLowerCase() : '';
  const placeholder = ((element as HTMLInputElement).placeholder || '').toLowerCase();

  // Combine identifiers to match
  const combined = `${idAttr} ${nameAttr} ${placeholder} ${inputType}`;

  // Email
  if (inputType === 'email' || idAttr.includes('email') || nameAttr.includes('email') || placeholder.includes('email')) {
    return FIELD_GUIDE_DATABASE.email;
  }

  // Phone / Mobile / Tel
  if (inputType === 'tel' || idAttr.includes('phone') || idAttr.includes('mobile') || nameAttr.includes('phone') || nameAttr.includes('mobile') || placeholder.includes('mobile') || placeholder.includes('phone')) {
    return FIELD_GUIDE_DATABASE.phone;
  }

  // OTP
  if (idAttr.includes('otp') || nameAttr.includes('otp') || placeholder.includes('otp')) {
    return FIELD_GUIDE_DATABASE.otp;
  }

  // Confirm Password
  if (idAttr.includes('confirmpass') || nameAttr.includes('confirmpass')) {
    return FIELD_GUIDE_DATABASE.confirmPassword;
  }

  // Password
  if (inputType === 'password' || idAttr.includes('password') || nameAttr.includes('password')) {
    return FIELD_GUIDE_DATABASE.password;
  }

  // Full Name
  if (idAttr.includes('fullname') || idAttr.includes('signupname') || nameAttr.includes('fullname') || nameAttr.includes('name') || placeholder.includes('full name') || placeholder.includes('legal name')) {
    return FIELD_GUIDE_DATABASE.fullName;
  }

  // Doc Type
  if (idAttr.includes('doctype') || nameAttr.includes('doctype')) {
    return FIELD_GUIDE_DATABASE.docType;
  }

  // ID Number / Aadhaar
  if (idAttr.includes('idnumber') || nameAttr.includes('idnumber') || idAttr.includes('aadhaar') || placeholder.includes('aadhaar') || placeholder.includes('id number')) {
    return FIELD_GUIDE_DATABASE.idNumber;
  }

  // ID Front
  if (idAttr.includes('idfront') || nameAttr.includes('idfront')) {
    return FIELD_GUIDE_DATABASE.idFront;
  }

  // ID Back
  if (idAttr.includes('idback') || nameAttr.includes('idback')) {
    return FIELD_GUIDE_DATABASE.idBack;
  }

  // Selfie
  if (idAttr.includes('selfie') || nameAttr.includes('selfie')) {
    return FIELD_GUIDE_DATABASE.selfie;
  }

  // Account Holder Name
  if (idAttr.includes('accountholder') || nameAttr.includes('accountholder') || placeholder.includes('holder')) {
    return FIELD_GUIDE_DATABASE.accountHolderName;
  }

  // Confirm Account Number
  if (idAttr.includes('confirmaccount') || nameAttr.includes('confirmaccount')) {
    return FIELD_GUIDE_DATABASE.confirmAccountNumber;
  }

  // Account Number
  if (idAttr.includes('accountnumber') || nameAttr.includes('accountnumber') || placeholder.includes('account number')) {
    return FIELD_GUIDE_DATABASE.accountNumber;
  }

  // IFSC
  if (idAttr.includes('ifsc') || nameAttr.includes('ifsc') || placeholder.includes('ifsc')) {
    return FIELD_GUIDE_DATABASE.ifscCode;
  }

  // Location / Address
  if (idAttr.includes('address') || idAttr.includes('location') || placeholder.includes('address') || placeholder.includes('location')) {
    return FIELD_GUIDE_DATABASE.location;
  }

  // Amount / Price
  if (idAttr.includes('amount') || idAttr.includes('price') || placeholder.includes('amount') || placeholder.includes('rupees')) {
    return FIELD_GUIDE_DATABASE.amount;
  }

  // Support Message
  if (tag === 'textarea' || idAttr.includes('message') || idAttr.includes('support') || placeholder.includes('message')) {
    return FIELD_GUIDE_DATABASE.supportMessage;
  }

  // Generic Fallback based on element placeholder or aria-label
  if (placeholder || element.getAttribute('aria-label')) {
    const labelText = element.getAttribute('aria-label') || placeholder;
    return {
      id: element.id || 'field',
      label: labelText.charAt(0).toUpperCase() + labelText.slice(1),
      instruction: `Enter or update details for ${labelText}.`,
    };
  }

  return null;
}
