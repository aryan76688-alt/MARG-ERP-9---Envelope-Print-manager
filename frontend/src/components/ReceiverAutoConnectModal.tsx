import React, { useState, useEffect, useRef } from 'react';
import { 
  PhoneOff, 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Radio, 
  AlertOctagon, 
  ShieldAlert 
} from 'lucide-react';
import { API_BASE } from '../api/client';

interface ReceiverAutoConnectModalProps {
  call: any;
  onClose: () => void;
}

export const ReceiverAutoConnectModal: React.FC<ReceiverAutoConnectModalProps> = ({
  call,
  onClose
}) => {
  const [callStatus, setCallStatus] = useState<'connecting' | 'connected' | 'ended'>('connecting');
  const [micEnabled, setMicEnabled] = useState<boolean>(true);
  const [cameraEnabled, setCameraEnabled] = useState<boolean>(true);
  const [duration, setDuration] = useState<number>(0);

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

  useEffect(() => {
    let timer: any = null;
    if (callStatus === 'connected') {
      timer = setInterval(() => setDuration((p) => p + 1), 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [callStatus]);

  useEffect(() => {
    autoConnectDirectCall();
    return () => {
      cleanup();
    };
  }, [call]);

  const autoConnectDirectCall = async () => {
    try {
      setCallStatus('connecting');

      // 1. Get user media automatically (direct call, receiver has no accept barrier)
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: call.mode === 'video',
          audio: true
        });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        } catch {
          // If receiver has no camera/mic, still allow audio listening
          stream = new MediaStream();
        }
      }

      localStreamRef.current = stream;
      if (localVideoRef.current && stream.getVideoTracks().length > 0) {
        localVideoRef.current.srcObject = stream;
      }

      // 2. Setup RTCPeerConnection
      const pc = new RTCPeerConnection(rtcConfig);
      peerConnectionRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setCallStatus('connected');
        }
      };

      // 3. Set Remote Description from Caller's Offer
      const offer = JSON.parse(call.sdp_offer);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // 4. Create and set Answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // 5. Send Answer to server immediately
      let myName = 'Staff';
      try {
        const u = JSON.parse(localStorage.getItem('user') || '{}');
        myName = u.full_name || u.username || 'Staff';
      } catch {}

      await fetch(`${API_BASE}/emergency-call/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: call.session_id,
          sdp_answer: JSON.stringify(answer),
          receiver_name: myName
        })
      });

      // 6. Candidate exchange
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          fetch(`${API_BASE}/emergency-call/candidate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: call.session_id,
              sender: 'receiver',
              candidate: event.candidate.toJSON()
            })
          }).catch(() => {});
        }
      };

      // 7. Poll for caller candidates & call termination
      pollIntervalRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${API_BASE}/emergency-call/status?session_id=${call.session_id}`);
          const data = await res.json();
          if (data.status === 'ended' || !data.active) {
            handleEndCall();
          }
          if (data.caller_candidates?.length) {
            for (const cand of data.caller_candidates) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch {}
            }
          }
        } catch {}
      }, 1500);

      setCallStatus('connected');
    } catch (err) {
      console.error('Auto-connect failed:', err);
    }
  };

  const cleanup = () => {
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

  const handleEndCall = () => {
    setCallStatus('ended');
    if (call?.session_id) {
      fetch(`${API_BASE}/emergency-call/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: call.session_id })
      }).catch(() => {});
    }
    cleanup();
    setTimeout(onClose, 600);
  };

  const toggleMic = () => {
    if (localStreamRef.current) {
      const audio = localStreamRef.current.getAudioTracks()[0];
      if (audio) {
        audio.enabled = !audio.enabled;
        setMicEnabled(audio.enabled);
      }
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const video = localStreamRef.current.getVideoTracks()[0];
      if (video) {
        video.enabled = !video.enabled;
        setCameraEnabled(video.enabled);
      }
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/95 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border-2 border-rose-500 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Urgent Emergency Header */}
        <div className="bg-gradient-to-r from-rose-600 to-red-600 px-4 py-3 text-white flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2.5">
            <Radio className="w-5 h-5 animate-ping text-white" />
            <div>
              <span className="text-xs sm:text-sm font-black uppercase tracking-wider font-mono block">
                🔴 DIRECT EMERGENCY CALL CONNECTED
              </span>
              <span className="text-[10px] text-rose-100 font-semibold">
                Caller: {call.caller_name || 'Admin Dispatch'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold bg-black/40 px-2 py-0.5 rounded-full">
              {formatSeconds(duration)}
            </span>
          </div>
        </div>

        {/* Video Canvas */}
        <div className="relative flex-1 bg-slate-950 min-h-[340px] sm:min-h-[420px] flex items-center justify-center overflow-hidden">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover ${call.mode === 'voice' ? 'hidden' : ''}`}
          />

          {(call.mode === 'voice' || callStatus !== 'connected') && (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
              <div className="w-20 h-20 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center text-rose-400 animate-pulse">
                <AlertOctagon className="w-10 h-10" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  Direct Live Audio Channel
                </h3>
                <p className="text-xs text-slate-400">
                  Connected directly with {call.caller_name || 'Admin'}
                </p>
              </div>
            </div>
          )}

          {call.mode === 'video' && (
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
        </div>

        {/* Footer Controls */}
        <div className="bg-slate-900 border-t border-slate-800 p-4 flex items-center justify-center gap-4">
          <button
            onClick={toggleMic}
            className={`p-3 rounded-2xl border transition-all cursor-pointer ${
              micEnabled
                ? 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700'
                : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
            }`}
          >
            {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>

          {call.mode === 'video' && (
            <button
              onClick={toggleCamera}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                cameraEnabled
                  ? 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
              }`}
            >
              {cameraEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
          )}

          <button
            onClick={handleEndCall}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs sm:text-sm shadow-xl cursor-pointer"
          >
            <PhoneOff className="w-5 h-5" />
            <span>End Call</span>
          </button>
        </div>
      </div>
    </div>
  );
};
