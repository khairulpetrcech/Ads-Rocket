
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrackedUser, TrackedCampaign } from '../types';
import {
    Users, Activity, Calendar, Image, Video, RefreshCw,
    LogOut, ChevronDown, ChevronUp, ArrowLeft, Loader2,
    Clock, Target, Briefcase
} from 'lucide-react';

const ADMIN_PASSWORD = 'rocket@admin2024';

// Format date to readable string
const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-MY', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

// Format relative time
const formatRelativeTime = (isoString: string) => {
    const now = new Date();
    const date = new Date(isoString);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(isoString);
};

const AdminPage: React.FC = () => {
    const navigate = useNavigate();
    const [users, setUsers] = useState<TrackedUser[]>([]);
    const [campaigns, setCampaigns] = useState<TrackedCampaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState<'users' | 'campaigns'>('users');
    const [expandedUser, setExpandedUser] = useState<string | null>(null);

    const fetchData = async () => {
        setLoading(true);
        setError('');

        try {
            // Fetch users
            const usersRes = await fetch('/api/admin-api?action=users', {
                headers: { 'Authorization': `Bearer ${ADMIN_PASSWORD}` }
            });

            if (!usersRes.ok) {
                throw new Error('Failed to fetch users');
            }

            const usersData = await usersRes.json();
            setUsers(usersData.users || []);

            // Fetch campaigns
            const campaignsRes = await fetch('/api/admin-api?action=campaigns', {
                headers: { 'Authorization': `Bearer ${ADMIN_PASSWORD}` }
            });

            if (!campaignsRes.ok) {
                throw new Error('Failed to fetch campaigns');
            }

            const campaignsData = await campaignsRes.json();
            setCampaigns(campaignsData.campaigns || []);

        } catch (err: any) {
            console.error('Admin fetch error:', err);
            setError(err.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('ar_admin');
        navigate('/login');
    };

    // Stats
    const totalUsers = users.length;
    const totalCampaigns = campaigns.length;
    const activeToday = users.filter(u => {
        const lastActive = new Date(u.lastActive);
        const today = new Date();
        return lastActive.toDateString() === today.toDateString();
    }).length;

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => navigate('/login')}
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900">Admin Dashboard</h1>
                            <p className="text-xs text-slate-500">Manage users and campaigns</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchData}
                            disabled={loading}
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors disabled:opacity-50"
                        >
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button
                            onClick={handleLogout}
                            className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-500 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
                        >
                            <LogOut size={16} /> Logout
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 py-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Users</span>
                            <Users size={18} className="text-indigo-500" />
                        </div>
                        <div className="text-3xl font-extrabold text-slate-900">{totalUsers}</div>
                        <p className="text-xs text-slate-500 mt-1">{activeToday} active today</p>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Campaigns</span>
                            <Activity size={18} className="text-green-500" />
                        </div>
                        <div className="text-3xl font-extrabold text-slate-900">{totalCampaigns}</div>
                        <p className="text-xs text-slate-500 mt-1">All time created</p>
                    </div>

                    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Avg Campaigns/User</span>
                            <Target size={18} className="text-amber-500" />
                        </div>
                        <div className="text-3xl font-extrabold text-slate-900">
                            {totalUsers > 0 ? (totalCampaigns / totalUsers).toFixed(1) : '0'}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Per connected user</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-4">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'users'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}
                    >
                        <Users size={14} className="inline mr-2" />
                        Users ({totalUsers})
                    </button>
                    <button
                        onClick={() => setActiveTab('campaigns')}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeTab === 'campaigns'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                            }`}
                    >
                        <Activity size={14} className="inline mr-2" />
                        Campaigns ({totalCampaigns})
                    </button>
                </div>

                {/* Error State */}
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                        {error}
                    </div>
                )}

                {/* Loading State */}
                {loading && (
                    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                        <Loader2 className="animate-spin text-indigo-600 w-8 h-8 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">Loading data...</p>
                    </div>
                )}

                {/* Users Tab */}
                {!loading && activeTab === 'users' && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        {users.length === 0 ? (
                            <div className="p-12 text-center">
                                <Users className="text-slate-300 w-12 h-12 mx-auto mb-3" />
                                <p className="text-slate-500">No users connected yet</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {users.map(user => (
                                    <div key={user.fbId} className="p-4 hover:bg-slate-50 transition-colors">
                                        <div
                                            className="flex items-center gap-4 cursor-pointer"
                                            onClick={() => setExpandedUser(expandedUser === user.fbId ? null : user.fbId)}
                                        >
                                            {/* Profile Picture */}
                                            <div className="w-12 h-12 rounded-full bg-slate-200 overflow-hidden flex-shrink-0">
                                                {user.profilePicture ? (
                                                    <img
                                                        src={user.profilePicture}
                                                        alt={user.fbName}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => {
                                                            (e.target as HTMLImageElement).style.display = 'none';
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold text-lg">
                                                        {user.fbName.charAt(0).toUpperCase()}
                                                    </div>
                                                )}
                                            </div>

                                            {/* User Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-bold text-slate-800 truncate">{user.fbName}</h3>
                                                    <span className="text-xs bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-medium">
                                                        {user.campaignCount || 0} campaigns
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    <Clock size={10} className="inline mr-1" />
                                                    Last active: {formatRelativeTime(user.lastActive)}
                                                </p>
                                            </div>

                                            {/* Expand Icon */}
                                            <div className="text-slate-400">
                                                {expandedUser === user.fbId ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                            </div>
                                        </div>

                                        {/* Expanded Details */}
                                        {expandedUser === user.fbId && (
                                            <div className="mt-4 pl-16 space-y-2 text-sm">
                                                <div className="flex items-center gap-2 text-slate-600">
                                                    <Briefcase size={14} className="text-slate-400" />
                                                    <span className="font-medium">Ad Account:</span>
                                                    <span>{user.adAccountName || user.adAccountId || 'N/A'}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-slate-600">
                                                    <Calendar size={14} className="text-slate-400" />
                                                    <span className="font-medium">Connected:</span>
                                                    <span>{formatDate(user.connectedAt)}</span>
                                                </div>
                                                {user.tokenExpiresAt && (
                                                    <div className="flex items-center gap-2 text-slate-600">
                                                        <Clock size={14} className="text-slate-400" />
                                                        <span className="font-medium">Token Expires:</span>
                                                        <span>{formatDate(user.tokenExpiresAt)}</span>
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2 text-slate-400 text-xs font-mono">
                                                    FB ID: {user.fbId}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Campaigns Tab */}
                {!loading && activeTab === 'campaigns' && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        {campaigns.length === 0 ? (
                            <div className="p-12 text-center">
                                <Activity className="text-slate-300 w-12 h-12 mx-auto mb-3" />
                                <p className="text-slate-500">No campaigns created yet</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                                        <tr>
                                            <th className="p-4 text-left font-semibold">User</th>
                                            <th className="p-4 text-left font-semibold">Campaign</th>
                                            <th className="p-4 text-left font-semibold">Objective</th>
                                            <th className="p-4 text-center font-semibold">Media</th>
                                            <th className="p-4 text-right font-semibold">Created</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {campaigns.map(campaign => (
                                            <tr key={campaign.id} className="hover:bg-slate-50">
                                                <td className="p-4">
                                                    <span className="font-medium text-slate-800">{campaign.fbUserName}</span>
                                                </td>
                                                <td className="p-4">
                                                    <span className="text-slate-700">{campaign.campaignName}</span>
                                                </td>
                                                <td className="p-4">
                                                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-medium">
                                                        {campaign.objective.replace('OUTCOME_', '')}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-center">
                                                    {campaign.mediaType === 'VIDEO' ? (
                                                        <Video size={16} className="inline text-purple-500" />
                                                    ) : (
                                                        <Image size={16} className="inline text-blue-500" />
                                                    )}
                                                </td>
                                                <td className="p-4 text-right text-slate-500">
                                                    {formatRelativeTime(campaign.createdAt)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminPage;
