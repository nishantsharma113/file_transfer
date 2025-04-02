import { useEffect, useState } from 'react';
import { supabase, STORAGE_BUCKET } from '../config/supabase';
import { format } from 'date-fns';

interface FileRecord {
  id: string;
  name: string;
  path: string | null;
  recipient_email: string;
  expiry_date: string | null;
  created_at: string;
  download_count: number;
  message: string;
}

const FileList = () => {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);

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

  const fetchFiles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('files')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setFiles(data || []);
    } catch (err) {
      setError('Error fetching files');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (file: FileRecord) => {
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

  const downloadFile = async (file: FileRecord) => {
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

  const copyMessage = async (fileId: string, message: string) => {
    try {
      await navigator.clipboard.writeText(message);
    } catch (err) {
      console.error('Error copying message:', err);
      alert('Failed to copy message. Please try again.');
    }
  };

  if (loading) {
    return <div className="text-center">Loading...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-6">Your Files</h2>

      {error && (
        <div className="mb-4 text-red-500 text-sm bg-red-50 p-3 rounded">
          {error}
        </div>
      )}

      {deleteSuccess && (
        <div className="mb-4 text-green-500 text-sm bg-green-50 p-3 rounded">
          {deleteSuccess}
        </div>
      )}

      {files.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          No files uploaded yet. Go to the Upload page to share your first file.
        </div>
      ) : (
        <div className="space-y-4">
          {files.map((file) => (
            <div key={file.id} className="bg-white shadow rounded-lg overflow-hidden">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-medium text-gray-900">{file.name}</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      Sent to: {file.recipient_email}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    {file.path && (
                      <>
                        <button
                          onClick={() => downloadFile(file)}
                          disabled={deleting === file.id}
                          className="text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Download
                        </button>
                        <button
                          onClick={() => file.path && generateShareableLink(file.id, file.path)}
                          disabled={deleting === file.id}
                          className="text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deleting === file.id ? 'Generating...' : 'Share Link'}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => {
                        if (window.confirm(`Are you sure you want to delete this ${file.path ? 'file' : 'message'}? This action cannot be undone.`)) {
                          handleDelete(file);
                        }
                      }}
                      disabled={deleting === file.id}
                      className="text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deleting === file.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
                
                <div className="mt-4 text-sm text-gray-600">
                  <div className="bg-gray-50 rounded p-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-medium">Message:</p>
                      <button
                        onClick={() => copyMessage(file.id, file.message)}
                        className="text-sm px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded transition-colors"
                      >
                        Copy Message
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap">{file.message}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-4 text-sm text-gray-500">
                  <div>
                    <span className="font-medium">Type:</span>{' '}
                    {file.path ? 'File + Message' : 'Message Only'}
                  </div>
                  <div>
                    <span className="font-medium">Uploaded:</span>{' '}
                    {format(new Date(file.created_at), 'MMM d, yyyy')}
                  </div>
                  <div>
                    <span className="font-medium">Expires:</span>{' '}
                    {file.expiry_date ? format(new Date(file.expiry_date), 'MMM d, yyyy') : 'Never'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileList; 