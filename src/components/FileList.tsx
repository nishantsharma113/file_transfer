import React, { useEffect, useState, useRef } from 'react';
import { supabase, STORAGE_BUCKET } from '../config/supabase';
import { format } from 'date-fns';
import DeleteDialog from './DeleteDialog';
import { 
  FolderPlusIcon, 
  PhotoIcon, 
  DocumentIcon, 
  PresentationChartBarIcon, 
  DocumentTextIcon,
  TrashIcon,
  ShareIcon,
  ArrowDownTrayIcon,
  EllipsisVerticalIcon,
  MagnifyingGlassIcon,
  BellIcon,
  ChartBarIcon,
  CheckCircleIcon,
  EllipsisHorizontalIcon,
  ArrowUpTrayIcon,
  VideoCameraIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardDocumentIcon
} from '@heroicons/react/24/outline';

interface FileData {
  id: string;
  name: string;
  path: string;
  created_at: string;
  updated_at: string;
  type: string;
  size: number;
  recipient_email: string;
  shared_with: string[];
  created_by: {
    email: string;
    avatar_url?: string;
  };
  download_count: number;
  expiry_date: string | null;
  message: string;
}

interface QuickAccessCard {
  title: string;
  count: number;
  size: string;
  icon: React.ReactNode;
  bgColor: string;
}

const FileList: React.FC = () => {
  const [files, setFiles] = useState<FileData[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [quickAccess, setQuickAccess] = useState<{
    documents: number;
    presentations: number;
    pdfs: number;
    images: number;
    totalSize: number;
  }>({
    documents: 0,
    presentations: 0,
    pdfs: 0,
    images: 0,
    totalSize: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<FileData | null>(null);
  const [expandedFile, setExpandedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  // Clear delete success message after 3 seconds
  useEffect(() => {
    if (deleteSuccess) {
      const timer = setTimeout(() => {
        setDeleteSuccess(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [deleteSuccess]);

  // Add click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchFiles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get files metadata from the database, ordered by created_at
      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get file sizes from storage for each file
      const filesWithMetadata = await Promise.all(data.map(async (file) => {
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
          size: size,
          shared_with: [], // You would populate this from your actual data
          created_by: {
            email: user.email || '',
            avatar_url: user.user_metadata?.avatar_url
          }
        };
      }));

      setFiles(filesWithMetadata);

      // Calculate quick access stats
      const stats = filesWithMetadata.reduce((acc, file) => {
        const size = file.size || 0;
        if (file.name.match(/\.(doc|docx)$/i)) {
          acc.documents++;
        } else if (file.name.match(/\.(ppt|pptx)$/i)) {
          acc.presentations++;
        } else if (file.name.match(/\.pdf$/i)) {
          acc.pdfs++;
        } else if (file.name.match(/\.(jpg|jpeg|png|gif)$/i)) {
          acc.images++;
        }
        acc.totalSize += size;
        return acc;
      }, {
        documents: 0,
        presentations: 0,
        pdfs: 0,
        images: 0,
        totalSize: 0,
      });

      setQuickAccess(stats);
    } catch (error) {
      console.error('Error fetching files:', error);
      setError('Failed to fetch files');
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const formatDate = (date: string): string => {
    const now = new Date();
    const uploadDate = new Date(date);
    const diffInHours = Math.abs(now.getTime() - uploadDate.getTime()) / 36e5;
    
    if (diffInHours < 24) {
      // If less than 24 hours ago, show relative time
      if (diffInHours < 1) {
        const minutes = Math.floor(diffInHours * 60);
        return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
      }
      return `${Math.floor(diffInHours)} hour${diffInHours !== 1 ? 's' : ''} ago`;
    } else if (diffInHours < 48) {
      return 'Yesterday';
    } else {
      // Otherwise show the date
      return new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
  };

  const quickAccessCards: QuickAccessCard[] = [
    {
      title: 'Documents',
      count: quickAccess.documents,
      size: formatSize(quickAccess.totalSize),
      icon: <DocumentIcon className="w-12 h-12" />,
      bgColor: 'bg-blue-50'
    },
    {
      title: 'Presentations',
      count: quickAccess.presentations,
      size: formatSize(quickAccess.totalSize),
      icon: <PresentationChartBarIcon className="w-12 h-12" />,
      bgColor: 'bg-orange-50'
    },
    {
      title: 'PDFs',
      count: quickAccess.pdfs,
      size: formatSize(quickAccess.totalSize),
      icon: <DocumentTextIcon className="w-12 h-12" />,
      bgColor: 'bg-red-50'
    },
    {
      title: 'Images',
      count: quickAccess.images,
      size: formatSize(quickAccess.totalSize),
      icon: <PhotoIcon className="w-12 h-12" />,
      bgColor: 'bg-purple-50'
    }
  ];

  const handleDelete = async (file: FileData) => {
    try {
      setDeleting(file.id);
      setError(null);

      // Delete file from storage if it exists
      if (file.path) {
        const { error: storageError } = await supabase.storage
          .from(STORAGE_BUCKET)
          .remove([file.path]);

        if (storageError) {
          throw storageError;
        }
      }

      // Delete record from database
      const { error: dbError } = await supabase
        .from('files')
        .delete()
        .eq('id', file.id);

      if (dbError) {
        throw dbError;
      }

      // Update local state
      setFiles(prev => prev.filter(f => f.id !== file.id));
      setDeleteSuccess(`"${file.name}" has been deleted`);
    } catch (err) {
      console.error('Delete error:', err);
      setError(err instanceof Error ? err.message : 'Error deleting file');
    } finally {
      setDeleting(null);
    }
  };

  const generateShareableLink = async (fileId: string, path: string | null) => {
    if (!path) return;
    
    try {
      setDeleting(fileId);
      
      // First, check if the file exists in storage
      const { data: checkData, error: checkError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(path.split('/')[0], {
          limit: 1,
          offset: 0,
          search: path.split('/')[1]
        });

      if (checkError) throw checkError;
      
      if (!checkData || checkData.length === 0) {
        throw new Error('File not found in storage');
      }

      // Generate signed URL
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(path, 3600); // 1 hour expiry

      if (error) throw error;

      if (!data?.signedUrl) {
        throw new Error('Failed to generate signed URL');
      }

      // Copy link to clipboard
      await navigator.clipboard.writeText(data.signedUrl);
      setDeleteSuccess('Link copied to clipboard! The link will expire in 1 hour.');

      // Update download count
      const { error: updateError } = await supabase
        .from('files')
        .update({ download_count: (files.find(f => f.id === fileId)?.download_count ?? 0) + 1 })
        .eq('id', fileId);

      if (updateError) {
        console.error('Error updating download count:', updateError);
      } else {
        // Refresh the file list to show updated download count
        fetchFiles();
      }
    } catch (err) {
      console.error('Error generating link:', err);
      setError(err instanceof Error ? err.message : 'Error generating shareable link');
    } finally {
      setDeleting(null);
    }
  };

  const downloadFile = async (file: FileData) => {
    try {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(file.path ?? '');

      if (error) throw error;

      // Create a download link
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Update download count
      const { error: updateError } = await supabase
        .from('files')
        .update({ download_count: file.download_count + 1 })
        .eq('id', file.id);

      if (updateError) {
        console.error('Error updating download count:', updateError);
      } else {
        fetchFiles();
      }
    } catch (err) {
      console.error('Error downloading file:', err);
      alert('Error downloading file. Please try again.');
    }
  };

  const copyMessage = async (file: FileData) => {
    try {
      await navigator.clipboard.writeText(file.message);
      setDeleteSuccess('Message copied to clipboard!');
      toggleDropdown(file.id);
    } catch (err) {
      console.error('Error copying message:', err);
      setError('Failed to copy message. Please try again.');
    }
  };

  const toggleDropdown = (fileId: string) => {
    setActiveDropdown(activeDropdown === fileId ? null : fileId);
  };

  const handleDeleteClick = (file: FileData) => {
    setFileToDelete(file);
    toggleDropdown(file.id);
  };

  const handleDeleteCancel = () => {
    setFileToDelete(null);
  };

  const handleDeleteConfirm = async () => {
    if (fileToDelete) {
      await handleDelete(fileToDelete);
      setFileToDelete(null);
    }
  };

  const toggleFileExpand = async (fileId: string, filePath: string | null) => {
    if (expandedFile === fileId) {
      setExpandedFile(null);
      setFileContent(null);
      return;
    }

    setExpandedFile(fileId);
    if (filePath) {
      setLoadingContent(true);
      try {
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .download(filePath);

        if (error) throw error;

        // For text files, show content
        if (data.type.startsWith('text/')) {
          const text = await data.text();
          setFileContent(text);
        } else if (data.type.startsWith('image/')) {
          const url = URL.createObjectURL(data);
          setFileContent(url);
        } else {
          setFileContent('Preview not available for this file type');
        }
      } catch (err) {
        console.error('Error loading file content:', err);
        setFileContent('Error loading file content');
      } finally {
        setLoadingContent(false);
      }
    }
  };

  if (loading) {
    return <div className="text-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold mb-6">Overview</h2>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Storage</h3>
            <div className="text-3xl font-bold mb-1">{formatSize(quickAccess.totalSize)}</div>
            <p className="text-sm text-gray-500">of 250GB used</p>
            <button className="mt-4 text-sm text-blue-600 hover:text-blue-800">Upgrade plan →</button>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Files</h3>
            <div className="text-3xl font-bold mb-1">{files.length}</div>
            <button className="mt-4 text-sm text-blue-600 hover:text-blue-800">Manage files →</button>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Views</h3>
            <div className="text-3xl font-bold mb-1">400</div>
            <button className="mt-4 text-sm text-blue-600 hover:text-blue-800">View stats →</button>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Downloads</h3>
            <div className="text-3xl font-bold mb-1">320</div>
            <button className="mt-4 text-sm text-blue-600 hover:text-blue-800">View stats →</button>
          </div>
        </div>

        {/* Recent Shares Table */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold">Recent shares</h3>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Name</span>
                <button>
                  <EllipsisHorizontalIcon className="h-5 w-5 text-gray-400" />
                </button>
              </div>
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-gray-500">
                <th className="px-6 py-3 font-medium"></th>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Message</th>
                <th className="px-6 py-3 font-medium">Size</th>
                <th className="px-6 py-3 font-medium">Members</th>
                <th className="px-6 py-3 font-medium">Uploaded</th>
                <th className="px-6 py-3 font-medium">Views</th>
                <th className="px-6 py-3 font-medium">Downloads</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <React.Fragment key={file.id}>
                  <tr className={`border-t border-gray-100 hover:bg-gray-50 ${expandedFile === file.id ? 'bg-gray-50' : ''}`}>
                    <td className="px-6 py-4">
                      <button 
                        onClick={() => toggleFileExpand(file.id, file.path)}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        {expandedFile === file.id ? (
                          <ChevronUpIcon className="h-5 w-5" />
                        ) : (
                          <ChevronDownIcon className="h-5 w-5" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        {getFileIcon(file.name)}
                        <span className="ml-2 text-sm font-medium">{file.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500 truncate max-w-xs">
                        {file.message}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatSize(file.size || 0)}</td>
                    <td className="px-6 py-4">
                      <div className="flex -space-x-2">
                        {file.shared_with.map((user, index) => (
                          <div key={index} className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white" />
                        ))}
                        {file.shared_with.length > 0 && (
                          <div className="w-6 h-6 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-xs text-gray-500">
                            +{file.shared_with.length}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{formatDate(file.created_at)}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{file.download_count || 0}</td>
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
                              onClick={() => {
                                downloadFile(file);
                                toggleDropdown(file.id);
                              }}
                              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                              Download
                            </button>
                            
                            <button
                              onClick={() => {
                                generateShareableLink(file.id, file.path);
                                toggleDropdown(file.id);
                              }}
                              className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            >
                              <ShareIcon className="w-4 h-4 mr-2" />
                              Share Link
                            </button>

                            {file.message?.trim() && (
                              <button
                                onClick={() => copyMessage(file)}
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                              >
                                <ClipboardDocumentIcon className="w-4 h-4 mr-2" />
                                Copy Message
                              </button>
                            )}
                            
                            <button
                              onClick={() => {
                                handleDeleteClick(file);
                                toggleDropdown(file.id);
                              }}
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
                  {expandedFile === file.id && (
                    <tr className="border-t border-gray-100 bg-gray-50">
                      <td colSpan={9} className="px-6 py-4">
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-medium text-gray-900">Message</h4>
                            <p className="mt-1 text-sm text-gray-500">{file.message}</p>
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-gray-900">File Preview</h4>
                            <div className="mt-2">
                              {loadingContent ? (
                                <div className="text-sm text-gray-500">Loading preview...</div>
                              ) : fileContent ? (
                                file.name.match(/\.(jpg|jpeg|png|gif)$/i) ? (
                                  <img src={fileContent} alt={file.name} className="max-w-lg rounded" />
                                ) : (
                                  <pre className="text-sm text-gray-600 bg-gray-100 p-4 rounded overflow-auto max-h-96">
                                    {fileContent}
                                  </pre>
                                )
                              ) : (
                                <div className="text-sm text-gray-500">No preview available</div>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <DeleteDialog
        isOpen={fileToDelete !== null}
        fileName={fileToDelete?.name || ''}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        isDeleting={deleting === fileToDelete?.id}
      />

      {error && (
        <div className="fixed bottom-4 right-4 bg-red-50 text-red-500 px-4 py-2 rounded-lg shadow">
          {error}
        </div>
      )}
      {deleteSuccess && (
        <div className="fixed bottom-4 right-4 bg-green-50 text-green-500 px-4 py-2 rounded-lg shadow">
          {deleteSuccess}
        </div>
      )}
    </div>
  );
};

// Helper function to get the appropriate icon based on file type
const getFileIcon = (fileName: string) => {
  if (fileName.match(/\.(jpg|jpeg|png|gif)$/i)) {
    return <PhotoIcon className="h-5 w-5 text-purple-500" />;
  } else if (fileName.match(/\.(mp4|mov|avi)$/i)) {
    return <VideoCameraIcon className="h-5 w-5 text-blue-500" />;
  } else {
    return <DocumentIcon className="h-5 w-5 text-gray-500" />;
  }
};

export default FileList; 