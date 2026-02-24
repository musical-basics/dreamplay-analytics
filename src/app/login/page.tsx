'use client';

import { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const [password, setPassword] = useState('');
    const [error, setError] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password.trim() || loading) return;

        setLoading(true);
        setError(false);

        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            });

            if (res.ok) {
                router.push('/');
                router.refresh();
            } else {
                setError(true);
                setPassword('');
            }
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-neutral-900 flex items-center justify-center p-6 font-sans">
            <div className="w-full max-w-sm">
                <form onSubmit={handleSubmit} className="bg-neutral-800 border border-neutral-700 rounded-2xl p-8 shadow-2xl space-y-6">
                    {/* Icon */}
                    <div className="flex justify-center">
                        <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                            <Lock className="w-6 h-6 text-blue-400" />
                        </div>
                    </div>

                    {/* Title */}
                    <div className="text-center">
                        <h1 className="text-xl font-bold text-white">DreamPlay Analytics</h1>
                        <p className="text-sm text-neutral-500 mt-1">Enter password to continue</p>
                    </div>

                    {/* Password Input */}
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => { setPassword(e.target.value); setError(false); }}
                            placeholder="Password"
                            autoFocus
                            className={`w-full bg-neutral-900 border rounded-lg px-4 py-3 pr-10 text-white placeholder-neutral-600 text-sm focus:outline-none focus:ring-2 transition-all ${error
                                ? 'border-red-500/50 focus:ring-red-500/30'
                                : 'border-neutral-700 focus:ring-blue-500/30 focus:border-blue-500/50'
                                }`}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
                        >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>

                    {/* Error */}
                    {error && (
                        <p className="text-red-400 text-xs text-center animate-in fade-in">
                            Incorrect password. Try again.
                        </p>
                    )}

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors text-sm"
                    >
                        {loading ? 'Verifying...' : 'Unlock Dashboard'}
                    </button>
                </form>
            </div>
        </div>
    );
}
