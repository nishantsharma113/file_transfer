import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../config/supabase';

interface DashboardStats {
  totalFiles: number;
  activeTransfers: number;
  totalDownloads: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalFiles: 0,
    activeTransfers: 0,
    totalDownloads: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      // Get total files
      const { count: totalFiles } = await supabase
        .from('files')
        .select('*', { count: 'exact' });

      // Get active transfers (not expired)
      const { count: activeTransfers } = await supabase
        .from('files')
        .select('*', { count: 'exact' })
        .gte('expiry_date', new Date().toISOString());

      // Get total downloads
      const { data: downloads } = await supabase
        .from('files')
        .select('download_count');

      const totalDownloads = downloads?.reduce((acc, curr) => acc + (curr.download_count || 0), 0) || 0;

      setStats({
        totalFiles: totalFiles || 0,
        activeTransfers: activeTransfers || 0,
        totalDownloads,
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center">Loading...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900">Welcome to FileTransfer</h1>
        <p className="mt-3 max-w-2xl mx-auto text-xl text-gray-500 sm:mt-4">
          Securely transfer files and track their status
        </p>
      </div>

      <div className="mt-10">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">Total Files</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats.totalFiles}</dd>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">Active Transfers</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats.activeTransfers}</dd>
            </div>
          </div>
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="px-4 py-5 sm:p-6">
              <dt className="text-sm font-medium text-gray-500 truncate">Total Downloads</dt>
              <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats.totalDownloads}</dd>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Link
            to="/upload"
            className="relative block w-full border-2 border-gray-300 border-dashed rounded-lg p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <span className="mt-2 block text-sm font-medium text-gray-900">Upload New File</span>
          </Link>
          <Link
            to="/files"
            className="relative block w-full border-2 border-gray-300 border-dashed rounded-lg p-12 text-center hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <span className="mt-2 block text-sm font-medium text-gray-900">View My Files</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 