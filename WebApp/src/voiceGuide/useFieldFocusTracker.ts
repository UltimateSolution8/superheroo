import { useEffect, useState, useRef, useCallback } from 'react';
import { detectFieldInstruction, FieldGuideInfo } from './fieldGuideService';
import { speechService } from './speechService';

export interface UseFieldFocusTrackerReturn {
  activeField: FieldGuideInfo | null;
  clearActiveField: () => void;
  replayActiveField: () => void;
}

export function useFieldFocusTracker(enabled: boolean = true): UseFieldFocusTrackerReturn {
  const [activeField, setActiveField] = useState<FieldGuideInfo | null>(null);
  const activeFieldRef = useRef<FieldGuideInfo | null>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const clearActiveField = useCallback(() => {
    setActiveField(null);
    activeFieldRef.current = null;
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
  }, []);

  const replayActiveField = useCallback(() => {
    if (activeFieldRef.current) {
      speechService.speak(activeFieldRef.current.instruction);
    }
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleInteract = (event: Event) => {
      const target = event.target as HTMLElement;
      if (!target) return;

      // Check if target or parent is an interactive input, select, textarea, button, label, or upload field
      const inputEl = target.closest('input, select, textarea, button, label, .form-group, .kyc-field-wrap, .upload-box, [data-voice-guide], .voice-guided-field') as HTMLElement;
      if (!inputEl) return;

      // If a label or container was hovered, find associated input element
      let targetForGuide: HTMLElement = inputEl;
      if (inputEl.tagName.toLowerCase() === 'label') {
        const forId = inputEl.getAttribute('for') || inputEl.getAttribute('htmlFor');
        if (forId) {
          const linkedInput = document.getElementById(forId);
          if (linkedInput) targetForGuide = linkedInput;
        } else {
          const childInput = inputEl.querySelector('input, select, textarea');
          if (childInput) targetForGuide = childInput as HTMLElement;
        }
      } else if (inputEl.classList.contains('form-group') || inputEl.classList.contains('kyc-field-wrap')) {
        const childInput = inputEl.querySelector('input, select, textarea, button, [data-voice-guide]');
        if (childInput) targetForGuide = childInput as HTMLElement;
      }

      const fieldInfo = detectFieldInstruction(targetForGuide);
      if (!fieldInfo) return;

      // Avoid repeating if focusing/hovering the exact same field repeatedly
      if (activeFieldRef.current?.id === fieldInfo.id && activeFieldRef.current?.instruction === fieldInfo.instruction) {
        return;
      }

      // Add visual focus highlight class to active input
      document.querySelectorAll('.voice-focus-highlight').forEach(el => el.classList.remove('voice-focus-highlight'));
      targetForGuide.classList.add('voice-focus-highlight');

      activeFieldRef.current = fieldInfo;
      setActiveField(fieldInfo);

      // Debounce speech execution (250ms) for responsive hover voice instruction
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        speechService.speak(fieldInfo.instruction);
      }, 250);
    };

    // Listen to mouseenter, mouseover, focusin, and click for immediate cursor hover & click response
    window.addEventListener('mouseenter', handleInteract, true);
    window.addEventListener('mouseover', handleInteract, true);
    window.addEventListener('focusin', handleInteract, true);
    window.addEventListener('click', handleInteract, true);

    return () => {
      window.removeEventListener('mouseenter', handleInteract, true);
      window.removeEventListener('mouseover', handleInteract, true);
      window.removeEventListener('focusin', handleInteract, true);
      window.removeEventListener('click', handleInteract, true);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled]);

  return {
    activeField,
    clearActiveField,
    replayActiveField,
  };
}
