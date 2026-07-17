import React from 'react';

export default function VerifyOtp() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950">
      <div className="glass-panel p-8 rounded-xl max-w-sm text-center">
        <h2 className="text-2xl font-bold">OTP Verification</h2>
        <p className="mt-2 text-slate-400">Please enter the verification code sent to your email.</p>
      </div>
    </div>
  );
}
