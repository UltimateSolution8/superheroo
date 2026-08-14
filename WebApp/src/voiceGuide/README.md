# Voice Guide Module Documentation

An isolated, lightweight, state-driven Voice Assistant module for web applications built using native browser Web Speech API.

## 🚀 Technologies & Libraries Used

- **Native Web Speech API (`window.speechSynthesis` & `SpeechSynthesisUtterance`)**: Provides built-in Text-to-Speech (TTS) with **zero external AI dependencies**, zero API costs, and zero network latency.
- **React 19 & TypeScript 5**: Reactive state tracking and strictly typed state machines (`LoginUiState`, `KycStepState`).
- **Lucide React Icons**: Lightweight icon set (`Volume2`, `VolumeX`, `RotateCcw`, `ShieldCheck`, `Sparkles`, `AlertCircle`).
- **Vanilla CSS**: Custom glassmorphism UI card and CSS keyframe audio wave animation (`@keyframes voiceWave`).

---

## 🛠️ Architecture Overview

The module lives in `WebApp/src/voiceGuide/` and consists of five core files:

```
WebApp/src/voiceGuide/
├── types.ts              # TypeScript interfaces and state union types
├── speechService.ts      # Singleton wrapper around window.speechSynthesis
├── voiceGuideStyles.css  # Card styling, badges, and sound wave animation
├── LoginVoiceGuide.tsx   # Login flow voice assistant widget & state machine
├── KycVoiceGuide.tsx     # Partner KYC step-by-step voice assistant & error detection
└── index.ts              # Module barrel exporter
```

---

## 🔍 How It Works: KYC Step Detection Deep Dive

Let's take the **Partner KYC Flow** (`KycVoiceGuide.tsx`) as an example of how state detection and speech triggering work under the hood.

### 1. Real-Time Prop Monitoring

The parent component (`PartnerKyc` in `main.tsx`) passes its reactive state to `<KycVoiceGuide />`:

```tsx
<KycVoiceGuide
  fullName={fullName}
  docType={docType}
  idNumber={idNumber}
  idValidationText={idValidationText}
  idFront={idFront}
  idBack={idBack}
  requiresBackUpload={requiresBackUpload}
  selfie={selfie}
  accountHolderName={accountHolderName}
  accountNumber={accountNumber}
  confirmAccountNumber={confirmAccountNumber}
  ifscCode={ifscCode}
  ifscResult={ifscResult}
  status={status}
  submittedReference={submittedReference}
  error={error}
  busy={busy}
/>
```

---

### 2. State Determination Function (`determineKycState`)

On every render or state change, `determineKycState(props)` checks the fields in strict sequential priority:

```typescript
function determineKycState(props: KycVoiceGuideProps): KycStepState {
  // Priority 1: Terminal States
  if (props.status === 'APPROVED') return 'APPROVED';
  if (props.submittedReference || props.status === 'PENDING') return 'PENDING';
  if (props.error) return 'FORM_ERROR';

  // Priority 2: Field Validation Errors (e.g. Aadhaar 12-digit check)
  if (props.idValidationText && props.idNumber.trim().length > 0) return 'ID_INVALID';

  // Priority 3: Form Steps (1 to 9)
  if (!props.fullName.trim() || props.fullName.trim().length < 2) return 'NAME';             // Step 1
  if (!props.idNumber.trim()) return 'ID_NUMBER';                                            // Step 2
  if (!props.idFront) return 'ID_FRONT';                                                     // Step 3
  if (props.requiresBackUpload && !props.idBack) return 'ID_BACK';                           // Step 4
  if (!props.selfie) return 'SELFIE';                                                         // Step 5
  if (!props.accountHolderName.trim() || props.accountHolderName.trim().length < 2) return 'ACCOUNT_HOLDER'; // Step 6
  if (!props.accountNumber.trim() || props.accountNumber.trim().length < 9) return 'ACCOUNT_NUMBER';          // Step 7
  if (!props.confirmAccountNumber.trim() || props.confirmAccountNumber !== props.accountNumber) return 'CONFIRM_ACCOUNT'; // Step 8
  if (!props.ifscCode.trim() || !props.ifscResult) return 'IFSC';                             // Step 9

  // Priority 4: All Complete
  return 'READY';
}
```

---

### 3. Speech Execution & Debouncing

When `currentState` or validation errors change, `KycVoiceGuide` triggers `speechService.speak(...)` with a **400ms debounce** to prevent speech interrupts while typing:

```typescript
useEffect(() => {
  const errorChanged = props.error !== prevErrorRef.current;
  const idValidationChanged = props.idValidationText !== prevIdValidationRef.current;
  const stateChanged = prevStateRef.current !== currentState;

  if (stateChanged || errorChanged || idValidationChanged) {
    prevStateRef.current = currentState;
    prevErrorRef.current = props.error || null;
    prevIdValidationRef.current = props.idValidationText || null;

    // Debounce to allow user typing pause
    const timer = setTimeout(() => {
      speechService.speak(currentStep.instruction);
    }, 400);

    return () => clearTimeout(timer);
  }
}, [currentState, props.error, props.idValidationText, currentStep.instruction]);
```

---

### 4. Native Text-to-Speech Engine (`speechService.ts`)

Inside `speechService.ts`:

1. **Browser Capability Check**: Verifies `window.speechSynthesis` is available.
2. **Voice Selection**: Auto-detects and selects Indian English (`en-IN`), Hindi (`hi-IN`), or natural system voices.
3. **Queue Cancellation**: Calls `window.speechSynthesis.cancel()` before speaking to stop old audio queues.
4. **Pace Control**: Sets `utterance.rate = 0.88` for clear, calm pronunciation.
5. **Mute State Persistence**: Remembers user mute preference in `localStorage`.

---

## 💡 How to Reuse in Other Pages

To add voice guidance to a new page (e.g., Task Booking page):

1. Create a step evaluator function for that page's fields.
2. Call `speechService.speak("Instruction text")` on step transitions.
3. Wrap in a UI component using `./voiceGuideStyles.css`.
