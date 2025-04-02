import React, { useState, useCallback } from 'react';
import { supabase, STORAGE_BUCKET } from '../config/supabase';
import { 
  XMarkIcon, 
  CheckIcon, 
  ArrowUpTrayIcon,
  EnvelopeIcon,
  CalendarIcon,
  ChatBubbleBottomCenterTextIcon
} from '@heroicons/react/24/outline';

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

  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB in bytes

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  };

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return `File size exceeds 50MB limit (${formatSize(file.size)})`;
    }
    return null;
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      const error = validateFile(droppedFile);
      if (error) {
        setState(prev => ({
          ...prev,
          error,
          file: null
        }));
        return;
      }
      setState(prev => ({
        ...prev,
        file: droppedFile,
        error: null
      }));
    }
    setIsDragging(false);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const error = validateFile(selectedFile);
      if (error) {
        setState(prev => ({
          ...prev,
          error,
          file: null
        }));
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      setState(prev => ({
        ...prev,
        file: selectedFile,
        error: null
      }));
    }
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
    <div className="p-6 bg-white rounded-lg shadow-lg max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Upload and attach files</h2>
        <button onClick={handleCancel} className="text-gray-500">
          <XMarkIcon className="w-6 h-6" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          <div className="relative">
            <div 
              className={`border-2 border-dashed rounded-lg p-8 text-center mb-4 ${
                state.file ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              <ArrowUpTrayIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <input
                type="file"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                ref={fileInputRef}
              />
              <p className="text-lg font-medium mb-1">Click to upload</p>
              <p className="text-sm text-gray-500">or drag and drop</p>
              <p className="text-xs text-gray-400 mt-2">
                SVG, PNG, JPG or GIF (max. 800x400px)
                <br />
                Maximum file size: 50MB
              </p>
            </div>
          </div>

          {state.file && (
            <div className="space-y-3 mb-4">
              <div className="flex items-center p-3 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{state.file.name}</span>
                    <span className="text-xs text-gray-500">
                      {formatSize(state.file.size)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        state.error ? 'bg-red-500' :
                        state.success ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ width: state.uploading ? '50%' : state.success ? '100%' : '0%' }}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={clearFileSelection}
                  className="ml-3 text-gray-400 hover:text-gray-600"
                >
                  {state.success ? (
                    <CheckIcon className="w-5 h-5 text-green-500" />
                  ) : (
                    <XMarkIcon className="w-5 h-5" />
                  )}
                </button>
              </div>

              {state.preview && (
                <div className="mt-2">
                  <img
                    src={state.preview}
                    alt="Preview"
                    className="max-w-xs mx-auto rounded shadow-sm"
                  />
                </div>
              )}
              
              {state.fileContent && (
                <div className="mt-2">
                  <div className="bg-gray-50 rounded-md p-4 text-left">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap max-h-40 overflow-auto">
                      {state.fileContent}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Message
              <span className="text-gray-400 text-xs ml-1">
                {!state.file && "(Required)"}
                {state.file && "(Optional)"}
              </span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-start pt-2">
                <ChatBubbleBottomCenterTextIcon className="h-5 w-5 text-gray-400" />
              </div>
              <textarea
                value={state.message}
                onChange={handleMessageChange}
                className={`block w-full rounded-lg pl-10 pr-3 py-2 ${
                  state.error && !state.message.trim() && !state.file
                    ? 'border-red-300 text-red-900 placeholder-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                } shadow-sm`}
                rows={4}
                placeholder="Enter your message here..."
              />
            </div>
            {state.error && !state.message.trim() && !state.file && (
              <p className="mt-1 text-xs text-red-600">
                Please enter a message or upload a file
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Recipient Email
              <span className="text-gray-400 text-xs ml-1">(Optional)</span>
            </label>
            <div className="relative rounded-lg shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <EnvelopeIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="email"
                value={state.recipientEmail}
                onChange={(e) => setState(prev => ({ ...prev, recipientEmail: e.target.value }))}
                className="block w-full rounded-lg pl-10 pr-3 py-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                placeholder="Leave empty to send to your email"
              />
            </div>
            <p className="text-xs text-gray-500">
              If left empty, the file will be sent to your registered email
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Link Expiry
              <span className="text-gray-400 text-xs ml-1">(In Days) Optional</span>
            </label>
            <div className="relative rounded-lg shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <CalendarIcon className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="number"
                value={state.expiryDays}
                onChange={(e) => setState(prev => ({ ...prev, expiryDays: parseInt(e.target.value) || 0 }))}
                min="0"
                max="30"
                className="block w-full rounded-lg pl-10 pr-3 py-2 border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                placeholder="Number of days until link expires"
              />
              {/* <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">days</span>
              </div> */}
            </div>
            <p className="text-xs text-gray-500">
              Link will expire after the specified number of days (max 30 days)
            </p>
          </div>

          {state.error && (
            <div className="flex items-center p-4 text-red-800 rounded-lg bg-red-50">
              <div className="flex-shrink-0">
                <XMarkIcon className="h-5 w-5" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium">{state.error}</p>
              </div>
            </div>
          )}

          {state.success && (
            <div className="flex items-center p-4 text-green-800 rounded-lg bg-green-50">
              <div className="flex-shrink-0">
                <CheckIcon className="h-5 w-5" />
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium">
                  {state.file ? 'File uploaded successfully!' : 'Message sent successfully!'}
                  {state.recipientEmail 
                    ? ' An email will be sent to the recipient.' 
                    : ' An email will be sent to your address.'}
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={state.uploading || !canSubmit}
              className={`inline-flex items-center px-4 py-2 text-white rounded-lg ${
                state.uploading || !canSubmit
                  ? 'bg-blue-300 cursor-not-allowed'
                  : 'bg-blue-500 hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
              }`}
            >
              {state.uploading && (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {getButtonText()}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default FileUpload; 