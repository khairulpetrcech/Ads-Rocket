import React, { useState, useEffect } from 'react';
import { Shield, Users, RefreshCw, CheckCircle, XCircle, Loader2, Lock } from 'lucide-react';

const ADMIN_API = '/api/admin-api';
const ADMIN_PASSWORD_KEY = 'ar_admin_password';

interface AdminUser {
    fbId: string;
    fbName: string;
    profilePicture: string;
    connectedAt: string;
    adAccountName: string;
    campaignCount: number;
    isAllowed: boolean;
}

const AdminPage: React.FC = () => {
    const [password, setPassword] = useState(() => localStorage.getItem(ADMIN_PASSWORD_KEY) || '');
    const [authed, setAuthed] = useState(false);
    const [authError, setAuthError] = useState('');
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [error, setError] = useState('');

    const fetchUsers = async (pw: string) => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${ADMIN_API}?action=users`, {
                headers: { Authorization: `Bearer ${pw}` }
            });
            if (res.status === 401) {
                setAuthed(false);
                setAuthError('Wrong password.');
                return;
            }
            const data = await res.json();
            setUsers(data.users || []);
            setAuthed(true);
            localStorage.setItem(ADMIN_PASSWORD_KEY, pw);
        } catch (e: any) {
            setError('Failed to fetch users.');
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setAuthError('');
        fetchUsers(password);
    };

    const handleToggleAllowed = async (user: AdminUser) => {
        const action = user.isAllowed ? 'disallow-user' : 'allow-user';
        setTogglingId(user.fbId);
        try {
            const res = await fetch(`${ADMIN_API}?action=${action}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${password}`
                },
                body: JSON.stringify({ fbId: user.fbId })
            });
            const data = await res.json();
            if (data.success) {
                setUsers(prev =>
                    prev.map(u => u.fbId === user.fbId ? { ...u, isAllowed: data.is_allowed } : u)
                );
            } else {
                setError(data.error || 'Failed to update user.');
            }
        } catch (e: any) {
            setError('Network error.');
        } finally {
            setTogglingId(null);
        }
    };

    // Login form
    if (!authed) {
        return (
            <div className="max-w-sm mx-auto mt-20">
                <div className="bg-[#1e293b] p-8 rounded-xl border border-slate-700 shadow-xl">
                    <div className="flex items-center gap-3 mb-6">
                        <Lock size={22} className="text-indigo-400" />
                        <h1 className="text-xl font-bold text-white">Admin Access</h1>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <input
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Admin password"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                            autoFocus
                        />
                        {authError && <p className="text-red-400 text-sm">{authError}</p>}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Shield size={18} />}
                            Login
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Shield size={24} className="text-indigo-400" />
                    <h1 className="text-2xl font-bold text-white">Admin — User Access</h1>
                </div>
                <button
                    onClick={() => fetchUsers(password)}
                    disabled={loading}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-4 py-2 rounded-lg text-sm transition-all"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {error && (
                <div className="bg-red-900/20 border border-red-800 text-red-300 px-4 py-3 rounded-lg mb-6 text-sm">
                    {error}
                </div>
            )}

            <div className="bg-[#1e293b] rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-700 flex items-center gap-2 text-slate-400 text-sm">
                    <Users size={16} />
                    <span>{users.length} user{users.length !== 1 ? 's' : ''}</span>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <Loader2 size={28} className="animate-spin text-indigo-400" />
                    </div>
                ) : users.length === 0 ? (
                    <div className="text-center py-16 text-slate-500">No users found.</div>
                ) : (
                    <ul className="divide-y divide-slate-700/50">
                        {users.map(user => (
                            <li key={user.fbId} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-800/30 transition-colors">
                                {/* Avatar */}
                                <div className="w-10 h-10 rounded-full bg-slate-700 overflow-hidden flex-shrink-0">
                                    {user.profilePicture ? (
                                        <img src={user.profilePicture} alt={user.fbName} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold text-sm">
                                            {user.fbName.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-medium truncate">{user.fbName}</p>
                                    <p className="text-slate-500 text-xs truncate">{user.adAccountName || user.fbId}</p>
                                    <p className="text-slate-600 text-xs">{user.campaignCount} campaigns</p>
                                </div>

                                {/* Status badge */}
                                <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${user.isAllowed ? 'bg-green-900/30 text-green-400 border border-green-800/50' : 'bg-red-900/30 text-red-400 border border-red-800/50'}`}>
                                    {user.isAllowed ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                    {user.isAllowed ? 'Allowed' : 'Blocked'}
                                </div>

                                {/* Toggle button */}
                                <button
                                    onClick={() => handleToggleAllowed(user)}
                                    disabled={togglingId === user.fbId}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                                        user.isAllowed
                                            ? 'bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-800/50'
                                            : 'bg-green-900/20 hover:bg-green-900/40 text-green-400 border border-green-800/50'
                                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    {togglingId === user.fbId
                                        ? <Loader2 size={14} className="animate-spin" />
                                        : user.isAllowed ? <XCircle size={14} /> : <CheckCircle size={14} />
                                    }
                                    {user.isAllowed ? 'Block' : 'Allow'}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default AdminPage;
