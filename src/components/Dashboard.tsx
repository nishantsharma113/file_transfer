import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase, STORAGE_BUCKET } from '../config/supabase';
import { 
  ArrowUpRightIcon, 
  EllipsisHorizontalIcon,
  DocumentIcon,
  VideoCameraIcon,
  PhotoIcon,
  ChevronDownIcon,
  ArrowsUpDownIcon,
  EyeIcon,
  TrashIcon,
  ShareIcon,
  ClipboardDocumentIcon,
  XMarkIcon,
  DocumentTextIcon,
  DocumentMagnifyingGlassIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';
import DeleteDialog from './DeleteDialog';

interface FileData {
  id: string;
  name: string;
  size: number;
  path: string;
  created_at: string;
  shared_with: string[];
  view_count: number;
  download_count: number;
  message?: string;
}

interface DashboardStats {
  storageUsed: number;
  totalFiles: number;
  totalViews: number;
  totalDownloads: number;
}

type SortField = 'created_at' | 'name' | 'size' | 'view_count' | 'download_count';
type SortOrder = 'asc' | 'desc';

interface PreviewFile extends FileData {
  content?: string;
  previewUrl?: string;
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    storageUsed: 0,
    totalFiles: 0,
    totalViews: 0,
    totalDownloads: 0
  });
  const [files, setFiles] = useState<FileData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<FileData | null>(null);
  const [selectedFile, setSelectedFile] = useState<PreviewFile | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Sort files whenever sort criteria changes
  useEffect(() => {
    const sortedFiles = [...files].sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case 'view_count':
          comparison = (a.view_count || 0) - (b.view_count || 0);
          break;
        case 'download_count':
          comparison = (a.download_count || 0) - (b.download_count || 0);
          break;
        case 'created_at':
        default:
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    setFiles(sortedFiles);
  }, [sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      // Toggle order if clicking the same field
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field and default to descending
      setSortField(field);
      setSortOrder('desc');
    }
    setShowSortMenu(false);
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (date: string): string => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getPreviewIcon = (fileName: string) => {
    if (fileName.match(/\.(jpg|jpeg|png|gif)$/i)) {
      return <PhotoIcon className="w-4 h-4 mr-2 text-purple-500" />;
    } else if (fileName.match(/\.(mp4|mov|avi)$/i)) {
      return <VideoCameraIcon className="w-4 h-4 mr-2 text-blue-500" />;
    } else if (fileName.match(/\.(txt|md|js|jsx|ts|tsx|html|css|json)$/i)) {
      return <DocumentTextIcon className="w-4 h-4 mr-2 text-amber-500" />;
    } else {
      return <DocumentMagnifyingGlassIcon className="w-4 h-4 mr-2 text-gray-500" />;
    }
  };

  const getFileIcon = (fileName: string) => {
    if (fileName.match(/\.(jpg|jpeg|png|gif)$/i)) {
      return <PhotoIcon className="h-5 w-5 text-purple-500" />;
    } else if (fileName.match(/\.(mp4|mov|avi)$/i)) {
      return <VideoCameraIcon className="h-5 w-5 text-blue-500" />;
    } else {
      return <DocumentIcon className="h-5 w-5 text-gray-500" />;
    }
  };

  const fetchDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get files with their metadata
      const { data: filesData, error: filesError } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(6);

      if (filesError) throw filesError;

      // Get storage size for each file
      const filesWithMetadata = await Promise.all((filesData || []).map(async (file) => {
        let size = 0;
        if (file.path) {
          const { data: fileData } = await supabase.storage
            .from(STORAGE_BUCKET)
            .list(file.path.split('/')[0], {
              limit: 1,
              offset: 0,
              search: file.path.split('/')[1]
            });

          if (fileData && fileData[0]) {
            size = fileData[0].metadata.size;
          }
        }

        return {
          ...file,
          size,
          shared_with: file.shared_with || []
        };
      }));

      setFiles(filesWithMetadata);

      // Calculate total stats
      const totalStats = filesWithMetadata.reduce((acc, file) => ({
        storageUsed: acc.storageUsed + (file.size || 0),
        totalFiles: acc.totalFiles + 1,
        totalViews: acc.totalViews + (file.view_count || 0),
        totalDownloads: acc.totalDownloads + (file.download_count || 0)
      }), {
        storageUsed: 0,
        totalFiles: 0,
        totalViews: 0,
        totalDownloads: 0
      });

      setStats(totalStats);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDropdown = (fileId: string | null) => {
    setActiveDropdown(activeDropdown === fileId ? null : fileId);
  };

  const handleDeleteClick = (file: FileData) => {
    setFileToDelete(file);
    toggleDropdown(null);
  };

  // Clear notifications after 3 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError(null);
        setSuccess(null);
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [error, success]);

  const handleDelete = async () => {
    if (!fileToDelete) return;

    setIsDeleting(true);
    try {
      // Delete file from storage
      if (fileToDelete.path) {
        const { error: storageError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([fileToDelete.path]);

        if (storageError) throw storageError;
      }

      // Delete record from database
      const { error: dbError } = await supabase
        .from('files')
        .delete()
        .eq('id', fileToDelete.id);

      if (dbError) throw dbError;

      setSuccess('File deleted successfully');
      setFiles(files.filter(f => f.id !== fileToDelete.id));
      setFileToDelete(null);
      
      // Refresh dashboard data after deletion
      fetchDashboardData();
    } catch (err) {
      setError('Failed to delete file');
      console.error('Delete error:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handlePreview = async (file: FileData) => {
    try {
      if (!file.path) {
        setError('No file to preview');
        return;
      }

      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(file.path);

      if (error) throw error;

      const previewFile: PreviewFile = { ...file };

      if (file.name.match(/\.(jpg|jpeg|png|gif)$/i)) {
        previewFile.previewUrl = URL.createObjectURL(data);
      } else if (file.name.match(/\.(txt|md|js|jsx|ts|tsx|html|css|json)$/i)) {
        previewFile.content = await data.text();
      }

      setSelectedFile(previewFile);
      setShowPreview(true);
      toggleDropdown(null);

      // Update view count
      const { error: updateError } = await supabase
        .from('files')
        .update({ view_count: (file.view_count || 0) + 1 })
        .eq('id', file.id);

      if (updateError) console.error('Error updating view count:', updateError);
    } catch (err) {
      setError('Failed to load file preview');
      console.error('Preview error:', err);
    }
  };

  const handleCopyMessage = async (file: FileData) => {
    try {
      await navigator.clipboard.writeText(file.message || '');
      setSuccess('Message copied to clipboard');
      toggleDropdown(null);
    } catch (err) {
      setError('Failed to copy message');
      console.error('Copy error:', err);
    }
  };

  const handleShareLink = async (file: FileData) => {
    try {
      if (!file.path) {
        setError('No file to share');
        return;
      }

      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(file.path, 3600); // 1 hour expiry

      if (error) throw error;

      await navigator.clipboard.writeText(data.signedUrl);
      setSuccess('Share link copied to clipboard');
      toggleDropdown(null);

      // Update download count
      const { error: updateError } = await supabase
        .from('files')
        .update({ download_count: (file.download_count || 0) + 1 })
        .eq('id', file.id);

      if (updateError) console.error('Error updating download count:', updateError);
    } catch (err) {
      setError('Failed to generate share link');
      console.error('Share error:', err);
    }
  };

  const handleDownload = async (file: FileData) => {
    try {
      if (!file.path) {
        setError('No file to download');
        return;
      }

      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(file.path);

      if (error) throw error;

      // Create a download link
      const url = window.URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      // Update download count
      const { error: updateError } = await supabase
        .from('files')
        .update({ download_count: (file.download_count || 0) + 1 })
        .eq('id', file.id);

      if (updateError) console.error('Error updating download count:', updateError);

      setSuccess('File downloaded successfully');
      toggleDropdown(null);

      // Refresh dashboard data to update stats
      fetchDashboardData();
    } catch (err) {
      setError('Failed to download file');
      console.error('Download error:', err);
    }
  };

  // Handle clicks outside of dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close action dropdown if clicking outside
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
      
      // Close sort menu if clicking outside
      if (sortMenuRef.current && !sortMenuRef.current.contains(event.target as Node)) {
        setShowSortMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) {
    return <div className="text-center">Loading...</div>;
  }

  // Add click outside handler for the preview modal
  const handlePreviewClose = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if clicking the backdrop (not the content)
    if (e.target === e.currentTarget) {
      setShowPreview(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">Overview</h2>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Storage</h3>
            <div className="text-3xl font-bold mb-1">{formatSize(stats.storageUsed)}</div>
            <p className="text-sm text-gray-500">of 250GB used</p>
            <button className="mt-4 text-sm text-blue-600 hover:text-blue-800 flex items-center">
              Upgrade plan <ArrowUpRightIcon className="h-4 w-4 ml-1" />
            </button>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Files</h3>
            <div className="text-3xl font-bold mb-1">{stats.totalFiles}</div>
            <button className="mt-4 text-sm text-blue-600 hover:text-blue-800 flex items-center">
              Manage files <ArrowUpRightIcon className="h-4 w-4 ml-1" />
            </button>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Views</h3>
            <div className="text-3xl font-bold mb-1">{stats.totalViews}</div>
            <button className="mt-4 text-sm text-blue-600 hover:text-blue-800 flex items-center">
              View stats <ArrowUpRightIcon className="h-4 w-4 ml-1" />
            </button>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Downloads</h3>
            <div className="text-3xl font-bold mb-1">{stats.totalDownloads}</div>
            <button className="mt-4 text-sm text-blue-600 hover:text-blue-800 flex items-center">
              View stats <ArrowUpRightIcon className="h-4 w-4 ml-1" />
            </button>
          </div>
        </div>

        {/* Recent Shares Table */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Recent shares</h3>
              <div className="flex items-center space-x-4">
                <div className="relative">
                  <button
                    onClick={() => setShowSortMenu(!showSortMenu)}
                    className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-900"
                  >
                    <ArrowsUpDownIcon className="h-4 w-4" />
                    <span>Sort by: {sortField.replace('_', ' ')}</span>
                    <ChevronDownIcon className="h-4 w-4" />
                  </button>

                  {showSortMenu && (
                    <div 
                      ref={sortMenuRef}
                      className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10"
                    >
                      <div className="py-1" role="menu">
                        <button
                          onClick={() => handleSort('created_at')}
                          className={`flex items-center w-full px-4 py-2 text-sm ${
                            sortField === 'created_at' ? 'text-blue-600' : 'text-gray-700'
                          } hover:bg-gray-100`}
                        >
                          Date {sortField === 'created_at' && (sortOrder === 'asc' ? '(Oldest)' : '(Newest)')}
                        </button>
                        <button
                          onClick={() => handleSort('name')}
                          className={`flex items-center w-full px-4 py-2 text-sm ${
                            sortField === 'name' ? 'text-blue-600' : 'text-gray-700'
                          } hover:bg-gray-100`}
                        >
                          Name {sortField === 'name' && (sortOrder === 'asc' ? '(A-Z)' : '(Z-A)')}
                        </button>
                        <button
                          onClick={() => handleSort('size')}
                          className={`flex items-center w-full px-4 py-2 text-sm ${
                            sortField === 'size' ? 'text-blue-600' : 'text-gray-700'
                          } hover:bg-gray-100`}
                        >
                          Size {sortField === 'size' && (sortOrder === 'asc' ? '(Smallest)' : '(Largest)')}
                        </button>
                        <button
                          onClick={() => handleSort('view_count')}
                          className={`flex items-center w-full px-4 py-2 text-sm ${
                            sortField === 'view_count' ? 'text-blue-600' : 'text-gray-700'
                          } hover:bg-gray-100`}
                        >
                          Views {sortField === 'view_count' && (sortOrder === 'asc' ? '(Lowest)' : '(Highest)')}
                        </button>
                        <button
                          onClick={() => handleSort('download_count')}
                          className={`flex items-center w-full px-4 py-2 text-sm ${
                            sortField === 'download_count' ? 'text-blue-600' : 'text-gray-700'
                          } hover:bg-gray-100`}
                        >
                          Downloads {sortField === 'download_count' && (sortOrder === 'asc' ? '(Lowest)' : '(Highest)')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Size</th>
                <th className="px-6 py-3 font-medium">Uploaded</th>
                <th className="px-6 py-3 font-medium">Views</th>
                <th className="px-6 py-3 font-medium">Downloads</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      {getFileIcon(file.name)}
                      <span className="ml-2 text-sm font-medium">{file.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatSize(file.size)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(file.created_at)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{file.view_count || 0}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{file.download_count || 0}</td>
                  <td className="px-6 py-4 text-right relative">
                    <button 
                      onClick={() => toggleDropdown(file.id)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <EllipsisHorizontalIcon className="h-5 w-5" />
                    </button>
                    
                    {activeDropdown === file.id && (
                      <div 
                        ref={dropdownRef}
                        className="absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10"
                      >
                        <div className="py-1" role="menu">
                          <button
                            onClick={() => handlePreview(file)}
                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          >
                            {getPreviewIcon(file.name)}
                            Preview
                          </button>

                          {file.message && (
                            <button
                              onClick={() => handleCopyMessage(file)}
                              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <ClipboardDocumentIcon className="w-4 h-4 mr-2" />
                              Copy Message
                            </button>
                          )}

                          {file.path && (
                            <button
                              onClick={() => handleDownload(file)}
                              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                              Download
                            </button>
                          )}

                          <button
                            onClick={() => handleShareLink(file)}
                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          >
                            <ShareIcon className="w-4 h-4 mr-2" />
                            Share Link
                          </button>

                          <button
                            onClick={() => handleDeleteClick(file)}
                            className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-gray-100"
                          >
                            <TrashIcon className="w-4 h-4 mr-2" />
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* File Preview Modal */}
      {showPreview && selectedFile && (
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50"
          onClick={handlePreviewClose}
        >
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold">{selectedFile.name}</h3>
              <button 
                onClick={() => setShowPreview(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 overflow-auto max-h-[calc(90vh-8rem)]">
              {selectedFile.previewUrl ? (
                <img 
                  src={selectedFile.previewUrl} 
                  alt={selectedFile.name}
                  className="max-w-full rounded"
                />
              ) : selectedFile.content ? (
                <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-4 rounded">
                  {selectedFile.content}
                </pre>
              ) : (
                <div className="text-center text-gray-500">
                  Preview not available for this file type
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteDialog
        isOpen={fileToDelete !== null}
        fileName={fileToDelete?.name || ''}
        onClose={() => {
          setFileToDelete(null);
          setIsDeleting(false);
        }}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />

      {/* Notifications */}
      {(error || success) && (
        <div 
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-lg shadow-lg transition-opacity duration-300 ${
            error ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'
          }`}
        >
          <div className="flex items-center">
            <span>{error || success}</span>
            <button
              onClick={() => {
                setError(null);
                setSuccess(null);
              }}
              className="ml-3 text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard; 