// src/components/excel-import-modal.tsx
// Interactive Excel Import Modal for CRM Leads and Customers.
// Features: File Drag & Drop, Pre-write Validation Preview, Row-level Error inspection, and Confirmation gate.
'use client';

import React, { useState, useRef, useTransition } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  PlusCircle,
  SkipForward,
  Info,
} from 'lucide-react';
import type { ImportPreviewResult, ImportExecutionResult } from '@/app/(dashboard)/crm/excel-actions';

export interface BaseImportRow {
  rowNumber: number;
  full_name?: string;
  phone?: string | null;
  email?: string | null;
  action: 'create' | 'update' | 'skip' | 'error';
  message?: string;
}

interface ExcelImportModalProps<TRow extends BaseImportRow> {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description: string;
  moduleType: 'customers' | 'leads';
  onValidate: (base64: string) => Promise<ImportPreviewResult<TRow>>;
  onExecute: (rows: TRow[]) => Promise<ImportExecutionResult>;
  onSuccess: () => void;
  onDownloadTemplate?: () => Promise<{ success: boolean; base64?: string; filename?: string; error?: string }>;
}

export function ExcelImportModal<TRow extends BaseImportRow>({
  isOpen,
  onClose,
  title,
  description,
  moduleType,
  onValidate,
  onExecute,
  onSuccess,
  onDownloadTemplate,
}: ExcelImportModalProps<TRow>) {
  const [step, setStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [previewData, setPreviewData] = useState<ImportPreviewResult<TRow> | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'error' | 'create' | 'update' | 'skip'>('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [executionResult, setExecutionResult] = useState<ImportExecutionResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  function resetState() {
    setStep('upload');
    setFileName('');
    setPreviewData(null);
    setActiveFilter('all');
    setSearchFilter('');
    setExecutionResult(null);
    setErrorMessage(null);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  // Handle template download
  function handleDownloadTemplate() {
    if (!onDownloadTemplate) return;
    startTransition(async () => {
      try {
        const res = await onDownloadTemplate();
        if (res.success && res.base64) {
          const byteCharacters = atob(res.base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = res.filename || 'Template.xlsx';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } catch (err: unknown) {
        console.error('Failed to download template:', err);
      }
    });
  }

  // Handle file reading
  function handleFileSelected(file: File) {
    const fileNameLower = (file.name || '').toLowerCase();
    const isExcel =
      fileNameLower.endsWith('.xlsx') ||
      fileNameLower.endsWith('.xls') ||
      fileNameLower.endsWith('.csv') ||
      file.type.includes('spreadsheet') ||
      file.type.includes('excel') ||
      file.type.includes('csv');

    if (!isExcel) {
      setErrorMessage('Please select a valid Excel file (.xlsx or .xls)');
      return;
    }

    setErrorMessage(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Data = e.target?.result as string;
      if (!base64Data) {
        setErrorMessage('Failed to read file content from your device.');
        return;
      }

      startTransition(async () => {
        try {
          const res = await onValidate(base64Data);
          if (!res || !res.success) {
            const errText =
              res?.error && res.error.trim().length > 0
                ? res.error.trim()
                : 'Failed to parse Excel file. Please ensure the file has a valid header row and readable data.';
            setErrorMessage(errText);
          } else {
            setPreviewData(res);
            setStep('preview');
            // If errors exist, default filter to errors so user sees them immediately
            if (res.summary.errorCount > 0) {
              setActiveFilter('error');
            } else {
              setActiveFilter('all');
            }
          }
        } catch (err: unknown) {
          console.error('[ImportModal] Validation error:', err);
          const msg =
            err instanceof Error && err.message?.trim().length > 0
              ? err.message.trim()
              : 'An unexpected error occurred while validating the Excel file.';
          setErrorMessage(msg);
        }
      });
    };

    reader.onerror = () => {
      setErrorMessage('Error reading Excel file from your device.');
    };

    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  }

  function handleExecute() {
    if (!previewData || !previewData.canImport) return;

    startTransition(async () => {
      try {
        const res = await onExecute(previewData.rows);
        setExecutionResult(res);
        setStep('result');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to execute import';
        setErrorMessage(msg);
      }
    });
  }

  // Filter rows in preview
  const filteredRows = (previewData?.rows || []).filter((r) => {
    if (activeFilter !== 'all' && r.action !== activeFilter) return false;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      const matchName = r.full_name?.toLowerCase().includes(q) ?? false;
      const matchPhone = r.phone?.toLowerCase().includes(q) ?? false;
      const matchEmail = r.email?.toLowerCase().includes(q) ?? false;
      const matchMsg = r.message?.toLowerCase().includes(q) ?? false;
      return matchName || matchPhone || matchEmail || matchMsg;
    }
    return true;
  });

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        backdropFilter: 'blur(3px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) handleClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          width: '100%',
          maxWidth: step === 'preview' ? '860px' : '540px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(76, 69, 65, 0.25)',
          overflow: 'hidden',
          transition: 'max-width 0.2s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius)',
                backgroundColor: 'rgba(174, 172, 120, 0.15)',
                color: 'var(--foreground)',
                border: '1px solid rgba(174, 172, 120, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
                {title}
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)', margin: 0 }}>
                {fileName ? `File: ${fileName}` : description}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--muted-foreground)',
              cursor: isPending ? 'not-allowed' : 'pointer',
              padding: '0.25rem',
              borderRadius: 'var(--radius)',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Error Banner */}
        {errorMessage && errorMessage.trim().length > 0 && (
          <div
            style={{
              padding: '0.75rem 1.25rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              borderBottom: '1px solid rgba(239, 68, 68, 0.25)',
              color: 'var(--destructive)',
              fontSize: '0.8125rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMessage.trim()}</span>
          </div>
        )}

        {/* Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
          {/* STEP 1: UPLOAD */}
          {step === 'upload' && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    handleFileSelected(e.target.files[0]);
                  }
                }}
              />

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed var(--border-strong)',
                  borderRadius: 'var(--radius)',
                  padding: '2.5rem 1.5rem',
                  textAlign: 'center',
                  backgroundColor: 'var(--surface)',
                  cursor: isPending ? 'wait' : 'pointer',
                  transition: 'border-color 0.15s ease',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(174, 172, 120, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1rem auto',
                    color: 'var(--foreground)',
                  }}
                >
                  {isPending ? <RefreshCw size={24} className="animate-spin" /> : <Upload size={24} />}
                </div>

                <div style={{ fontWeight: 600, fontSize: '0.9375rem', color: 'var(--foreground)', marginBottom: '0.375rem' }}>
                  {isPending ? 'Parsing & Validating Excel...' : 'Choose an Excel file or drag & drop'}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--muted-foreground)' }}>
                  Supports Excel spreadsheets (.xlsx, .xls) and CSV
                </div>
              </div>

              {onDownloadTemplate && (
                <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    disabled={isPending}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--primary)',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    <FileSpreadsheet size={15} />
                    Download sample Excel template (.xlsx)
                  </button>
                </div>
              )}

              <div
                style={{
                  marginTop: '1.5rem',
                  padding: '1rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'rgba(174, 172, 120, 0.08)',
                  border: '1px solid rgba(174, 172, 120, 0.2)',
                  fontSize: '0.8125rem',
                  color: 'var(--foreground)',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: '0.375rem' }}>
                  📋 How Record Matching &amp; Safety Works:
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', color: 'var(--muted-foreground)' }}>
                  <li>
                    <strong>Existing ID:</strong> Directly updates the matching database record (requires authorized ownership).
                  </li>
                  <li>
                    <strong>Phone / Email Matching:</strong> If the contact already exists in the CRM, updates any modified information or automatically skips if data is identical (zero duplicate creation).
                  </li>
                  <li>
                    <strong>New Contact:</strong> Creates a brand new {moduleType === 'customers' ? 'customer' : 'lead'}.
                  </li>
                  <li>
                    <strong>Preview Before Writing:</strong> You review every row (New, Update, Skipped, Error) before confirming.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW */}
          {step === 'preview' && previewData && (
            <div>
              {/* Summary Badges */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                  gap: '0.75rem',
                  marginBottom: '1.25rem',
                }}
              >
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontWeight: 500 }}>
                    Total Rows
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--foreground)' }}>
                    {previewData.summary.total}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>To Create</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#059669' }}>
                    {previewData.summary.createCount}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'rgba(59, 130, 246, 0.08)',
                    border: '1px solid rgba(59, 130, 246, 0.25)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 600 }}>To Update</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2563eb' }}>
                    {previewData.summary.updateCount}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'var(--surface)',
                    border: '1px solid var(--border)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', fontWeight: 500 }}>
                    Skipped
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>
                    {previewData.summary.skipCount}
                  </div>
                </div>

                <div
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor:
                      previewData.summary.errorCount > 0
                        ? 'rgba(239, 68, 68, 0.1)'
                        : 'var(--surface)',
                    border:
                      previewData.summary.errorCount > 0
                        ? '1px solid rgba(239, 68, 68, 0.3)'
                        : '1px solid var(--border)',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: previewData.summary.errorCount > 0 ? '#dc2626' : 'var(--muted-foreground)',
                      fontWeight: 600,
                    }}
                  >
                    Errors
                  </div>
                  <div
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      color: previewData.summary.errorCount > 0 ? '#dc2626' : 'var(--muted-foreground)',
                    }}
                  >
                    {previewData.summary.errorCount}
                  </div>
                </div>
              </div>

              {/* Blocking Warning Banner if Errors Found */}
              {previewData.summary.errorCount > 0 && (
                <div
                  style={{
                    padding: '0.875rem 1rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    marginBottom: '1rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.625rem',
                  }}
                >
                  <AlertCircle size={18} style={{ color: 'var(--destructive)', marginTop: '2px', flexShrink: 0 }} />
                  <div style={{ fontSize: '0.8125rem', color: 'var(--foreground)', lineHeight: 1.4 }}>
                    <strong style={{ color: 'var(--destructive)' }}>
                      Import Blocked: {previewData.summary.errorCount} Invalid Row(s) Detected
                    </strong>
                    <div style={{ color: 'var(--muted-foreground)', marginTop: '2px' }}>
                      To protect database integrity and prevent duplicate customers or cross-employee unauthorized updates,
                      all errors must be resolved in your file before importing.
                    </div>
                  </div>
                </div>
              )}

              {/* All Records Identical / Skipped Banner */}
              {previewData.summary.errorCount === 0 &&
                previewData.summary.createCount === 0 &&
                previewData.summary.updateCount === 0 &&
                previewData.summary.skipCount > 0 && (
                  <div
                    style={{
                      padding: '0.875rem 1rem',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'rgba(59, 130, 246, 0.08)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      marginBottom: '1rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.625rem',
                    }}
                  >
                    <Info size={18} style={{ color: '#2563eb', flexShrink: 0 }} />
                    <div style={{ fontSize: '0.8125rem', color: 'var(--foreground)' }}>
                      <strong>All records already exist with identical data.</strong> No changes were detected compared to CRM database records, so existing data will remain intact and zero duplicates will be added.
                    </div>
                  </div>
                )}

              {/* Filters & Search Toolbar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  marginBottom: '0.75rem',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setActiveFilter('all')}
                    style={{
                      padding: '0.25rem 0.625rem',
                      borderRadius: 'var(--radius)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      border: '1px solid var(--border)',
                      backgroundColor: activeFilter === 'all' ? 'var(--primary)' : 'var(--surface)',
                      color: activeFilter === 'all' ? 'var(--primary-foreground)' : 'var(--foreground)',
                      cursor: 'pointer',
                    }}
                  >
                    All ({previewData.summary.total})
                  </button>

                  {previewData.summary.errorCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveFilter('error')}
                      style={{
                        padding: '0.25rem 0.625rem',
                        borderRadius: 'var(--radius)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        backgroundColor: activeFilter === 'error' ? '#dc2626' : 'rgba(239, 68, 68, 0.1)',
                        color: activeFilter === 'error' ? '#fff' : '#dc2626',
                        cursor: 'pointer',
                      }}
                    >
                      Errors ({previewData.summary.errorCount})
                    </button>
                  )}

                  {previewData.summary.createCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveFilter('create')}
                      style={{
                        padding: '0.25rem 0.625rem',
                        borderRadius: 'var(--radius)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        backgroundColor: activeFilter === 'create' ? '#059669' : 'rgba(16, 185, 129, 0.1)',
                        color: activeFilter === 'create' ? '#fff' : '#059669',
                        cursor: 'pointer',
                      }}
                    >
                      New ({previewData.summary.createCount})
                    </button>
                  )}

                  {previewData.summary.updateCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveFilter('update')}
                      style={{
                        padding: '0.25rem 0.625rem',
                        borderRadius: 'var(--radius)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        backgroundColor: activeFilter === 'update' ? '#2563eb' : 'rgba(59, 130, 246, 0.1)',
                        color: activeFilter === 'update' ? '#fff' : '#2563eb',
                        cursor: 'pointer',
                      }}
                    >
                      Updates ({previewData.summary.updateCount})
                    </button>
                  )}

                  {previewData.summary.skipCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveFilter('skip')}
                      style={{
                        padding: '0.25rem 0.625rem',
                        borderRadius: 'var(--radius)',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        border: '1px solid var(--border)',
                        backgroundColor: activeFilter === 'skip' ? 'var(--foreground)' : 'var(--surface)',
                        color: activeFilter === 'skip' ? 'var(--background)' : 'var(--muted-foreground)',
                        cursor: 'pointer',
                      }}
                    >
                      Skipped ({previewData.summary.skipCount})
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="text"
                    placeholder="Search preview rows..."
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    style={{
                      padding: '0.25rem 0.625rem',
                      fontSize: '0.75rem',
                      borderRadius: 'var(--radius)',
                      backgroundColor: 'var(--surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--foreground)',
                      outline: 'none',
                      width: '180px',
                    }}
                  />
                </div>
              </div>

              {/* Preview Table */}
              <div
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  overflow: 'hidden',
                  maxHeight: '320px',
                  overflowY: 'auto',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr
                      style={{
                        backgroundColor: 'var(--surface)',
                        borderBottom: '1px solid var(--border)',
                        textAlign: 'left',
                      }}
                    >
                      <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, width: '60px' }}>Row</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Action</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Full Name</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Contact</th>
                      <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Details / Validation Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            padding: '1.5rem',
                            textAlign: 'center',
                            color: 'var(--muted-foreground)',
                          }}
                        >
                          No rows match the selected filter.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((r, idx) => {
                        const isError = r.action === 'error';
                        const isCreate = r.action === 'create';
                        const isUpdate = r.action === 'update';

                        return (
                          <tr
                            key={idx}
                            style={{
                              borderBottom: '1px solid var(--border)',
                              backgroundColor: isError
                                ? 'rgba(239, 68, 68, 0.04)'
                                : idx % 2 === 0
                                ? 'transparent'
                                : 'rgba(174, 172, 120, 0.03)',
                            }}
                          >
                            <td style={{ padding: '0.5rem 0.75rem', color: 'var(--muted-foreground)', fontFamily: 'monospace' }}>
                              #{r.rowNumber}
                            </td>
                            <td style={{ padding: '0.5rem 0.75rem' }}>
                              {isCreate && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    fontSize: '0.6875rem',
                                    fontWeight: 600,
                                    backgroundColor: 'rgba(16, 185, 129, 0.12)',
                                    color: '#059669',
                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                  }}
                                >
                                  <PlusCircle size={12} />
                                  New
                                </span>
                              )}
                              {isUpdate && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    fontSize: '0.6875rem',
                                    fontWeight: 600,
                                    backgroundColor: 'rgba(59, 130, 246, 0.12)',
                                    color: '#2563eb',
                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                  }}
                                >
                                  <RefreshCw size={12} />
                                  Update
                                </span>
                              )}
                              {r.action === 'skip' && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    fontSize: '0.6875rem',
                                    fontWeight: 500,
                                    backgroundColor: 'var(--surface)',
                                    color: 'var(--muted-foreground)',
                                    border: '1px solid var(--border)',
                                  }}
                                >
                                  <SkipForward size={12} />
                                  Skip
                                </span>
                              )}
                              {isError && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '3px',
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    fontSize: '0.6875rem',
                                    fontWeight: 600,
                                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                                    color: '#dc2626',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                  }}
                                >
                                  <AlertCircle size={12} />
                                  Error
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, color: 'var(--foreground)' }}>
                              {r.full_name || '—'}
                            </td>
                            <td style={{ padding: '0.5rem 0.75rem', color: 'var(--foreground)', fontSize: '0.75rem' }}>
                              {r.phone && <div>{r.phone}</div>}
                              {r.email && <div style={{ color: 'var(--muted-foreground)' }}>{r.email}</div>}
                              {!r.phone && !r.email && '—'}
                            </td>
                            <td
                              style={{
                                padding: '0.5rem 0.75rem',
                                color: isError ? '#dc2626' : 'var(--muted-foreground)',
                                fontWeight: isError ? 500 : 400,
                              }}
                            >
                              {r.message}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: RESULT */}
          {step === 'result' && executionResult && (
            <div style={{ textAlign: 'center', padding: '1rem 0' }}>
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: executionResult.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                  color: executionResult.success ? '#059669' : '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.25rem auto',
                }}
              >
                {executionResult.success ? <CheckCircle2 size={32} /> : <AlertCircle size={32} />}
              </div>

              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--foreground)', marginBottom: '0.5rem' }}>
                {executionResult.success ? 'Import Completed Successfully!' : 'Import Finished with Warnings'}
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--muted-foreground)', marginBottom: '1.5rem' }}>
                CRM records have been safely updated and synchronized.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: '0.75rem',
                  maxWidth: '500px',
                  margin: '0 auto',
                  textAlign: 'center',
                }}
              >
                <div style={{ padding: '0.75rem', borderRadius: 'var(--radius)', backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>PROCESSED</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--foreground)' }}>{executionResult.summary.total}</div>
                </div>
                <div style={{ padding: '0.75rem', borderRadius: 'var(--radius)', backgroundColor: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                  <div style={{ fontSize: '0.6875rem', color: '#059669', fontWeight: 600 }}>CREATED</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#059669' }}>{executionResult.summary.created}</div>
                </div>
                <div style={{ padding: '0.75rem', borderRadius: 'var(--radius)', backgroundColor: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
                  <div style={{ fontSize: '0.6875rem', color: '#2563eb', fontWeight: 600 }}>UPDATED</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#2563eb' }}>{executionResult.summary.updated}</div>
                </div>
                <div style={{ padding: '0.75rem', borderRadius: 'var(--radius)', backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--muted-foreground)', fontWeight: 600 }}>SKIPPED</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--muted-foreground)' }}>{executionResult.summary.skipped}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: '1px solid var(--border)',
            backgroundColor: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {step === 'upload' && (
            <>
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)' }}>
                Select a .xlsx file to continue
              </div>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                type="button"
                onClick={() => setStep('upload')}
                disabled={isPending}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  cursor: isPending ? 'not-allowed' : 'pointer',
                }}
              >
                Choose Different File
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border)',
                    color: 'var(--foreground)',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    cursor: isPending ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleExecute}
                  disabled={isPending || !previewData?.canImport}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1.25rem',
                    borderRadius: 'var(--radius)',
                    backgroundColor: previewData?.canImport ? 'var(--primary)' : 'var(--muted)',
                    color: previewData?.canImport ? 'var(--primary-foreground)' : 'var(--muted-foreground)',
                    border: '1px solid rgba(174, 172, 120, 0.4)',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    cursor: previewData?.canImport && !isPending ? 'pointer' : 'not-allowed',
                    opacity: previewData?.canImport ? 1 : 0.6,
                    boxShadow: previewData?.canImport ? '0 2px 4px rgba(76, 69, 65, 0.08)' : 'none',
                  }}
                >
                  {isPending ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Confirm Import (
                      {(previewData?.summary.createCount ?? 0) + (previewData?.summary.updateCount ?? 0)} Records)
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {step === 'result' && (
            <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => {
                  handleClose();
                  onSuccess();
                }}
                style={{
                  padding: '0.5rem 1.5rem',
                  borderRadius: 'var(--radius)',
                  backgroundColor: 'var(--primary)',
                  color: 'var(--primary-foreground)',
                  border: '1px solid rgba(174, 172, 120, 0.4)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(76, 69, 65, 0.08)',
                }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
