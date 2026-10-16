import React, { useState, useEffect, useRef } from 'react';
import { 
  PhoneCall, 
  PhoneOff, 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Radio, 
  AlertOctagon, 
  Volume2, 
  ShieldAlert,
  X
} from 'lucide-react';
import { API_BASE } from '../api/client';

interface EmergencyCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  isCaller?: boolean;
  initialMode?: 'video' | 'voice';
  targetUser?: string;
}

export const EmergencyCallModal: React.FC<EmergencyCallModalProps> = ({
  isOpen,
  onClose,
  isCaller = false,
  initialMode = 'video',
  targetUser = 'all'
}) => {
  const [callMode, setCallMode] = useState<'video' | 'voice'>(initialMode);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'connected' | 'ended'>('idle');
  const [micEnabled, setMicEnabled] = useState<boolean>(true);
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(true);
  const [sessionId, setSessionId] = useState<string>('');
  const [callerName, setCallerName] = useState<string>('');
  const [receiverName, setReceiverName] = useState<string>('');
  const [callDuration, setCallDuration] = useState<number>(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pollIntervalRef = useRef<any>(null);

  const rtcConfig: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  const getAuthHeader = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Timer for duration when connected
  useEffect(() => {
    let timer: any = null;
    if (callStatus === 'connected') {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callStatus]);

  // Handle Caller initiation
  useEffect(() => {
    if (!isOpen) return;

    if (isCaller) {
      startCallerCall();
    }

    return () => {
      cleanupCall();
    };
  }, [isOpen, isCaller]);

  const startCallerCall = async () => {
    try {
      setCallStatus('calling');
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: callMode === 'video',
          audio: true
        });
      } catch (mediaErr) {
        // Fallback to audio only
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        setCallMode('voice');
      }

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection(rtcConfig);
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setCallStatus('connected');
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer to server
      const res = await fetch(`${API_BASE}/emergency-call/initiate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({
          mode: callMode,
          target_user: targetUser,
          sdp_offer: JSON.stringify(offer),
          caller_name: 'Dispatch Admin'
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to initiate call');

      const sId = data.session_id;
      setSessionId(sId);

      // Candidate handling
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          fetch(`${API_BASE}/emergency-call/candidate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: sId,
              sender: 'caller',
              candidate: event.candidate.toJSON()
            })
          }).catch(() => {});
        }
      };

      // Poll for answer
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/emergency-call/status?session_id=${sId}`);
          const callData = await statusRes.json();
          if (callData.sdp_answer && !pc.currentRemoteDescription) {
            const answer = JSON.parse(callData.sdp_answer);
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            setCallStatus('connected');
            setReceiverName(callData.receiver_name || 'Staff');
          }
          if (callData.receiver_candidates?.length) {
            for (const cand of callData.receiver_candidates) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch {}
            }
          }
          if (callData.status === 'ended') {
            handleEndCall();
          }
        } catch {}
      }, 1500);

    } catch (err: any) {
      console.error('Call error:', err);
      alert('Could not start emergency call: ' + err.message);
      onClose();
    }
  };

  const cleanupCall = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
  };

  const handleEndCall = async () => {
    setCallStatus('ended');
    if (sessionId) {
      fetch(`${API_BASE}/emergency-call/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      }).catch(() => {});
    }
    cleanupCall();
    setTimeout(() => {
      onClose();
    }, 600);
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setMicEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setCameraEnabled(videoTrack.enabled);
      }
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/95 backdrop-blur-xl">
      <div className="relative w-full max-w-2xl bg-slate-900 border-2 border-rose-500/60 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Emergency Banner */}
        <div className="bg-rose-600 px-4 py-2.5 text-white flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 animate-pulse text-white" />
            <span className="text-xs sm:text-sm font-black uppercase tracking-wider font-mono">
              EMERGENCY DIRECT CALL • તાત્કાલિક કૉલ
            </span>
          </div>
          <div className="flex items-center gap-2">
            {callStatus === 'connected' && (
              <span className="text-xs font-mono font-bold bg-black/30 px-2 py-0.5 rounded-full">
                {formatSeconds(callDuration)}
              </span>
            )}
            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-white text-rose-700">
              {isCaller ? 'Broadcasting' : 'Direct Stream'}
            </span>
          </div>
        </div>

        {/* Video Canvas Area */}
        <div className="relative flex-1 bg-slate-950 min-h-[340px] sm:min-h-[420px] flex items-center justify-center overflow-hidden">
          {/* Remote Video (Receiver or Caller) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover ${callMode === 'voice' ? 'hidden' : ''}`}
          />

          {/* Voice Mode / Standby Fallback */}
          {(callMode === 'voice' || callStatus !== 'connected') && (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-4">
              <div className="w-24 h-24 rounded-full bg-rose-500/20 border-2 border-rose-500/50 flex items-center justify-center text-rose-400 animate-pulse">
                <AlertOctagon className="w-12 h-12" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white font-display">
                  {isCaller ? 'Connecting Emergency Live Stream...' : 'Incoming Dispatch Emergency Call'}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {callStatus === 'calling' 
                    ? 'Broadcasting to delivery staff & chemists...' 
                    : callStatus === 'connected'
                    ? `Live Direct Audio with ${isCaller ? receiverName || 'Staff' : 'Admin Dispatch'}`
                    : 'Call Ended'}
                </p>
              </div>
            </div>
          )}

          {/* Self Picture-in-Picture (Caller Video) */}
          {callMode === 'video' && (
            <div className="absolute bottom-4 right-4 w-28 sm:w-36 h-36 sm:h-48 rounded-2xl overflow-hidden border-2 border-slate-700 shadow-2xl bg-slate-900 z-10">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-1 left-2 text-[9px] font-bold text-white bg-black/60 px-1 rounded">
                You
              </span>
            </div>
          )}

          {/* Connected Badge */}
          {callStatus === 'connected' && (
            <div className="absolute top-4 left-4 bg-emerald-950/80 border border-emerald-500 text-emerald-300 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>LIVE CONNECTED</span>
            </div>
          )}
        </div>

        {/* Controls Footer */}
        <div className="bg-slate-900/95 border-t border-slate-800 p-4 flex items-center justify-center gap-4">
          <button
            onClick={toggleMic}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              micEnabled
                ? 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
            }`}
            title={micEnabled ? 'Mute Mic' : 'Unmute Mic'}
          >
            {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {callMode === 'video' && (
            <button
              onClick={toggleCamera}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                cameraEnabled
                  ? 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
              }`}
              title={cameraEnabled ? 'Disable Camera' : 'Enable Camera'}
            >
              {cameraEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
          )}

          {/* End Call Button */}
          <button
            onClick={handleEndCall}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-black text-xs sm:text-sm shadow-xl shadow-rose-900/40 transition-all cursor-pointer"
          >
            <PhoneOff className="w-5 h-5" />
            <span>End Call</span>
          </button>
        </div>
      </div>
    </div>
  );
};
