import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../context/AuthContext'
import { analyzeReport } from '../lib/cbcAnalyzer'

const ACCEPTED_TYPES = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPG',
  'image/jpg': 'JPG',
  'image/png': 'PNG',
}
const MAX_SIZE_MB = 10
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

function FileIcon({ type }) {
  if (type === 'application/pdf') {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    )
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  )
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

export default function UploadReport() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [progress, setProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const validateFile = (file) => {
    if (!ACCEPTED_TYPES[file.type]) {
      return 'Only PDF, JPG, and PNG files are allowed.'
    }
    if (file.size > MAX_SIZE_BYTES) {
      return `File size exceeds ${MAX_SIZE_MB} MB limit.`
    }
    return null
  }

  const handleFileSelect = useCallback((file) => {
    setError('')
    setSuccess(false)
    setProgress(0)
    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelect(file)
  }, [handleFileSelect])

  const handleInputChange = (e) => {
    const file = e.target.files?.[0]
    if (file) handleFileSelect(file)
  }

  const handleUpload = async () => {
    if (!selectedFile || !user) return

    setUploading(true)
    setError('')
    setProgress(0)

    try {
      // Resolve the active auth user from Supabase to avoid stale context IDs.
      const { data: authData, error: authError } = await supabase.auth.getUser()
      const authUserId = authData?.user?.id || user.id
      if (authError || !authUserId) {
        setError('Session expired. Please sign in again.')
        setUploading(false)
        setProgress(0)
        return
      }

      // Generate unique file path
      const timestamp = Date.now()
      const ext = selectedFile.name.split('.').pop().toLowerCase()
      const safeName = selectedFile.name
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/\s+/g, '_')
      const filePath = `reports/${authUserId}/${timestamp}_${safeName}`

      // Simulate fine-grained progress since Supabase JS v2 doesn't expose upload events
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 85) { clearInterval(progressInterval); return prev }
          return prev + Math.random() * 12
        })
      }, 200)

      // Upload to Supabase Storage
      const { data: storageData, error: storageError } = await supabase.storage
        .from('cbc-reports')
        .upload(filePath, selectedFile, {
          cacheControl: '3600',
          upsert: false,
        })

      clearInterval(progressInterval)

      if (storageError) {
        setError(storageError.message || 'Upload failed. Please try again.')
        setUploading(false)
        setProgress(0)
        return
      }

      setProgress(92)

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('cbc-reports')
        .getPublicUrl(filePath)

      const fileUrl = urlData.publicUrl

      // Insert record into reports table
      const { data, error: dbError } = await supabase.from('reports').insert({
        user_id: authUserId,
        file_name: selectedFile.name,
        file_url: fileUrl,
      }).select().single()

      if (dbError) {
        setError(dbError.message || 'Failed to save report record. Please try again.')
        setUploading(false)
        setProgress(0)
        return
      }

      setProgress(100)
      setSuccess(true)
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''

      // Run AI analysis using the raw file (no storage fetch needed)
      if (data) {
        setAnalyzing(true)
        try {
          const result = await analyzeReport({
            reportId: data.id,
            fileBlob: selectedFile,   // pass raw File — Gemini reads it locally
            filePath,                 // stored for re-analysis later
            fileType: selectedFile.type,
          })
          if (!result.success) {
            console.error('[ARISE] Analysis failed:', result.error)
            // Non-fatal — user can re-analyze from the dashboard
          }
        } catch (analysisErr) {
          console.error('[ARISE] Analysis exception:', analysisErr)
        } finally {
          setAnalyzing(false)
        }
      }

      // Redirect to dashboard after a short pause
      setTimeout(() => navigate('/dashboard'), 1000)

    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
      setProgress(0)
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveFile = () => {
    setSelectedFile(null)
    setError('')
    setProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="py-6 animate-fade-in">
      <div className="max-w-2xl mx-auto">

        {/* Page Title */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary-600 to-secondary-500 flex items-center justify-center shadow-lg shadow-primary-200/50 mb-5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="white" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Upload CBC Report</h1>
          <p className="text-slate-500 text-sm max-w-sm mx-auto">
            Upload your Complete Blood Count report. ARISE will securely store it and prepare it for AI-powered analysis.
          </p>
        </div>

        {/* Success Banner */}
        {success && (
          <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl mb-6 animate-slide-up">
            <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="white" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          <div>
              <p className="font-semibold text-emerald-800 text-sm">Report uploaded successfully!</p>
              <p className="text-emerald-600 text-xs mt-0.5">
                {analyzing ? '🔬 Running AI analysis...' : 'Redirecting you to the dashboard…'}
              </p>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl mb-6 animate-slide-up">
            <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="white" className="w-3 h-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-red-700 text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Upload Card */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">

          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !selectedFile && fileInputRef.current?.click()}
            className={`
              relative border-2 border-dashed rounded-t-2xl transition-all duration-200 cursor-pointer
              ${isDragging
                ? 'border-primary-400 bg-primary-50'
                : selectedFile
                  ? 'border-secondary-300 bg-secondary-50/30 cursor-default'
                  : 'border-slate-200 hover:border-primary-300 hover:bg-primary-50/30'
              }
            `}
            style={{ minHeight: '220px' }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={handleInputChange}
            />

            <div className="flex flex-col items-center justify-center p-10 text-center min-h-[220px]">
              {selectedFile ? (
                /* File Preview */
                <div className="flex flex-col items-center gap-3 animate-fade-in">
                  <div className="w-14 h-14 rounded-2xl bg-white border border-slate-100 shadow-sm flex items-center justify-center">
                    <FileIcon type={selectedFile.type} />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-800 text-sm truncate max-w-xs">{selectedFile.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatBytes(selectedFile.size)} · {ACCEPTED_TYPES[selectedFile.type]}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRemoveFile() }}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Remove file
                  </button>
                </div>
              ) : (
                /* Empty State */
                <>
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all duration-200 ${isDragging ? 'bg-primary-100 scale-110' : 'bg-slate-50'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={`w-7 h-7 transition-colors ${isDragging ? 'text-primary-600' : 'text-slate-400'}`}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </div>
                  <p className="font-semibold text-slate-700 text-sm mb-1">
                    {isDragging ? 'Drop it here!' : 'Drag & drop your report here'}
                  </p>
                  <p className="text-slate-400 text-xs mb-4">or click to browse your files</p>
                  <div className="flex items-center gap-2">
                    {['PDF', 'JPG', 'PNG'].map((fmt) => (
                      <span key={fmt} className="px-2.5 py-1 bg-slate-100 text-slate-500 text-xs font-medium rounded-lg">
                        {fmt}
                      </span>
                    ))}
                    <span className="text-slate-300 text-xs">· Max {MAX_SIZE_MB} MB</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Progress Bar (visible during upload) */}
          {uploading && (
            <div className="px-6 py-4 border-t border-slate-50 bg-slate-50/50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-slate-600">Uploading…</p>
                <p className="text-xs font-semibold text-primary-600">{Math.round(progress)}%</p>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 rounded-full bg-gradient-to-r from-primary-500 to-secondary-500 transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="px-6 py-5 border-t border-slate-50 flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-3 rounded-2xl border border-slate-200 text-slate-700 text-sm font-semibold hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.99]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              Choose File
            </button>

            <button
              type="button"
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-primary-600 to-secondary-500 text-white text-sm font-bold shadow-sm shadow-primary-200/50 hover:from-primary-700 hover:to-secondary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.99]"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  Upload Report
                </>
              )}
            </button>
          </div>
        </div>

        {/* Info Note */}
        <div className="mt-6 flex items-start gap-3 p-4 bg-secondary-50 border border-secondary-100 rounded-2xl">
          <div className="w-5 h-5 rounded-full bg-secondary-500 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="white" className="w-3 h-3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
            </svg>
          </div>
          <div>
            <p className="text-secondary-800 text-xs font-semibold mb-0.5">Secure & Private</p>
            <p className="text-secondary-600 text-xs">Your reports are encrypted and only accessible by you. ARISE uses Supabase secure storage to protect your health data.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
