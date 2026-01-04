import { useState, useRef, useEffect, useMemo, useCallback } from 'react';

interface AutocompleteOption {
    value: string;
    label: string;
    group?: string;
    sublabel?: string;
}

interface AutocompleteProps {
    options: AutocompleteOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    groupBy?: boolean;
}

export default function Autocomplete({
    options,
    value,
    onChange,
    placeholder = 'Search...',
    groupBy = false,
}: AutocompleteProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Get the display label for current value
    const selectedOption = useMemo(() =>
        options.find(o => o.value === value),
        [options, value]
    );

    // Filter options based on search
    const filteredOptions = useMemo(() => {
        if (!search) return options;
        const searchLower = search.toLowerCase();
        return options.filter(o =>
            o.value.toLowerCase().includes(searchLower) ||
            o.label.toLowerCase().includes(searchLower) ||
            (o.sublabel && o.sublabel.toLowerCase().includes(searchLower))
        );
    }, [options, search]);

    // Group filtered options
    const groupedOptions = useMemo(() => {
        if (!groupBy) return { '': filteredOptions };
        const groups: Record<string, AutocompleteOption[]> = {};
        for (const option of filteredOptions) {
            const group = option.group || '';
            if (!groups[group]) groups[group] = [];
            groups[group].push(option);
        }
        return groups;
    }, [filteredOptions, groupBy]);

    // Flat list for keyboard navigation
    const flatOptions = useMemo(() => {
        const flat: AutocompleteOption[] = [];
        for (const group of Object.keys(groupedOptions).sort()) {
            flat.push(...groupedOptions[group]);
        }
        return flat;
    }, [groupedOptions]);

    // Scroll highlighted option into view
    useEffect(() => {
        if (isOpen && listRef.current && highlightedIndex >= 0) {
            const items = listRef.current.querySelectorAll('[data-option]');
            const item = items[highlightedIndex] as HTMLElement;
            if (item) {
                item.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex, isOpen]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Reset highlighted index when search changes
    useEffect(() => {
        setHighlightedIndex(0);
    }, [search]);

    const handleSelect = useCallback((optionValue: string) => {
        onChange(optionValue);
        setSearch('');
        setIsOpen(false);
    }, [onChange]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(i => Math.min(i + 1, flatOptions.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(i => Math.max(i - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (flatOptions[highlightedIndex]) {
                    handleSelect(flatOptions[highlightedIndex].value);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                setSearch('');
                break;
            case 'Tab':
                setIsOpen(false);
                setSearch('');
                break;
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearch(e.target.value);
        if (!isOpen) setIsOpen(true);
    };

    const handleInputFocus = () => {
        setIsOpen(true);
    };

    const displayValue = isOpen ? search : (selectedOption?.label || value || '');

    return (
        <div ref={containerRef} className="relative">
            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={displayValue}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="w-full px-3 py-2.5 pr-8"
                />
                <button
                    type="button"
                    onClick={() => {
                        setIsOpen(!isOpen);
                        if (!isOpen) inputRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-300"
                >
                    <svg
                        className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </div>

            {isOpen && (
                <div
                    ref={listRef}
                    className="absolute z-50 w-full mt-1 max-h-60 overflow-auto bg-surface-800 border border-surface-700 rounded-lg shadow-lg"
                >
                    {flatOptions.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-surface-500">
                            No results found
                        </div>
                    ) : groupBy ? (
                        Object.entries(groupedOptions)
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([group, groupOptions]) => (
                                <div key={group}>
                                    {group && (
                                        <div className="px-3 py-1.5 text-xs font-semibold text-surface-400 bg-surface-900 sticky top-0">
                                            {group}
                                        </div>
                                    )}
                                    {groupOptions.map((option) => {
                                        const index = flatOptions.indexOf(option);
                                        return (
                                            <div
                                                key={option.value}
                                                data-option
                                                onClick={() => handleSelect(option.value)}
                                                className={`
                                                    px-3 py-2 cursor-pointer text-sm
                                                    ${index === highlightedIndex
                                                        ? 'bg-primary-600 text-white'
                                                        : 'text-surface-200 hover:bg-surface-700'
                                                    }
                                                    ${option.value === value ? 'font-medium' : ''}
                                                `}
                                            >
                                                <div>{option.label}</div>
                                                {option.sublabel && (
                                                    <div className={`text-xs ${index === highlightedIndex ? 'text-primary-200' : 'text-surface-500'}`}>
                                                        {option.sublabel}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))
                    ) : (
                        flatOptions.map((option, index) => (
                            <div
                                key={option.value}
                                data-option
                                onClick={() => handleSelect(option.value)}
                                className={`
                                    px-3 py-2 cursor-pointer text-sm
                                    ${index === highlightedIndex
                                        ? 'bg-primary-600 text-white'
                                        : 'text-surface-200 hover:bg-surface-700'
                                    }
                                    ${option.value === value ? 'font-medium' : ''}
                                `}
                            >
                                <div>{option.label}</div>
                                {option.sublabel && (
                                    <div className={`text-xs ${index === highlightedIndex ? 'text-primary-200' : 'text-surface-500'}`}>
                                        {option.sublabel}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
