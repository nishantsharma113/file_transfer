import React, { useState, useCallback } from 'react';
import { supabase, STORAGE_BUCKET } from '../config/supabase';

interface FileUploadState {
  file: File | null;
  recipientEmail: string;
  expiryDays: number;
  uploading: boolean;
  error: string | null;
  success: boolean;
  fileContent: string | null;
  message: string;
  preview: string | null;
}

const FileUpload = () => {
  const [state, setState] = useState<FileUploadState>({
    file: null,
    recipientEmail: '',
    expiryDays: 7,
    uploading: false,
    error: null,
    success: false,
    fileContent: null,
    message: '',
    preview: null
  });

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    handleFileSelection(file || null);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    handleFileSelection(selectedFile || null);
  };

  const handleFileSelection = (file: File | null) => {
    if (file) {
      // Check if file is a text file
      if (file.type.startsWith('text/') || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setState(prev => ({ 
            ...prev, 
            file,
            error: null,
            fileContent: e.target?.result as string,
            preview: null
          }));
        };
        reader.readAsText(file);
      } else if (file.type.startsWith('image/')) {
        // Handle image preview
        const reader = new FileReader();
        reader.onloadend = () => {
          setState(prev => ({ 
            ...prev, 
            file,
            error: null,
            fileContent: null,
            preview: reader.result as string 
          }));
        };
        reader.readAsDataURL(file);
      } else {
        setState(prev => ({ 
          ...prev, 
          file,
          error: null,
          fileContent: null,
          preview: null
        }));
      }
    } else {
      setState(prev => ({ 
        ...prev, 
        file: null,
        error: null,
        fileContent: null,
        preview: null,
        success: false
      }));
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const message = e.target.value;
    setState(prev => ({ 
      ...prev, 
      message,
      error: null 
    }));
  };

  const clearFileSelection = () => {
    handleFileSelection(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCancel = () => {
    setState(prev => ({
      ...prev,
      file: null,
      preview: null,
      error: null,
      fileContent: null,
      message: '',
      success: false,
      recipientEmail: '',
      expiryDays: 7,
      uploading: false
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { file, message, recipientEmail } = state;

    // Check if at least one of file or message is provided
    if (!file && !message.trim()) {
      setState(prev => ({ 
        ...prev, 
        error: 'Please either select a file to upload or enter a message' 
      }));
      return;
    }

    try {
      setState(prev => ({ ...prev, uploading: true, error: null }));

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      let filePath = '';
      let uploadError = null;
      
      // Only attempt file upload if a file is selected
      if (file) {
        const fileExt = file.name.split('.').pop() || '';
        const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`;
        filePath = `${user.id}/${fileName}`;

        const { error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) {
          uploadError = error;
        }
      }

      // If file upload failed, don't proceed with database insert
      if (uploadError) {
        throw uploadError;
      }

      // Use user's email if no recipient email is specified
      const finalRecipientEmail = recipientEmail || user.email;

      // Create a record in the files table
      const { error: dbError } = await supabase
        .from('files')
        .insert([
          {
            name: file?.name || 'Message Only',
            path: filePath || null,
            recipient_email: finalRecipientEmail,
            expiry_date: state.expiryDays ? new Date(Date.now() + state.expiryDays * 24 * 60 * 60 * 1000).toISOString() : null,
            user_id: user.id,
            download_count: 0,
            message: message.trim(),
            type: file ? 'file_and_message' : 'message_only'
          },
        ]);

      if (dbError) {
        // If database insert fails and we uploaded a file, delete it
        if (filePath) {
          await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([filePath]);
        }
        throw dbError;
      }

      // Reset form on success
      setState(prev => ({
        ...prev,
        uploading: false,
        success: true,
        file: null,
        recipientEmail: '',
        fileContent: null,
        message: '',
        error: null,
        preview: null,
        expiryDays: 7
      }));

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error:', error);
      setState(prev => ({
        ...prev,
        uploading: false,
        error: error instanceof Error ? error.message : 'Error sending. Please try again.',
      }));
    }
  };

  // Get the appropriate button text based on state
  const getButtonText = () => {
    if (state.uploading) {
      return state.file ? 'Uploading...' : 'Sending...';
    }
    if (!state.file && !state.message.trim()) {
      return 'Send';
    }
    return state.file ? 'Upload File & Message' : 'Send Message';
  };

  // Determine if the form can be submitted
  const canSubmit = state.file || state.message.trim();

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h2 className="text-2xl font-bold mb-6">Share File or Message</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              File Upload (Optional if message is provided)
            </label>
            <div 
              className={`border-2 border-dashed rounded-lg p-6 text-center ${
                state.file ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-gray-400'
              }`}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <input
                type="file"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                ref={fileInputRef}
              />
              {state.file ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-center space-x-3">
                    <span className="text-green-600 flex items-center">
                      <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      {state.file.name}
                    </span>
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={clearFileSelection}
                        className="text-sm px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 focus:outline-none transition-colors"
                      >
                        Change
                      </button>
                      <button
                        type="button"
                        onClick={handleCancel}
                        className="text-sm px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 focus:outline-none transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                  {state.preview && (
                    <div className="mt-4 relative">
                      <img
                        src={state.preview}
                        alt="Preview"
                        className="max-w-xs mx-auto rounded shadow-sm"
                      />
                      <button
                        type="button"
                        onClick={clearFileSelection}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 focus:outline-none"
                        title="Remove preview"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {state.fileContent && (
                    <div className="mt-4">
                      <p className="text-sm text-gray-600 mb-2">File Preview:</p>
                      <div className="bg-gray-50 rounded-md p-4 text-left">
                        <pre className="text-xs text-gray-700 whitespace-pre-wrap max-h-40 overflow-auto">
                          {state.fileContent}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="mt-4 text-gray-600">
                    Drag and drop a file here, or click to select a file
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Supported file types: All files
                  </p>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Message (Optional if file is provided)
            </label>
            <textarea
              value={state.message}
              onChange={handleMessageChange}
              className={`mt-1 block w-full rounded-md shadow-sm focus:ring-blue-500 ${
                !state.message.trim() && !state.file && state.error
                  ? 'border-red-300 focus:border-red-500'
                  : 'border-gray-300 focus:border-blue-500'
              }`}
              rows={4}
              placeholder="Enter your message here..."
            />
            <p className="mt-1 text-sm text-gray-500">
              You can send either a file, a message, or both
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Recipient Email (Optional)
            </label>
            <input
              type="email"
              value={state.recipientEmail}
              onChange={(e) => setState(prev => ({ ...prev, recipientEmail: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              placeholder="Leave empty to send to your email"
            />
            <p className="mt-1 text-sm text-gray-500">Leave empty to send the file to your own email address</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Link Expiry (Days) (Optional)
            </label>
            <input
              type="number"
              value={state.expiryDays}
              onChange={(e) => setState(prev => ({ ...prev, expiryDays: parseInt(e.target.value) || 0 }))}
              min="0"
              max="30"
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
            <p className="mt-1 text-sm text-gray-500">Set to 0 or leave empty for no expiry</p>
          </div>

          {state.error && (
            <div className="text-red-500 text-sm bg-red-50 p-3 rounded">
              {state.error}
            </div>
          )}

          {state.success && (
            <div className="text-green-500 text-sm bg-green-50 p-3 rounded">
              {state.file ? 'File uploaded successfully!' : 'Message sent successfully!'}
              {state.recipientEmail ? ' An email will be sent to the recipient.' : ' An email will be sent to your address.'}
            </div>
          )}

          <button
            type="submit"
            disabled={state.uploading || !canSubmit}
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-white bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
          >
            {getButtonText()}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FileUpload; 