import { useState, useEffect, useRef } from 'react';
import { API_BASE } from '../api/client';

export function useEmergencyReceiver() {
  const [incomingCall, setIncomingCall] = useState<any | null>(null);
  const [isReceivingCall, setIsReceivingCall] = useState<boolean>(false);
  const isHandlingCallRef = useRef<boolean>(false);

  useEffect(() => {
    let timer: any = null;

    const poll = async () => {
      if (isHandlingCallRef.current) return;
      try {
        const res = await fetch(`${API_BASE}/emergency-call/poll?target=all`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.has_call && data.call && data.call.status === 'ringing') {
          // Check if current user is the caller
          let currentUserId: any = null;
          try {
            const u = JSON.parse(localStorage.getItem('user') || '{}');
            currentUserId = u.id;
          } catch {}

          if (data.call.caller_id !== currentUserId) {
            isHandlingCallRef.current = true;
            setIncomingCall(data.call);
            setIsReceivingCall(true);
          }
        }
      } catch {}
    };

    timer = setInterval(poll, 2500);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  const dismissCall = () => {
    setIsReceivingCall(false);
    setIncomingCall(null);
    isHandlingCallRef.current = false;
  };

  return {
    incomingCall,
    isReceivingCall,
    dismissCall
  };
}
