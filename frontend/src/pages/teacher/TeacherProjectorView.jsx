import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import client from '../../api/client';

export default function TeacherProjectorView() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Active Rolling Token state
  const [tokenData, setTokenData] = useState({ token: '', remaining_seconds: 5 });
  const [countdown, setCountdown] = useState(5);

  // Live Roster state
  const [roster, setRoster] = useState({ total_enrolled: 0, total_present: 0, records: [] });
  const [closing, setClosing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const fetchTokenRef = useRef(null);
  const fetchRosterRef = useRef(null);

  // Load Session and verify access
  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await client.get(`/attendance/sessions/${sessionId}/active-token`);
        setTokenData(res.data);
        setCountdown(res.data.remaining_seconds || 5);

        // Fetch roster to get session title & status
        const rosterRes = await client.get(`/attendance/sessions/${sessionId}/live-roster`);
        setRoster(rosterRes.data);
        setSession({
          id: sessionId,
          title: rosterRes.data.title,
          is_active: rosterRes.data.is_active
        });
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load attendance session.');
      } finally {
        setLoading(false);
      }
    };

    fetchSession();
  }, [sessionId]);

  // Periodic Rolling QR Token Fetcher (every 4-5s)
  useEffect(() => {
    if (!session || !session.is_active) return;

    const refreshToken = async () => {
      try {
        const res = await client.get(`/attendance/sessions/${sessionId}/active-token`);
        setTokenData(res.data);
        setCountdown(res.data.remaining_seconds || 5);
        if (!res.data.is_active) {
          setSession(prev => ({ ...prev, is_active: false }));
        }
      } catch (err) {
        console.warn('Failed to refresh QR token:', err);
      }
    };

    // 1-second interval for smooth countdown animation
    const countdownTimer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          refreshToken();
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownTimer);
  }, [sessionId, session?.is_active]);

  // Live Roster Poller (every 3 seconds)
  useEffect(() => {
    if (!session || !session.is_active) return;

    const pollRoster = async () => {
      try {
        const res = await client.get(`/attendance/sessions/${sessionId}/live-roster`);
        setRoster(res.data);
      } catch (err) {
        console.warn('Failed to poll live roster:', err);
      }
    };

    const rosterInterval = setInterval(pollRoster, 3000);
    return () => clearInterval(rosterInterval);
  }, [sessionId, session?.is_active]);

  const handleCloseSession = async () => {
    if (!window.confirm("Are you sure you want to end this attendance session? Students won't be able to scan.")) return;
    setClosing(true);
    try {
      await client.post(`/attendance/sessions/${sessionId}/close`);
      setSession(prev => ({ ...prev, is_active: false }));
      alert("Attendance session closed successfully.");
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to close session.");
    } finally {
      setClosing(false);
    }
  };

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const response = await client.get(`/attendance/sessions/${sessionId}/export-csv`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `attendance_session_${sessionId}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      alert("Failed to export attendance CSV.");
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center text-slate-700">
        <div className="w-12 h-12 rounded-full border-4 border-brand-200 border-t-brand-600 animate-spin mb-4" />
        <p className="text-slate-500 font-medium tracking-wide text-sm">Initializing Projector View…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white border border-red-200 rounded-3xl p-8 max-w-md shadow-card text-slate-800">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl">⚠️</div>
          <p className="text-lg font-bold text-slate-900 mb-2">Error</p>
          <p className="text-sm text-slate-500 mb-6">{error}</p>
          <button
            onClick={() => navigate('/teacher/exams')}
            className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition shadow-sm"
          >
            ← Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // QR Payload Format encoded for Student Scanner
  const qrPayload = JSON.stringify({
    session_id: parseInt(sessionId),
    token: tokenData.token,
    type: 'EXAMGUARD_ATTENDANCE'
  });

  const percentage = roster.total_enrolled > 0
    ? Math.round((roster.total_present / roster.total_enrolled) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col select-none">
      {/* Header Bar */}
      <header className="px-4 sm:px-8 py-4 border-b border-slate-200 bg-white/90 backdrop-blur-md sticky top-0 z-20 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => navigate('/teacher/exams')}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition flex items-center gap-1.5 flex-shrink-0"
          >
            ← Exit Projector
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-lg sm:text-xl font-bold text-slate-900 font-display tracking-tight truncate">
                {roster.title || `Attendance Session #${sessionId}`}
              </h1>
              {session?.is_active ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  LIVE • 5s ROLLING QR
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">
                  SESSION CLOSED
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
              <span>🛡️ Geofence: 50m Radius</span>
              <span>•</span>
              <span>Device Lock: Active</span>
              <span>•</span>
              <span>Anti-Proxy Face ID: Enabled</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            disabled={isExporting}
            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 hover:border-slate-300 text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
          >
            📥 Export CSV
          </button>
          {session?.is_active && (
            <button
              onClick={handleCloseSession}
              disabled={closing}
              className="px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
            >
              🛑 End Session
            </button>
          )}
        </div>
      </header>

      {/* Main Grid: Left = QR Display, Right = Live Roster Feed */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 p-4 sm:p-8 max-w-7xl mx-auto w-full items-start">
        {/* Left Column: Dynamic QR Projector */}
        <div className="lg:col-span-7 flex flex-col items-center justify-center bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-card relative overflow-hidden">
          {/* Subtle Ambient Glow */}
          <div className="absolute -top-24 -left-24 w-64 h-64 bg-indigo-50/70 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-emerald-50/70 rounded-full blur-3xl pointer-events-none" />

          {/* Countdown & Status Header */}
          <div className="flex items-center justify-between w-full max-w-sm mb-6 z-10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-600 animate-pulse" />
              <span className="text-xs uppercase tracking-wider font-bold text-slate-600">
                Cryptographic Token
              </span>
            </div>
            {session?.is_active && (
              <div className="flex items-center gap-2 text-xs font-bold text-brand-700 bg-brand-50 px-3.5 py-1 rounded-full border border-brand-200 shadow-xs">
                <span>Rotates in:</span>
                <span className="font-mono text-sm w-4 text-center font-extrabold text-brand-600">{countdown}s</span>
              </div>
            )}
          </div>

          {/* High-Contrast QR Code Card */}
          <div className="p-6 bg-slate-50/70 border border-slate-200/80 rounded-3xl shadow-sm relative group z-10">
            <div className="p-4 bg-white rounded-2xl shadow-md border border-slate-100">
              {session?.is_active && tokenData.token && tokenData.token !== 'EXPIRED' ? (
                <div className="relative">
                  <QRCodeSVG
                    value={qrPayload}
                    size={280}
                    level="M"
                    includeMargin={true}
                    className="rounded-xl mx-auto"
                  />
                  {/* Center Shield Badge */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-12 h-12 rounded-2xl bg-brand-600 border-2 border-white flex items-center justify-center shadow-lg">
                      <span className="text-xl">🛡️</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="w-[280px] h-[280px] flex flex-col items-center justify-center text-slate-700 p-6 text-center">
                  <span className="text-4xl mb-2">🔒</span>
                  <p className="font-bold text-slate-900 text-sm">Session Closed</p>
                  <p className="text-xs text-slate-500 mt-1">This attendance session is no longer active.</p>
                </div>
              )}
            </div>
          </div>

          {/* Instructions below QR */}
          <div className="mt-6 text-center max-w-md z-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-100/80 border border-slate-200 text-xs font-semibold text-slate-700 mb-2">
              <span>Students: Open</span>
              <span className="text-brand-600 font-bold">ExamGuard Portal ➔ Mark Attendance</span>
            </div>
            <p className="text-[11px] text-slate-500">
              • Scan screen directly • Geofence active within 50m • Dynamic 5s anti-photo token
            </p>
          </div>
        </div>

        {/* Right Column: Live Roster & Metrics */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Real-time Summary Card */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Attendance</p>
                <h3 className="text-3xl font-extrabold text-slate-900 font-display mt-0.5">
                  {roster.total_present}
                  <span className="text-lg font-normal text-slate-400"> / {roster.total_enrolled}</span>
                </h3>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black text-emerald-600 font-display">{percentage}%</span>
                <p className="text-xs font-semibold text-slate-500">Present</p>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden p-0.5 border border-slate-200">
              <div
                className="bg-gradient-to-r from-brand-600 to-emerald-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
          </div>

          {/* Live Check-in Stream Feed */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-card flex-1 flex flex-col min-h-[420px]">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Recent Check-ins ({roster.records.length})
              </h4>
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1.5 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                Live Sync
              </span>
            </div>

            {roster.records.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-slate-400">
                <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center text-xl mb-3">📡</div>
                <p className="text-xs font-semibold text-slate-700">Waiting for first student to scan…</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Scanned students will appear here in real-time</p>
              </div>
            ) : (
              <div className="space-y-2.5 overflow-y-auto max-h-[380px] pr-1">
                {roster.records.map((r, i) => (
                  <div
                    key={r.record_id || i}
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between hover:border-brand-200 hover:bg-slate-50/80 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center font-bold text-xs shadow-xs">
                        {r.student_name ? r.student_name.charAt(0).toUpperCase() : 'S'}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900">{r.student_name}</p>
                        <p className="text-[10px] text-slate-500">{r.student_email}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        ✓ {r.distance_meters !== null ? `${r.distance_meters}m` : 'VERIFIED'}
                      </span>
                      <p className="text-[9px] text-slate-400 mt-0.5 font-mono">
                        {r.verified_at ? new Date(r.verified_at).toLocaleTimeString() : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
