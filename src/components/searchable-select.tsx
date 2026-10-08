// src/components/searchable-select.tsx
'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, ChevronDown, Check, Plus, Phone } from 'lucide-react';

export interface SearchableOption {
  id: string;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  badgeStyle?: { bg: string; text: string; border: string } | null;
  detail?: string | null;
  meta?: unknown;
}

interface SearchableSelectProps {
  label: string;
  placeholder?: string;
  options: SearchableOption[];
  value: string | null;
  onChange: (value: string | null, option?: SearchableOption | null) => void;
  onAddNew?: () => void;
  addNewLabel?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string | null;
  allowClear?: boolean;
  helperText?: string;
}

export function SearchableSelect({
  label,
  placeholder = 'Search by name or phone...',
  options,
  value,
  onChange,
  onAddNew,
  addNewLabel = '+ Create New',
  disabled = false,
  required = false,
  error = null,
  allowClear = true,
  helperText,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Selected option
  const selectedOption = useMemo(
    () => options.find((opt) => opt.id === value) || null,
    [options, value]
  );

  // Filter options based on query
  const filteredOptions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return options;
    return options.filter((opt) => {
      const matchTitle = opt.title.toLowerCase().includes(q);
      const matchSubtitle = opt.subtitle ? opt.subtitle.toLowerCase().includes(q) : false;
      const matchDetail = opt.detail ? opt.detail.toLowerCase().includes(q) : false;
      const matchId = opt.id.toLowerCase().includes(q);
      return matchTitle || matchSubtitle || matchDetail || matchId;
    });
  }, [options, searchQuery]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (option: SearchableOption) => {
    onChange(option.id, option);
    setIsOpen(false);
    setSearchQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null, null);
    setSearchQuery('');
    if (inputRef.current) inputRef.current.focus();
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      {/* Label */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.375rem',
        }}
      >
        <label
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--foreground)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <span>{label}</span>
          {required && <span style={{ color: 'var(--destructive)' }}>*</span>}
        </label>
        {selectedOption && allowClear && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '0.6875rem',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            Clear selection
          </button>
        )}
      </div>

      {/* Selected Item View OR Search Trigger */}
      {selectedOption && !isOpen ? (
        <div
          onClick={() => !disabled && setIsOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius)',
            border: error ? '1px solid var(--destructive)' : '1px solid var(--border)',
            backgroundColor: 'var(--surface)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'border-color 0.15s ease',
            opacity: disabled ? 0.7 : 1,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'var(--primary)',
                color: 'var(--primary-foreground)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.75rem',
                flexShrink: 0,
              }}
            >
              {selectedOption.title
                .split(' ')
                .map((p) => p[0])
                .join('')
                .slice(0, 2)
                .toUpperCase() || 'ID'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  color: 'var(--foreground)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {selectedOption.title}
              </div>
              {selectedOption.subtitle && (
                <div
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--muted-foreground)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Phone size={11} />
                  <span dir="ltr">{selectedOption.subtitle}</span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            {selectedOption.badge && (
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  backgroundColor: selectedOption.badgeStyle?.bg || 'var(--hover)',
                  color: selectedOption.badgeStyle?.text || 'var(--foreground)',
                  border: selectedOption.badgeStyle?.border
                    ? `1px solid ${selectedOption.badgeStyle.border}`
                    : '1px solid var(--border)',
                }}
              >
                {selectedOption.badge}
              </span>
            )}
            <button
              type="button"
              onClick={handleClear}
              title="Remove selection"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--muted-foreground)',
                cursor: 'pointer',
                padding: '2px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>
      ) : (
        /* Search Input Box */
        <div style={{ position: 'relative', width: '100%' }}>
          <div
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: '0.75rem',
                color: 'var(--muted-foreground)',
                pointerEvents: 'none',
              }}
            />
            <input
              ref={inputRef}
              type="text"
              disabled={disabled}
              placeholder={placeholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsOpen(true)}
              style={{
                width: '100%',
                padding: '0.5rem 2rem 0.5rem 2.25rem',
                borderRadius: 'var(--radius)',
                border: error ? '1px solid var(--destructive)' : '1px solid var(--border)',
                backgroundColor: 'var(--surface)',
                color: 'var(--foreground)',
                fontSize: '0.875rem',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
              }}
            />
            <div
              style={{
                position: 'absolute',
                right: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--muted-foreground)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  <X size={14} />
                </button>
              )}
              <ChevronDown
                size={16}
                style={{
                  color: 'var(--muted-foreground)',
                  transform: isOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.15s ease',
                  cursor: 'pointer',
                }}
                onClick={() => !disabled && setIsOpen(!isOpen)}
              />
            </div>
          </div>

          {/* Dropdown Options List */}
          {isOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                backgroundColor: 'var(--card)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--border)',
                boxShadow:
                  '0 10px 25px -5px rgba(76, 69, 65, 0.15), 0 4px 6px -2px rgba(76, 69, 65, 0.05)',
                zIndex: 60,
                maxHeight: '260px',
                overflowY: 'auto',
              }}
            >
              {/* Optional Add New Action at the top */}
              {onAddNew && (
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    onAddNew();
                  }}
                  style={{
                    width: '100%',
                    padding: '0.625rem 0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'rgba(174, 172, 120, 0.08)',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--primary)',
                    fontWeight: 600,
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(174, 172, 120, 0.18)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(174, 172, 120, 0.08)';
                  }}
                >
                  <Plus size={15} />
                  <span>{addNewLabel}</span>
                </button>
              )}

              {/* Options list */}
              {filteredOptions.length === 0 ? (
                <div
                  style={{
                    padding: '1.25rem 1rem',
                    textAlign: 'center',
                    color: 'var(--muted-foreground)',
                    fontSize: '0.8125rem',
                  }}
                >
                  No results found for &ldquo;{searchQuery}&rdquo;
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const isSelected = opt.id === value;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => handleSelect(opt)}
                      style={{
                        padding: '0.625rem 0.875rem',
                        borderBottom: '1px solid var(--border)',
                        backgroundColor: isSelected ? 'var(--hover)' : 'transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--hover)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isSelected
                          ? 'var(--hover)'
                          : 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--surface-muted, rgba(174, 172, 120, 0.2))',
                            color: 'var(--foreground)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            flexShrink: 0,
                          }}
                        >
                          {opt.title
                            .split(' ')
                            .map((p) => p[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase() || 'ID'}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: '0.8125rem',
                              fontWeight: 600,
                              color: 'var(--foreground)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {opt.title}
                          </div>
                          {opt.subtitle && (
                            <div
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--muted-foreground)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px',
                              }}
                            >
                              <Phone size={10} />
                              <span dir="ltr">{opt.subtitle}</span>
                            </div>
                          )}
                          {opt.detail && (
                            <div
                              style={{
                                fontSize: '0.6875rem',
                                color: 'var(--muted-foreground)',
                                opacity: 0.8,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                maxWidth: '240px',
                              }}
                            >
                              {opt.detail}
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        {opt.badge && (
                          <span
                            style={{
                              fontSize: '0.6875rem',
                              fontWeight: 600,
                              padding: '2px 7px',
                              borderRadius: '999px',
                              backgroundColor: opt.badgeStyle?.bg || 'var(--hover)',
                              color: opt.badgeStyle?.text || 'var(--foreground)',
                              border: opt.badgeStyle?.border
                                ? `1px solid ${opt.badgeStyle.border}`
                                : '1px solid var(--border)',
                            }}
                          >
                            {opt.badge}
                          </span>
                        )}
                        {isSelected && <Check size={16} style={{ color: 'var(--primary)' }} />}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      {/* Helper text or Error message */}
      {error ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--destructive)', marginTop: '0.25rem' }}>
          {error}
        </div>
      ) : helperText ? (
        <div style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', marginTop: '0.25rem' }}>
          {helperText}
        </div>
      ) : null}
    </div>
  );
}
